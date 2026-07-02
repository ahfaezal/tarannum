try:
    from vosk import Model as VoskModel, KaldiRecognizer
    _HAS_VOSK = True
except Exception:
    VoskModel = None
    KaldiRecognizer = None
    _HAS_VOSK = False

import wave
import json
import re
from rapidfuzz import fuzz
import librosa
import numpy as np
from scipy.spatial.distance import euclidean, cosine
from scipy import signal as scipy_signal
from fastdtw import fastdtw
import logging
import warnings
from pathlib import Path
from pydub import AudioSegment
import tempfile
import os
from typing import Tuple, List, Dict, Union
from collections import Counter

# Suppress librosa warnings about audioread fallback (it still works)
warnings.filterwarnings("ignore", category=UserWarning, module="librosa")
warnings.filterwarnings("ignore", category=FutureWarning, module="librosa")

logger = logging.getLogger(__name__)

# Vosk model configuration
VOSK_MODEL_PATH = os.getenv(
    "VOSK_MODEL_PATH",
    str(Path(__file__).parent / "models")
)

# Model download configuration
VOSK_MODEL_DOWNLOAD_URL = os.getenv(
    "VOSK_MODEL_DOWNLOAD_URL",
    None  # Set to model URL if you want auto-download
)

# Check if model exists
VOSK_MODEL_AVAILABLE = os.path.exists(VOSK_MODEL_PATH) and _HAS_VOSK

# Auto-download model if not available (can be enabled via environment variable)
AUTO_DOWNLOAD_MODEL = os.getenv("AUTO_DOWNLOAD_MODEL", "false").lower() == "true"

if not VOSK_MODEL_AVAILABLE and AUTO_DOWNLOAD_MODEL:
    logger.info("Model not found, attempting to download...")
    try:
        from download_model import setup_model
        # Try to download model (use ar-mgb2 as default - smaller, faster)
        if setup_model(model_key="ar-mgb2", model_dir=Path(VOSK_MODEL_PATH)):
            VOSK_MODEL_AVAILABLE = os.path.exists(VOSK_MODEL_PATH) and _HAS_VOSK
            if VOSK_MODEL_AVAILABLE:
                logger.info("Model downloaded and available")
    except Exception as e:
        logger.warning(f"Auto-download failed: {e}. Model will not be available.")
        logger.info("Set AUTO_DOWNLOAD_MODEL=true to enable automatic download")

if VOSK_MODEL_AVAILABLE:
    logger.info(f"Vosk model available at: {VOSK_MODEL_PATH}")
else:
    logger.warning(f"Vosk model not available at: {VOSK_MODEL_PATH}")
    logger.info("To enable text extraction, download the model using: python backend/download_model.py")

# Global Vosk model reference (set from main.py startup for Railway memory efficiency)
_global_vosk_model = None

def set_global_vosk_model(model):
    """Set the global Vosk model (called from main.py startup)."""
    global _global_vosk_model
    _global_vosk_model = model
    logger.info("Global Vosk model set successfully")

def get_global_vosk_model():
    """Get the global Vosk model."""
    return _global_vosk_model

def convert_to_wav(input_path: str, preserve_quality: bool = True) -> str:
    """
    Convert audio file to WAV format that librosa can read.
    Preserves original quality by default.
    
    For MP3 files: Uses librosa directly (no ffmpeg needed for local dev)
    For WebM/other formats: Uses pydub/ffmpeg (requires ffmpeg)
    
    Args:
        input_path: Path to audio file
        preserve_quality: If True, maintain original sample rate/bit depth
        
    Returns:
        Path to converted WAV file (temporary if conversion needed, or original if WAV)
    """
    input_path_obj = Path(input_path)
    
    # If already WAV, return as-is (no conversion needed)
    if input_path_obj.suffix.lower() == '.wav':
        return input_path
    
    # For MP3 files: librosa can load directly without conversion
    # This works for local development without ffmpeg
    if input_path_obj.suffix.lower() == '.mp3':
        logger.info(f"MP3 file detected - librosa can load directly, no conversion needed")
        return input_path  # librosa.load() can handle MP3 directly
    
    # For WebM and other formats: need pydub/ffmpeg
    try:
        logger.info(f"Converting {input_path_obj.suffix} to high-quality WAV using pydub/ffmpeg...")
        
        # Load audio with pydub (supports WebM via ffmpeg)
        audio = AudioSegment.from_file(input_path)
        
        # Preserve original quality: don't resample or reduce bit depth
        # Only convert container format
        if preserve_quality:
            # Keep original sample rate and bit depth
            logger.info(f"Preserving quality: {audio.frame_rate}Hz, {audio.sample_width * 8}-bit")
        else:
            # For specific use cases: convert to 16kHz mono 16-bit
            audio = audio.set_channels(1)
            audio = audio.set_sample_width(2)
            audio = audio.set_frame_rate(16000)
        
        # Create temporary WAV file
        temp_wav = tempfile.NamedTemporaryFile(
            delete=False, 
            suffix='.wav',
            dir=input_path_obj.parent
        )
        temp_wav_path = temp_wav.name
        temp_wav.close()
        
        # Export as WAV (preserves quality)
        audio.export(temp_wav_path, format='wav')
        logger.info(f"Converted to WAV: {temp_wav_path}")
        
        return temp_wav_path
    except Exception as e:
        logger.error(f"Error converting audio: {e}")
        # Check if ffmpeg is missing
        if "ffmpeg" in str(e).lower() or "no such file" in str(e).lower() or "cannot find the file" in str(e).lower():
            raise ValueError(
                f"ffmpeg not found. Required for {input_path_obj.suffix} files. "
                "For local development: Install ffmpeg or use MP3/WAV files. "
                "For Railway: nixpacks.toml includes ffmpeg dependency."
            )
        raise ValueError(f"Failed to convert audio format: {str(e)}")

def convert_to_wav_for_vosk(input_path: str) -> str:
    """
    Convert audio to PCM WAV specifically for Vosk (16kHz mono).
    ONLY creates temporary copy - original file never modified.
    
    This is ONLY used for text extraction, not for audio playback or pitch analysis.
    Original audio quality is never affected.
    
    Uses librosa as fallback if ffmpeg is not available (for local development).
    
    Args:
        input_path: Path to original audio file
        
    Returns:
        Path to temporary converted WAV file (must be deleted after use)
    """
    input_path_obj = Path(input_path)
    
    # Try pydub/ffmpeg first (preferred method)
    try:
        logger.info(f"Creating Vosk-compatible copy (16kHz mono) using pydub/ffmpeg...")
        
        # Load original audio with pydub (requires ffmpeg)
        audio = AudioSegment.from_file(input_path)
        
        # CRITICAL: Normalize audio volume to improve recognition
        # This ensures consistent volume levels which helps Vosk recognize words better
        audio = audio.normalize()
        
        # Convert to Vosk requirements (low quality, but only for speech recognition)
        audio = audio.set_channels(1)  # Mono
        audio = audio.set_sample_width(2)  # 16-bit
        audio = audio.set_frame_rate(16000)  # 16kHz (Vosk requirement)
        
        # Apply simple noise reduction (high-pass filter to remove low-frequency noise)
        try:
            # Remove very low frequencies (usually noise, not speech)
            audio = audio.high_pass_filter(80)  # Remove frequencies below 80Hz
            logger.debug("Applied high-pass filter for noise reduction")
        except Exception as e:
            logger.debug(f"Could not apply high-pass filter: {e}")
        
        # Create temporary WAV file
        temp_wav = tempfile.NamedTemporaryFile(
            delete=False, 
            suffix='.wav',
            dir=input_path_obj.parent
        )
        temp_wav_path = temp_wav.name
        temp_wav.close()
        
        # Export as PCM WAV
        audio.export(temp_wav_path, format='wav', parameters=['-acodec', 'pcm_s16le'])
        logger.info(f"Created Vosk copy using pydub: {temp_wav_path}")
        
        return temp_wav_path
    except Exception as e:
        # Check if ffmpeg is missing - fallback to librosa + scipy
        if "ffmpeg" in str(e).lower() or "no such file" in str(e).lower() or "cannot find the file" in str(e).lower():
            logger.warning(f"ffmpeg not available, using librosa+scipy fallback for Vosk conversion")
            try:
                # Fallback: Use librosa to load and resample, then save as WAV with scipy
                from scipy.io import wavfile
                
                # Load audio with librosa (can handle MP3 without ffmpeg)
                audio_data, sr = librosa.load(input_path, sr=16000, mono=True)
                logger.info(f"Loaded audio with librosa: {len(audio_data)} samples at {sr}Hz")
                
                # Convert to int16 format (16-bit PCM)
                # librosa returns float32 in range [-1, 1], need to convert to int16
                audio_int16 = (audio_data * 32767).astype(np.int16)
                
                # Create temporary WAV file
                temp_wav = tempfile.NamedTemporaryFile(
                    delete=False, 
                    suffix='.wav',
                    dir=input_path_obj.parent
                )
                temp_wav_path = temp_wav.name
                temp_wav.close()
                
                # Save as 16-bit PCM WAV using scipy
                wavfile.write(temp_wav_path, 16000, audio_int16)
                logger.info(f"Created Vosk copy using librosa+scipy: {temp_wav_path}")
                
                return temp_wav_path
            except Exception as librosa_error:
                logger.error(f"Librosa fallback also failed: {librosa_error}")
                raise ValueError(
                    f"Failed to create Vosk-compatible copy. "
                    f"ffmpeg error: {e}. "
                    f"Librosa fallback error: {librosa_error}. "
                    "For local development: Install ffmpeg or ensure scipy is installed. "
                    "For Railway: nixpacks.toml includes ffmpeg dependency."
                )
        else:
            # Other error from pydub
            logger.error(f"Error creating Vosk copy with pydub: {e}")
            raise ValueError(f"Failed to create Vosk-compatible copy: {str(e)}")

def reduce_noise(audio: np.ndarray, sr: int) -> np.ndarray:
    """
    Reduce noise from audio using high-pass filtering and spectral subtraction.
    
    Techniques:
    1. High-pass filter to remove low-frequency noise (< 80 Hz)
    2. Spectral subtraction to suppress noise floor
    3. Soft thresholding to preserve voice quality
    
    Args:
        audio: Audio signal as numpy array
        sr: Sample rate
        
    Returns:
        Denoised audio signal
    """
    try:
        if len(audio) < 2048:
            logger.warning("Audio too short for noise reduction, skipping")
            return audio
        
        # 1. High-pass filter: remove low-frequency noise (rumble, wind, etc.)
        # Voice typically starts around 80-100 Hz, so filter below that
        nyquist = sr / 2.0
        low_cutoff = 80.0  # Hz - remove frequencies below this
        
        # Design Butterworth high-pass filter (4th order)
        sos = scipy_signal.butter(4, low_cutoff / nyquist, btype='high', output='sos')
        audio_filtered = scipy_signal.sosfilt(sos, audio)
        
        # 2. Spectral subtraction for noise reduction
        # Compute short-time Fourier transform
        stft = librosa.stft(audio_filtered, n_fft=2048, hop_length=512)
        magnitude = np.abs(stft)
        phase = np.angle(stft)
        
        # Estimate noise floor from first 0.3 seconds (assuming it starts quiet)
        noise_frames = max(1, int(0.3 * sr / 512))  # Number of frames in 0.3s
        noise_estimate = np.mean(magnitude[:, :noise_frames], axis=1, keepdims=True)
        
        # Spectral subtraction with over-subtraction factor
        alpha = 2.0  # Over-subtraction factor (more aggressive noise removal)
        magnitude_clean = magnitude - alpha * noise_estimate
        
        # Floor: keep at least 10% of original magnitude to avoid artifacts
        magnitude_clean = np.maximum(magnitude_clean, 0.1 * magnitude)
        
        # Reconstruct signal
        stft_clean = magnitude_clean * np.exp(1j * phase)
        audio_clean = librosa.istft(stft_clean, hop_length=512)
        
        # Ensure output length matches input (librosa.istft may slightly differ)
        if len(audio_clean) != len(audio_filtered):
            if len(audio_clean) > len(audio_filtered):
                audio_clean = audio_clean[:len(audio_filtered)]
            else:
                # Pad with zeros if shorter
                padding = np.zeros(len(audio_filtered) - len(audio_clean))
                audio_clean = np.concatenate([audio_clean, padding])
        
        return audio_clean.astype(audio.dtype)
        
    except Exception as e:
        logger.warning(f"Error in noise reduction: {e}, using original audio", exc_info=True)
        return audio

def preprocess_audio(audio: np.ndarray, sr: int, reduce_noise_flag: bool = True, preserve_timing: bool = False) -> np.ndarray:
    """
    Preprocess audio: reduce noise, optionally trim silence, normalize volume.

    Args:
        audio: Audio signal as numpy array
        sr: Sample rate
        reduce_noise_flag: If True, apply noise reduction (default: True)
        preserve_timing: If True, DO NOT trim leading/trailing silence (keeps full duration)

    Returns:
        Preprocessed audio signal
    """
    # 1. Noise reduction (if enabled and audio is long enough)
    if reduce_noise_flag and len(audio) > 2048:
        try:
            logger.info("Applying noise reduction...")
            audio = reduce_noise(audio, sr)
            logger.info(f"After noise reduction: {len(audio)} samples")
        except Exception as e:
            logger.warning(f"Noise reduction failed, continuing without it: {e}")

    # 2. Trim leading and trailing silence only when preserve_timing is False
    if preserve_timing:
        audio_trimmed = audio
    else:
        try:
            audio_trimmed, _ = librosa.effects.trim(audio, top_db=20)
        except Exception as e:
            logger.warning(f"librosa.effects.trim failed: {e}. Using original audio for trimming step.")
            audio_trimmed = audio

    # 3. Normalize audio to prevent volume differences from affecting scoring
    try:
        audio_normalized = librosa.util.normalize(audio_trimmed)
    except Exception:
        # If normalization fails (extremely quiet audio), fallback to original trimmed audio
        audio_normalized = audio_trimmed

    return audio_normalized

def hz_to_midi(freq_hz: float) -> Union[float, None]:
    """
    Convert frequency in Hz to MIDI note number.
    
    Formula: midi = 69 + 12 * log2(freq / 440)
    Where 69 is MIDI note A4 (440 Hz)
    
    Args:
        freq_hz: Frequency in Hz
        
    Returns:
        MIDI note number (float) or None if freq_hz <= 0
    """
    if freq_hz <= 0 or np.isnan(freq_hz) or not np.isfinite(freq_hz):
        return None
    try:
        midi = 69 + 12 * np.log2(freq_hz / 440.0)
        return float(midi)
    except (ValueError, OverflowError):
        return None

def extract_text_from_audio(audio_path: str, model_path: str = None, use_global_model: bool = True) -> List[Dict]:
    """
    Extract text from audio using Vosk speech recognition.
    
    IMPORTANT: Uses global model loaded at startup (memory efficient for Railway).
    Creates temporary low-quality copy for Vosk only - original audio never modified.
    
    Args:
        audio_path: Path to audio file
        model_path: Path to Vosk model directory (only used if use_global_model=False)
        use_global_model: If True, use globally loaded model (recommended for Railway)
        
    Returns:
        List of dictionaries with 'start', 'end', and 'text' fields
    """
    if not _HAS_VOSK:
        logger.warning("Vosk not available - cannot extract text from audio")
        return []
    
    # Use global model if available (loaded at startup - Railway memory efficient)
    model = None
    if use_global_model:
        model = get_global_vosk_model()
        if model is not None:
            logger.info("Using globally loaded Vosk model (Railway memory efficient)")
    
    # Fallback: load model if global not available (not recommended for Railway)
    if model is None:
        if model_path is None:
            model_path = VOSK_MODEL_PATH
        
        if not os.path.exists(model_path):
            logger.error(f"Vosk model path does not exist: {model_path}")
            return []
        
        try:
            logger.warning("Loading Vosk model on-demand (NOT recommended for Railway - uses too much memory)")
            model = VoskModel(model_path)
        except Exception as e:
            logger.error(f"Failed to load Vosk model: {e}")
            return []
    
    if model is None:
        logger.error("Vosk model not available")
        return []
    
    vosk_wav_path = None
    wf = None
    
    try:
        # Create separate low-quality copy ONLY for Vosk
        # Original audio file remains untouched
        vosk_wav_path = convert_to_wav_for_vosk(audio_path)
        
        # Open the Vosk copy
        wf = wave.open(vosk_wav_path, "rb")
        
        # Verify format (should already be correct from conversion)
        if wf.getnchannels() != 1:
            logger.warning(f"Audio is not mono: {wf.getnchannels()} channels")
        if wf.getsampwidth() != 2:
            logger.warning(f"Audio is not 16-bit: {wf.getsampwidth()} bytes per sample")
        if wf.getcomptype() != "NONE":
            logger.warning(f"Audio is compressed: {wf.getcomptype()}")
        
        # Create recognizer with word timings
        rec = KaldiRecognizer(model, wf.getframerate())
        rec.SetWords(True)  # Enable word-level timings
        
        words = []
        chunk_size = 4000  # Process 4KB at a time
        total_frames = wf.getnframes()
        sample_rate = wf.getframerate()
        
        logger.info(f"Processing audio: {total_frames} frames at {sample_rate} Hz")
        
        # Process audio in chunks - CRITICAL: Process ALL chunks to capture all words
        # Use smaller chunks for better word detection (more frequent recognition)
        chunk_count = 0
        words_from_chunks = 0
        
        # CRITICAL: Use smaller chunk size for better word detection
        # Smaller chunks = more frequent recognition = better word capture
        optimized_chunk_size = min(chunk_size, 2000)  # Use smaller chunks for better detection
        
        while True:
            data = wf.readframes(optimized_chunk_size)
            if len(data) == 0:
                break
            
            chunk_count += 1
            
            # CRITICAL: Process chunk - AcceptWaveform returns True when a phrase is recognized
            # When it returns True, we should get the Result() to extract words
            if rec.AcceptWaveform(data):
                # Phrase recognized - extract words
                result = json.loads(rec.Result())
                if 'result' in result and len(result['result']) > 0:
                    chunk_words = result['result']
                    words.extend(chunk_words)
                    words_from_chunks += len(chunk_words)
                    logger.debug(f"Chunk {chunk_count}: Extracted {len(chunk_words)} words: {[w.get('word', '') for w in chunk_words[:3]]}")
        
        # CRITICAL: Get final result - this contains any remaining words not yet finalized
        # This is ESSENTIAL - many words are only in the final result
        final_result_str = rec.FinalResult()
        final_result = json.loads(final_result_str) if final_result_str else {}
        final_words = []
        if 'result' in final_result and len(final_result['result']) > 0:
            final_words = final_result['result']
            words.extend(final_words)
            logger.debug(f"Final result: Extracted {len(final_words)} words: {[w.get('word', '') for w in final_words[:3]]}")
        
        # Remove duplicate words (same word at same time - can happen with overlapping chunks)
        # Sort by start time and remove duplicates
        seen = {}
        unique_words = []
        for word in words:
            key = (word.get('word', ''), round(word.get('start', 0), 2))
            if key not in seen:
                seen[key] = True
                unique_words.append(word)
        
        if len(unique_words) != len(words):
            logger.info(f"Removed {len(words) - len(unique_words)} duplicate words")
        
        # CRITICAL: Sort words by start time to ensure chronological order
        words = sorted(unique_words, key=lambda w: w.get('start', 0))
        
        logger.info(f"✅ Final word count: {len(words)} unique words (sorted by time)")
        
        logger.info(f"✅ Vosk extracted {len(words)} total words from audio")
        logger.info(f"   - Words from chunks: {words_from_chunks}, Words from final: {len(final_words)}")
        
        if len(words) > 0:
            # Log first few and last few words for debugging
            first_words = [w.get('word', '') for w in words[:5]]
            last_words = [w.get('word', '') for w in words[-5:]] if len(words) > 5 else []
            logger.info(f"   - First words: {first_words}")
            if last_words:
                logger.info(f"   - Last words: {last_words}")
            logger.info(f"   - Time range: {words[0].get('start', 0):.2f}s to {words[-1].get('end', 0):.2f}s")
        else:
            logger.warning("⚠️ Vosk did not recognize any words from audio - check audio quality, volume, or speech clarity")
        
        # Get audio duration for full coverage
        try:
            audio_duration = librosa.get_duration(path=audio_path)
        except Exception as e:
            logger.warning(f"Could not get audio duration: {e}, using word timings")
            audio_duration = words[-1].get('end', 0.0) if words else 0.0
        
        if not words:
            logger.warning("Speech recognition returned no results")
            # Still create segments covering full duration even if no words
            if audio_duration > 0:
                num_segments = max(5, min(20, int(audio_duration / 2)))
                segment_duration = audio_duration / num_segments
                ayah_timing = []
                for i in range(num_segments):
                    ayah_timing.append({
                        'start': float(i * segment_duration),
                        'end': float((i + 1) * segment_duration) if i < num_segments - 1 else float(audio_duration),
                        'text': ""  # Empty text for unrecognized segments
                    })
                logger.info(f"Created {len(ayah_timing)} empty segments covering {audio_duration:.2f}s duration")
                return ayah_timing
            return []
        
        # Convert words to timing segments (group words into phrases)
        # CRITICAL: Include ALL words and cover FULL audio duration
        ayah_timing = []
        current_text = ""
        segment_start = 0.0
        segment_duration_target = 2.0  # Target 2 seconds per segment
        
        # Filter out empty words but keep track of all valid words
        valid_words = [w for w in words if w.get('word', '').strip()]
        logger.info(f"📝 Processing {len(valid_words)} valid words out of {len(words)} total words")
        
        # Log all recognized words for debugging (limit to first 20 to avoid log spam)
        if len(valid_words) > 0:
            word_list = [w.get('word', '') for w in valid_words[:20]]
            logger.info(f"📝 Recognized words ({len(valid_words)} total): {word_list}{'...' if len(valid_words) > 20 else ''}")
        else:
            logger.warning("⚠️ No valid words found - audio might be unclear, too quiet, or not contain speech")
        
        if not valid_words:
            logger.warning("No valid words found after filtering")
            # Create empty segments covering full duration
            if audio_duration > 0:
                num_segments = max(5, min(20, int(audio_duration / 2)))
                segment_duration = audio_duration / num_segments
                for i in range(num_segments):
                    ayah_timing.append({
                        'start': float(i * segment_duration),
                        'end': float((i + 1) * segment_duration) if i < num_segments - 1 else float(audio_duration),
                        'text': ""
                    })
                return ayah_timing
        
        for i, word_info in enumerate(valid_words):
            word = word_info.get('word', '').strip()
            start = word_info.get('start', 0.0)
            end = word_info.get('end', 0.0)
            
            if i == 0:
                segment_start = start
                current_text = word
                # If first word doesn't start at 0, create empty segment for beginning
                if start > 0.1:
                    ayah_timing.append({
                        'start': 0.0,
                        'end': float(start),
                        'text': ""
                    })
            elif (end - segment_start) > segment_duration_target:
                # Save previous segment (include ALL words collected)
                prev_end = valid_words[i-1].get('end', end) if i > 0 else end
                ayah_timing.append({
                    'start': float(segment_start),
                    'end': float(prev_end),
                    'text': current_text.strip()
                })
                # Start new segment
                segment_start = start
                current_text = word
                # Fill gap if there's a time gap between segments
                if prev_end < start - 0.1:
                    ayah_timing.append({
                        'start': float(prev_end),
                        'end': float(start),
                        'text': ""
                    })
            else:
                # Add word to current segment (include ALL words - no skipping)
                current_text += " " + word
        
        # Add final segment with all remaining words
        if current_text:
            last_end = valid_words[-1].get('end', 0.0) if valid_words else 0.0
            ayah_timing.append({
                'start': float(segment_start),
                'end': float(last_end),
                'text': current_text.strip()
            })
        
            # CRITICAL: Ensure final segment extends to audio duration
            if audio_duration > 0 and last_end < audio_duration - 0.1:
                ayah_timing.append({
                    'start': float(last_end),
                    'end': float(audio_duration),
                    'text': ""
                })
        else:
            # No words in final segment, but ensure we cover to end
            if audio_duration > 0 and len(ayah_timing) > 0:
                last_segment_end = ayah_timing[-1].get('end', 0.0)
                if last_segment_end < audio_duration - 0.1:
                    ayah_timing.append({
                        'start': float(last_segment_end),
                        'end': float(audio_duration),
                        'text': ""
                    })
            elif audio_duration > 0 and len(ayah_timing) == 0:
                # No segments at all, create one covering full duration
                ayah_timing.append({
                    'start': 0.0,
                    'end': float(audio_duration),
                    'text': ""
                })
        
        # Final validation: ensure we have segments and they cover full duration
        if len(ayah_timing) > 0:
            final_coverage = ayah_timing[-1]['end']
            words_in_segments = sum(len(seg.get('text', '').split()) for seg in ayah_timing if seg.get('text', '').strip())
            logger.info(f"Extracted {len(ayah_timing)} text segments with {len(valid_words)} words from audio")
            logger.info(f"  - Duration: {audio_duration:.2f}s, Coverage: {final_coverage:.2f}s")
            logger.info(f"  - Words in segments: {words_in_segments}, Total valid words: {len(valid_words)}")
            logger.info(f"  - Segments with text: {sum(1 for seg in ayah_timing if seg.get('text', '').strip())}")
            
            # Double-check coverage
            if final_coverage < audio_duration - 0.1:
                logger.warning(f"⚠️ Segments don't cover full duration! Adding final segment...")
                ayah_timing.append({
                    'start': float(final_coverage),
                    'end': float(audio_duration),
                    'text': ""
                })
                logger.info(f"  - Updated coverage: {ayah_timing[-1]['end']:.2f}s")
        else:
            logger.warning("No text segments created!")
        
        return ayah_timing
        
    except wave.Error as e:
        logger.error(f"WAV file error: {e} - file may not be proper PCM WAV format")
        return []
    except Exception as e:
        logger.error(f"Error extracting text from audio: {e}", exc_info=True)
        return []
    finally:
        # ALWAYS clean up temporary Vosk copy
        if wf is not None:
            try:
                wf.close()
            except:
                pass
        if vosk_wav_path and vosk_wav_path != audio_path and os.path.exists(vosk_wav_path):
            try:
                os.remove(vosk_wav_path)
                logger.info(f"Cleaned up temporary Vosk copy: {vosk_wav_path}")
            except Exception as e:
                logger.warning(f"Could not delete Vosk temp file: {e}")

def extract_ayah_timing(audio_path: str, audio_duration: float, reference_title: str = "None", use_speech_recognition: bool = True) -> List[Dict]:
    """
    Extract ayah text with timing from audio using speech recognition.
    NO PLACEHOLDER TEXT - only returns actual extracted text or empty list.
    
    Args:
        audio_path: Path to audio file
        audio_duration: Duration of audio in seconds
        reference_title: Optional title/identifier for the reference
        use_speech_recognition: If True, use Vosk to extract actual text (default: True)
        
    Returns:
        List of dictionaries with 'start', 'end', and 'text' fields
        Returns empty list if extraction fails (no placeholder text)
    """
    try:
        # Try to extract actual text from audio using speech recognition
        if use_speech_recognition and VOSK_MODEL_AVAILABLE:
            logger.info("Attempting to extract Arabic text from audio using Vosk...")
            extracted_text = extract_text_from_audio(audio_path)
            
            if extracted_text and len(extracted_text) > 0:
                logger.info(f"Successfully extracted {len(extracted_text)} text segments from audio")
                # Ensure segments cover full duration
                if extracted_text[-1]['end'] < audio_duration * 0.9:
                    extracted_text[-1]['end'] = float(audio_duration)
                return extracted_text
            else:
                logger.warning("Speech recognition returned no results")
                return []
        elif use_speech_recognition and not VOSK_MODEL_AVAILABLE:
            logger.warning("Vosk model not available - cannot extract text")
            return []
        
        # No fallback - return empty list if speech recognition is disabled
        logger.info("Speech recognition disabled - returning empty text segments")
        return []
        
    except Exception as e:
        logger.error(f"Error extracting ayah timing: {e}", exc_info=True)
        return []

def downsample_pitch(pitch_data: List[Dict],
                     duration_seconds: float = None,
                     target_hop_ms: float = 15.0,
                     gap_fill_ms: float = 150.0) -> List[Dict]:
    """
    Downsample pitch data onto a uniform time grid.
    - If duration_seconds is provided, grid spans 0.0 .. duration_seconds (preserves leading/trailing silence).
    - Interpolates only short internal gaps <= gap_fill_ms; leaves long gaps and edges as None.

    Args:
        pitch_data: List of {'time', 'f_hz', 'midi', 'confidence'}
        duration_seconds: optional total duration (seconds). If None, uses min/max of pitch_data times.
        target_hop_ms: grid hop in milliseconds
        gap_fill_ms: maximum gap size to fill (ms)

    Returns:
        List of dicts with keys: time, f_hz (float or None), midi (float or None), confidence
    """
    # If no pitch data, produce a grid of None if duration provided, else empty
    if not pitch_data or len(pitch_data) == 0:
        if duration_seconds is None or duration_seconds <= 0:
            return []
        hop_sec = target_hop_ms / 1000.0
        target_times = np.arange(0.0, duration_seconds + hop_sec / 2, hop_sec)
        return [{'time': float(t), 'f_hz': None, 'midi': None, 'confidence': 0.0} for t in target_times]

    # Source arrays
    src_times = np.array([p['time'] for p in pitch_data], dtype=float)
    src_f = np.array([p.get('f_hz') if p.get('f_hz') is not None else np.nan for p in pitch_data], dtype=float)
    src_midi = np.array([p.get('midi') if p.get('midi') is not None else np.nan for p in pitch_data], dtype=float)
    src_conf = np.array([p.get('confidence', 0.0) for p in pitch_data], dtype=float)

    # Determine target time range
    if duration_seconds is not None and duration_seconds > 0:
        min_time = 0.0
        max_time = float(duration_seconds)
    else:
        min_time = float(np.min(src_times))
        max_time = float(np.max(src_times))

    if max_time <= min_time:
        # Degenerate case: return original mapped to target hop
        return [{
            'time': float(t),
            'f_hz': None,
            'midi': None,
            'confidence': 0.0
        } for t in np.arange(min_time, min_time + 0.001, 0.001)]

    # Build grid
    hop_sec = target_hop_ms / 1000.0
    target_times = np.arange(min_time, max_time + hop_sec / 2, hop_sec)

    # Interpolate using only finite values for frequency
    valid_mask = np.isfinite(src_f)
    if np.sum(valid_mask) == 0:
        # no voiced frames -> all None
        return [{'time': float(t), 'f_hz': None, 'midi': None, 'confidence': 0.0} for t in target_times]

    # Perform interpolation; left/right extrapolate as NaN
    f_interp = np.interp(target_times, src_times[valid_mask], src_f[valid_mask], left=np.nan, right=np.nan)
    conf_interp = np.interp(target_times, src_times, src_conf, left=0.0, right=0.0)

    # Identify NaN runs and fill only short internal gaps
    is_nan = np.isnan(f_interp)
    if np.any(is_nan):
        nan_idx = np.where(is_nan)[0]
        groups = np.split(nan_idx, np.where(np.diff(nan_idx) != 1)[0] + 1)
        gap_fill_frames = max(1, int(np.round(gap_fill_ms / target_hop_ms)))

        for g in groups:
            start = int(g[0])
            end = int(g[-1])
            run_len = end - start + 1
            is_leading = (start == 0)
            is_trailing = (end == len(f_interp) - 1)

            # Only fill internal & short gaps
            if (not is_leading) and (not is_trailing) and run_len <= gap_fill_frames:
                left_idx = start - 1
                right_idx = end + 1
                if np.isfinite(f_interp[left_idx]) and np.isfinite(f_interp[right_idx]):
                    left_val = f_interp[left_idx]
                    right_val = f_interp[right_idx]
                    for k, idx in enumerate(range(start, end + 1), start=1):
                        alpha = k / (run_len + 1)
                        f_interp[idx] = left_val * (1 - alpha) + right_val * alpha
                        conf_interp[idx] = min(conf_interp[left_idx], conf_interp[right_idx]) * 0.6
                else:
                    # Leave as NaN if neighbors not finite
                    for idx in range(start, end + 1):
                        f_interp[idx] = np.nan
                        conf_interp[idx] = 0.0
            else:
                # Leading/trailing/long gap => keep as NaN (represents silence)
                for idx in range(start, end + 1):
                    f_interp[idx] = np.nan
                    conf_interp[idx] = 0.0

    # Build output list: convert NaN -> None and compute midi when f_hz exists
    downsampled = []
    for t, f_val, conf in zip(target_times, f_interp, conf_interp):
        if np.isfinite(f_val) and f_val > 0:
            midi_val = hz_to_midi(float(f_val))
            downsampled.append({
                'time': float(t),
                'f_hz': float(f_val),
                'midi': float(midi_val) if midi_val is not None else None,
                'confidence': float(conf)
            })
        else:
            downsampled.append({
                'time': float(t),
                'f_hz': None,
                'midi': None,
                'confidence': 0.0
            })

    logger.info(f"Downsampled pitch data: {len(pitch_data)} -> {len(downsampled)} points (hop: {target_hop_ms}ms), duration_grid={min_time:.3f}-{max_time:.3f}s")
    return downsampled

def calculate_pitch_quality_metrics(
    pitch_data: List[Dict],
    audio: np.ndarray = None,
    sr: int = None
) -> Dict[str, float]:
    """
    Calculate comprehensive pitch data quality metrics.
    
    Returns:
        Dictionary with:
        - qualityScore: Overall quality score (0-100)
        - snrEstimate: Signal-to-noise ratio estimate (dB)
        - reliability: Pitch detection reliability (0-1)
        - coverage: Percentage of time with valid pitch
        - confidenceMean: Mean confidence score
    """
    try:
        if not pitch_data or len(pitch_data) == 0:
            return {
                'qualityScore': 0.0,
                'snrEstimate': 0.0,
                'reliability': 0.0,
                'coverage': 0.0,
                'confidenceMean': 0.0
            }
        
        # Extract valid pitch points
        valid_pitches = [p for p in pitch_data if p.get('f_hz') is not None and p.get('f_hz', 0) > 0]
        total_points = len(pitch_data)
        valid_count = len(valid_pitches)
        
        # Coverage: percentage of time with valid pitch
        coverage = (valid_count / total_points) * 100.0 if total_points > 0 else 0.0
        
        # Mean confidence
        confidences = [p.get('confidence', 0.0) for p in valid_pitches]
        confidence_mean = np.mean(confidences) if confidences else 0.0
        
        # Reliability: based on confidence and coverage
        reliability = (confidence_mean * 0.6 + (coverage / 100.0) * 0.4)
        
        # SNR estimation (if audio provided)
        snr_estimate = 0.0
        if audio is not None and len(audio) > 0:
            # Estimate SNR using energy ratio
            signal_energy = np.mean(np.abs(audio) ** 2)
            # Estimate noise from low-energy regions
            energy_threshold = np.percentile(np.abs(audio), 25)  # Bottom 25% as noise
            noise_energy = np.mean(np.abs(audio[np.abs(audio) < energy_threshold]) ** 2) if np.any(np.abs(audio) < energy_threshold) else signal_energy * 0.01
            
            if noise_energy > 0:
                snr_estimate = 10.0 * np.log10(signal_energy / noise_energy) if signal_energy > 0 else 0.0
            else:
                snr_estimate = 60.0  # Very clean signal
        
        # Quality score: weighted combination
        coverage_score = min(100.0, coverage * 1.2)  # Coverage up to ~83% = 100
        confidence_score = confidence_mean * 100.0
        snr_score = min(100.0, max(0.0, (snr_estimate + 20) / 0.8))  # -20dB to 60dB -> 0-100
        
        quality_score = (coverage_score * 0.4 + confidence_score * 0.4 + snr_score * 0.2)
        
        return {
            'qualityScore': float(max(0.0, min(100.0, quality_score))),
            'snrEstimate': float(snr_estimate),
            'reliability': float(max(0.0, min(1.0, reliability))),
            'coverage': float(coverage),
            'confidenceMean': float(confidence_mean)
        }
    except Exception as e:
        logger.warning(f"Error calculating pitch quality metrics: {e}", exc_info=True)
        return {
            'qualityScore': 0.0,
            'snrEstimate': 0.0,
            'reliability': 0.0,
            'coverage': 0.0,
            'confidenceMean': 0.0
        }

def adaptive_confidence_threshold(
    confidences: np.ndarray,
    quality_metrics: Dict[str, float] = None
) -> float:
    """
    Calculate adaptive confidence threshold based on audio quality.
    
    Args:
        confidences: Array of confidence values
        quality_metrics: Optional quality metrics dict
    
    Returns:
        Adaptive confidence threshold (0-1)
    """
    if confidences.size == 0:
        return 0.3  # Default fallback
    
    # Base threshold
    base_threshold = 0.3
    
    # Adjust based on quality metrics if available
    if quality_metrics:
        quality_score = quality_metrics.get('qualityScore', 50.0)
        reliability = quality_metrics.get('reliability', 0.5)
        
        # Lower threshold for high-quality audio (more lenient)
        # Higher threshold for low-quality audio (more strict)
        if quality_score > 70:
            # High quality: be more lenient
            adaptive_threshold = base_threshold * 0.7  # ~0.21
        elif quality_score < 30:
            # Low quality: be more strict
            adaptive_threshold = base_threshold * 1.5  # ~0.45
        else:
            # Medium quality: use base
            adaptive_threshold = base_threshold
        
        # Further adjust based on reliability
        if reliability < 0.5:
            adaptive_threshold *= 1.2  # More strict for unreliable detection
    else:
        # Fallback: use percentile-based adaptive threshold
        median_conf = np.median(confidences)
        if median_conf > 0.7:
            adaptive_threshold = base_threshold * 0.8  # High confidence -> more lenient
        elif median_conf < 0.4:
            adaptive_threshold = base_threshold * 1.3  # Low confidence -> more strict
        else:
            adaptive_threshold = base_threshold
    
    return float(max(0.1, min(0.6, adaptive_threshold)))  # Clamp to reasonable range

def detect_pronunciation_confusion(
    student_audio_path: str,
    expected_text_segments: List[Dict] = None,
    confidence_threshold: float = 0.6
) -> List[Dict]:
    """
    Detect pronunciation confusion alerts for selected Arabic letter pairs.
    
    Beta feature - may have false positives. Training assistance only, not full tajwid validation.
    
    Detects confusion pairs:
    - ذ (dhal, U+0630) vs ز (zay, U+0632)
    - ص (sad, U+0635) vs س (sin, U+0633)
    
    Args:
        student_audio_path: Path to student audio file
        expected_text_segments: Optional list of expected text segments with timing
                               Format: [{'start': float, 'end': float, 'text': str}, ...]
        confidence_threshold: Minimum confidence for alert (default: 0.6)
    
    Returns:
        List of alert dicts: [{'time': float, 'expected': str, 'detected': str, 'confidence': float}, ...]
    """
    try:
        if not VOSK_MODEL_AVAILABLE or not _HAS_VOSK:
            logger.warning("Vosk not available - cannot detect pronunciation confusion")
            return []
        
        # Extract word-level text from student audio using Vosk directly
        # We need word-level data with confidence scores, not just segments
        recognized_words_list = []
        
        if not _HAS_VOSK:
            logger.warning("Vosk not available - cannot detect pronunciation confusion")
            return []
        
        model = get_global_vosk_model()
        if model is None:
            logger.warning("Vosk model not loaded - cannot detect pronunciation confusion")
            return []
        
        vosk_wav_path = None
        wf = None
        
        try:
            # Create Vosk-compatible copy
            vosk_wav_path = convert_to_wav_for_vosk(student_audio_path)
            wf = wave.open(vosk_wav_path, "rb")
            
            # Create recognizer with word timings
            rec = KaldiRecognizer(model, wf.getframerate())
            rec.SetWords(True)
            
            words = []
            chunk_size = 4000
            
            # Process audio in chunks
            while True:
                data = wf.readframes(chunk_size)
                if len(data) == 0:
                    break
                
                if rec.AcceptWaveform(data):
                    result = json.loads(rec.Result())
                    if 'result' in result:
                        words.extend(result['result'])
            
            # Get final result
            final_result = json.loads(rec.FinalResult())
            if 'result' in final_result:
                words.extend(final_result['result'])
            
            if not words:
                logger.info("No recognized words from student audio - cannot detect pronunciation confusion")
                return []
            
            # Convert to our format
            recognized_words_list = [
                {
                    'word': w.get('word', '').strip(),
                    'start': float(w.get('start', 0.0)),
                    'end': float(w.get('end', 0.0)),
                    'conf': float(w.get('conf', 0.0))
                }
                for w in words
            ]
            
        except Exception as e:
            logger.warning(f"Error extracting words for pronunciation detection: {e}", exc_info=True)
            return []
        finally:
            if wf is not None:
                try:
                    wf.close()
                except:
                    pass
            if vosk_wav_path and vosk_wav_path != student_audio_path and os.path.exists(vosk_wav_path):
                try:
                    os.remove(vosk_wav_path)
                except:
                    pass
        
        if not recognized_words_list:
            return []
        
        alerts = []
        
        # Confusion pairs to detect
        confusion_pairs = [
            ('ذ', 'ز'),  # dhal vs zay
            ('ص', 'س'),  # sad vs sin
        ]
        
        # If expected text is provided, compare word by word
        if expected_text_segments and len(expected_text_segments) > 0:
            # Build expected text map by time
            expected_text_map = {}
            for seg in expected_text_segments:
                expected_text = seg.get('text', '').strip()
                if expected_text:
                    # Map time range to expected text
                    start_time = seg.get('start', 0.0)
                    end_time = seg.get('end', 0.0)
                    expected_text_map[(start_time, end_time)] = expected_text
            
            # Compare recognized words with expected text
            for word in recognized_words_list:
                word_text = word.get('word', '').strip()
                word_start = word.get('start', 0.0)
                word_end = word.get('end', 0.0)
                word_confidence = word.get('conf', 0.0)
                
                if not word_text or word_confidence < confidence_threshold:
                    continue
                
                # Find expected text for this time range
                expected_text = None
                for (seg_start, seg_end), text in expected_text_map.items():
                    if seg_start <= word_start <= seg_end or seg_start <= word_end <= seg_end:
                        expected_text = text
                        break
                
                if not expected_text:
                    continue
                
                # Check for confusion pairs in the word
                for expected_char, confused_char in confusion_pairs:
                    if expected_char in expected_text and confused_char in word_text:
                        # Potential confusion detected
                        # Check if the positions match (simple heuristic)
                        expected_pos = expected_text.find(expected_char)
                        detected_pos = word_text.find(confused_char)
                        
                        # If characters are in similar positions, flag as potential confusion
                        if abs(expected_pos - detected_pos) <= 2:
                            alerts.append({
                                'time': float(word_start),
                                'expected': expected_char,
                                'detected': confused_char,
                                'confidence': float(word_confidence),
                                'word': word_text,
                                'expected_word': expected_text
                            })
                    elif confused_char in expected_text and expected_char in word_text:
                        # Reverse confusion (e.g., expected ز but detected ذ)
                        expected_pos = expected_text.find(confused_char)
                        detected_pos = word_text.find(expected_char)
                        
                        if abs(expected_pos - detected_pos) <= 2:
                            alerts.append({
                                'time': float(word_start),
                                'expected': confused_char,
                                'detected': expected_char,
                                'confidence': float(word_confidence),
                                'word': word_text,
                                'expected_word': expected_text
                            })
        else:
            # No expected text - detect potential confusions in recognized text only
            # This is less accurate but still useful for training
            for word in recognized_words_list:
                word_text = word.get('word', '').strip()
                word_start = word.get('start', 0.0)
                word_confidence = word.get('conf', 0.0)
                
                if not word_text or word_confidence < confidence_threshold:
                    continue
                
                # Check if word contains both characters from a confusion pair
                for char1, char2 in confusion_pairs:
                    if char1 in word_text and char2 in word_text:
                        # Potential confusion - flag both possibilities
                        alerts.append({
                            'time': float(word_start),
                            'expected': char1,
                            'detected': char2,
                            'confidence': float(word_confidence * 0.7),  # Lower confidence without expected text
                            'word': word_text,
                            'expected_word': None,
                            'note': 'No expected text provided - potential confusion detected'
                        })
        
        # Sort alerts by time
        alerts.sort(key=lambda x: x['time'])
        
        # Remove duplicate alerts (within 0.5 seconds)
        if len(alerts) > 1:
            unique_alerts = [alerts[0]]
            for alert in alerts[1:]:
                if alert['time'] - unique_alerts[-1]['time'] > 0.5:
                    unique_alerts.append(alert)
            alerts = unique_alerts
        
        logger.info(f"Detected {len(alerts)} pronunciation confusion alerts (beta)")
        return alerts
        
    except Exception as e:
        logger.warning(f"Error detecting pronunciation confusion: {e}", exc_info=True)
        return []

def detect_training_markers(
    pitch_data: List[Dict],
    quality_metrics: Dict[str, float] = None
) -> List[Dict]:
    """
    Detect unclear or unstable segments in pitch data for training guidance.
    
    Markers indicate segments that may need attention, not errors.
    Used for training assistance only.
    
    Detection criteria:
    - Low confidence regions (confidence < 0.4) for >100ms
    - High pitch variance (std dev > 50 Hz) over 200ms window
    - Large gaps in pitch data (>200ms without valid pitch)
    - Rapid pitch changes (jumps >3 semitones in <50ms)
    
    Args:
        pitch_data: List of pitch data points with time, f_hz, confidence
        quality_metrics: Optional quality metrics dict
    
    Returns:
        List of marker dicts: [{time, reason, severity}, ...]
        severity: 'low', 'medium', or 'high'
    """
    try:
        if not pitch_data or len(pitch_data) == 0:
            return []
        
        markers = []
        
        # Convert to arrays for easier processing
        times = np.array([p.get('time', 0.0) for p in pitch_data], dtype=float)
        freqs = np.array([p.get('f_hz') if p.get('f_hz') is not None else 0.0 for p in pitch_data], dtype=float)
        confidences = np.array([p.get('confidence', 0.0) for p in pitch_data], dtype=float)
        
        # Valid pitch mask
        valid_mask = (freqs > 0) & (freqs < 2000)  # Reasonable frequency range
        
        if np.sum(valid_mask) < 5:
            return []  # Not enough valid data
        
        # 1. Detect low confidence regions (>100ms)
        low_confidence_threshold = 0.4
        low_conf_mask = confidences < low_confidence_threshold
        
        # Find continuous low-confidence regions
        i = 0
        while i < len(low_conf_mask):
            if low_conf_mask[i]:
                start_idx = i
                while i < len(low_conf_mask) and low_conf_mask[i]:
                    i += 1
                end_idx = i - 1
                
                duration = times[end_idx] - times[start_idx] if end_idx > start_idx else 0.1
                if duration > 0.1:  # >100ms
                    # Determine severity based on duration and confidence level
                    avg_conf = np.mean(confidences[start_idx:end_idx+1])
                    severity = 'high' if duration > 0.3 or avg_conf < 0.2 else ('medium' if duration > 0.2 else 'low')
                    
                    marker_time = times[start_idx] + (times[end_idx] - times[start_idx]) / 2
                    markers.append({
                        'time': float(marker_time),
                        'reason': f'Low confidence region ({duration*1000:.0f}ms, avg: {avg_conf:.2f})',
                        'severity': severity
                    })
            else:
                i += 1
        
        # 2. Detect high pitch variance regions (>50 Hz std dev over 200ms window)
        window_size_ms = 0.2  # 200ms window
        for i in range(len(times) - 1):
            window_start = times[i]
            window_end = window_start + window_size_ms
            
            # Find points in window
            window_mask = (times >= window_start) & (times <= window_end) & valid_mask
            window_freqs = freqs[window_mask]
            
            if len(window_freqs) > 3:  # Need at least 3 points
                std_dev = np.std(window_freqs)
                if std_dev > 50.0:  # High variance threshold
                    # Check if we already have a marker nearby (within 100ms)
                    nearby_marker = any(abs(m['time'] - times[i]) < 0.1 for m in markers)
                    if not nearby_marker:
                        severity = 'high' if std_dev > 100 else ('medium' if std_dev > 75 else 'low')
                        markers.append({
                            'time': float(times[i]),
                            'reason': f'High pitch variance ({std_dev:.1f} Hz)',
                            'severity': severity
                        })
        
        # 3. Detect large gaps in pitch data (>200ms)
        for i in range(len(times) - 1):
            if valid_mask[i] and not valid_mask[i + 1]:
                # Gap starts
                gap_start_idx = i + 1
                gap_start_time = times[gap_start_idx]
                
                # Find gap end
                gap_end_idx = gap_start_idx
                while gap_end_idx < len(times) and not valid_mask[gap_end_idx]:
                    gap_end_idx += 1
                
                if gap_end_idx < len(times):
                    gap_end_time = times[gap_end_idx]
                    gap_duration = gap_end_time - gap_start_time
                    
                    if gap_duration > 0.2:  # >200ms gap
                        # Check if we already have a marker nearby
                        nearby_marker = any(abs(m['time'] - gap_start_time) < 0.15 for m in markers)
                        if not nearby_marker:
                            severity = 'high' if gap_duration > 0.5 else ('medium' if gap_duration > 0.3 else 'low')
                            marker_time = gap_start_time + gap_duration / 2
                            markers.append({
                                'time': float(marker_time),
                                'reason': f'Pitch gap ({gap_duration*1000:.0f}ms)',
                                'severity': severity
                            })
        
        # 4. Detect rapid pitch changes (>3 semitones in <50ms)
        for i in range(len(times) - 1):
            if valid_mask[i] and valid_mask[i + 1]:
                time_diff = times[i + 1] - times[i]
                if time_diff < 0.05:  # <50ms
                    freq1 = freqs[i]
                    freq2 = freqs[i + 1]
                    
                    if freq1 > 0 and freq2 > 0:
                        # Convert to semitones
                        semitones = 12.0 * np.log2(freq2 / freq1) if freq1 > 0 else 0.0
                        semitones = abs(semitones)
                        
                        if semitones > 3.0:  # >3 semitones jump
                            # Check if we already have a marker nearby
                            nearby_marker = any(abs(m['time'] - times[i]) < 0.1 for m in markers)
                            if not nearby_marker:
                                severity = 'high' if semitones > 6 else ('medium' if semitones > 4.5 else 'low')
                                markers.append({
                                    'time': float(times[i]),
                                    'reason': f'Rapid pitch change ({semitones:.1f} semitones)',
                                    'severity': severity
                                })
        
        # Sort markers by time
        markers.sort(key=lambda x: x['time'])
        
        # Remove duplicate markers (within 50ms of each other)
        if len(markers) > 1:
            unique_markers = [markers[0]]
            for marker in markers[1:]:
                if marker['time'] - unique_markers[-1]['time'] > 0.05:
                    unique_markers.append(marker)
                else:
                    # Merge nearby markers - keep the one with higher severity
                    prev_severity = unique_markers[-1]['severity']
                    curr_severity = marker['severity']
                    severity_order = {'low': 0, 'medium': 1, 'high': 2}
                    if severity_order[curr_severity] > severity_order[prev_severity]:
                        unique_markers[-1] = marker
            
            markers = unique_markers
        
        return markers
        
    except Exception as e:
        logger.warning(f"Error detecting training markers: {e}", exc_info=True)
        return []

def adaptive_spike_detection(
    arr: np.ndarray,
    times: np.ndarray,
    pitch_range: float = None,
    preserve_glissandos: bool = True
) -> np.ndarray:
    """
    Enhanced spike detection with adaptive thresholds and context awareness.
    
    Improvements:
    - Adaptive threshold based on pitch range
    - Context-aware detection (distinguishes musical slides from errors)
    - Preserves intentional glissandos
    
    Args:
        arr: Pitch values array (Hz)
        times: Corresponding time array
        pitch_range: Optional pitch range (max - min) in semitones
        preserve_glissandos: If True, preserve smooth pitch slides
    
    Returns:
        Filtered array with spikes removed
    """
    if arr.size < 5:
        return arr
    
    # Convert to MIDI for semitone-based detection
    midi = 69.0 + 12.0 * np.log2(arr / 440.0)
    
    # Calculate pitch range if not provided
    if pitch_range is None:
        pitch_range = float(np.max(midi) - np.min(midi))
    
    # ADAPTIVE THRESHOLD: Adjust based on pitch range
    # Wide range (e.g., singing) -> higher threshold
    # Narrow range (e.g., monotone) -> lower threshold
    base_threshold = 3.0  # Base 3 semitones
    if pitch_range > 12:  # More than one octave
        adaptive_threshold = base_threshold * 1.5  # 4.5 semitones
    elif pitch_range > 6:  # Half octave to full octave
        adaptive_threshold = base_threshold * 1.2  # 3.6 semitones
    elif pitch_range < 2:  # Very narrow range
        adaptive_threshold = base_threshold * 0.7  # 2.1 semitones
    else:
        adaptive_threshold = base_threshold
    
    # Use MAD for robust threshold
    median_midi = np.median(midi)
    mad = np.median(np.abs(midi - median_midi))
    final_threshold = max(adaptive_threshold, 2.5 * mad)
    
    # Find outliers
    outlier_mask = np.ones(arr.size, dtype=bool)
    
    for i in range(1, len(midi) - 1):
        local_window = midi[max(0, i-2):min(len(midi), i+3)]
        local_median = np.median(local_window)
        deviation = np.abs(midi[i] - local_median)
        
        # Check adjacent differences
        diff_prev = np.abs(midi[i] - midi[i-1]) if i > 0 else 0
        diff_next = np.abs(midi[i+1] - midi[i]) if i < len(midi) - 1 else 0
        
        # CONTEXT-AWARE: Check if this is a smooth slide (glissando)
        if preserve_glissandos:
            # If adjacent points also show similar change, it's likely a slide
            if i > 1 and i < len(midi) - 2:
                # Check if we're in a smooth transition
                prev_diff = midi[i-1] - midi[i-2]
                curr_diff = midi[i] - midi[i-1]
                next_diff = midi[i+1] - midi[i]
                
                # If changes are consistent in direction and magnitude, it's a slide
                if (np.sign(prev_diff) == np.sign(curr_diff) == np.sign(next_diff) and
                    abs(prev_diff) < 2.0 and abs(curr_diff) < 2.0 and abs(next_diff) < 2.0):
                    # This is a smooth glissando, preserve it
                    continue
        
        # Mark as outlier if deviation exceeds threshold
        if deviation > final_threshold or diff_prev > final_threshold or diff_next > final_threshold:
            outlier_mask[i] = False
    
    # If too many outliers, don't filter (might be valid rapid changes)
    if np.sum(~outlier_mask) > arr.size * 0.15:
        logger.debug(f"Too many outliers ({np.sum(~outlier_mask)}/{arr.size}), skipping spike removal")
        return arr
    
    if np.sum(~outlier_mask) > 0:
        logger.debug(f"Removed {np.sum(~outlier_mask)} spikes using adaptive detection (range={pitch_range:.1f} semitones, threshold={final_threshold:.2f})")
    
    return arr[outlier_mask]

def adaptive_interpolation(
    arr: np.ndarray,
    times: np.ndarray,
    tempo_estimate: float = None,
    preserve_silences: bool = True
) -> np.ndarray:
    """
    Enhanced interpolation with adaptive gap size and context awareness.
    
    Improvements:
    - Adaptive gap size based on tempo/rhythm
    - Preserves natural pauses (doesn't interpolate long silences)
    - Uses context from surrounding pitch for better interpolation
    
    Args:
        arr: Pitch values array
        times: Corresponding time array
        tempo_estimate: Optional tempo estimate (BPM)
        preserve_silences: If True, don't interpolate long gaps
    
    Returns:
        Array with gaps interpolated
    """
    if arr.size < 3:
        return arr
    
    valid_mask = (arr > 0) & ~np.isnan(arr)
    
    if np.all(valid_mask):
        return arr
    
    # ADAPTIVE GAP SIZE: Based on tempo
    if tempo_estimate and tempo_estimate > 0:
        # Estimate beat duration in milliseconds
        beat_duration_ms = (60.0 / tempo_estimate) * 1000.0
        # Allow gaps up to 1/4 beat (quarter note rest)
        max_gap_ms = beat_duration_ms * 0.25
        # Minimum gap: 50ms, Maximum: 200ms
        max_gap_ms = max(50.0, min(200.0, max_gap_ms))
    else:
        # Default: estimate from time differences
        if len(times) > 1:
            avg_hop = np.mean(np.diff(times)) * 1000.0  # Average hop in ms
            max_gap_ms = avg_hop * 5.0  # 5x average hop
            max_gap_ms = max(50.0, min(200.0, max_gap_ms))
        else:
            max_gap_ms = 100.0  # Default fallback
    
    times_ms = times * 1000.0
    result = arr.copy()
    
    # Find gaps and interpolate
    i = 0
    while i < len(arr):
        if not valid_mask[i]:
            gap_start = i
            gap_start_time = times_ms[i] if i < len(times_ms) else times_ms[-1]
            
            # Find end of gap
            gap_end = i
            while gap_end < len(arr) and not valid_mask[gap_end]:
                gap_end += 1
            
            if gap_end < len(times_ms):
                gap_end_time = times_ms[gap_end]
                gap_size_ms = gap_end_time - gap_start_time
                
                # PRESERVE SILENCES: Don't interpolate long gaps
                if preserve_silences and gap_size_ms > max_gap_ms * 2:
                    # Long gap - likely intentional silence, don't interpolate
                    logger.debug(f"Preserving silence: gap={gap_size_ms:.1f}ms (threshold={max_gap_ms*2:.1f}ms)")
                    i = gap_end
                    continue
                
                # Interpolate small gaps
                if gap_size_ms <= max_gap_ms and gap_start > 0 and gap_end < len(arr):
                    # CONTEXT-AWARE INTERPOLATION: Use surrounding pitch context
                    # Get values before and after gap
                    before_idx = gap_start - 1
                    after_idx = gap_end
                    
                    # Look further back/forward for better context
                    context_window = 3
                    before_vals = []
                    after_vals = []
                    
                    for j in range(max(0, before_idx - context_window), before_idx + 1):
                        if valid_mask[j]:
                            before_vals.append(arr[j])
                    
                    for j in range(after_idx, min(len(arr), after_idx + context_window + 1)):
                        if valid_mask[j]:
                            after_vals.append(arr[j])
                    
                    # Use median of context for more robust interpolation
                    if before_vals and after_vals:
                        before_val = np.median(before_vals)
                        after_val = np.median(after_vals)
                    elif before_vals:
                        before_val = np.median(before_vals)
                        after_val = before_val
                    elif after_vals:
                        after_val = np.median(after_vals)
                        before_val = after_val
                    else:
                        before_val = arr[before_idx] if before_idx >= 0 else arr[after_idx]
                        after_val = arr[after_idx] if after_idx < len(arr) else before_val
                    
                    # Smooth interpolation (cubic-like)
                    if gap_end > gap_start:
                        for j in range(gap_start, gap_end):
                            alpha = (j - gap_start) / (gap_end - gap_start)
                            # Use smooth interpolation curve (ease-in-out)
                            smooth_alpha = alpha * alpha * (3.0 - 2.0 * alpha)
                            result[j] = before_val * (1 - smooth_alpha) + after_val * smooth_alpha
                    
                    logger.debug(f"Interpolated gap: size={gap_size_ms:.1f}ms, indices={gap_start}-{gap_end}")
            
            i = gap_end
        else:
            i += 1
    
    return result

def calculate_per_segment_confidence(
    pitch_data: List[Dict],
    num_segments: int = 10
) -> List[Dict]:
    """
    Calculate per-segment confidence scores.
    
    Args:
        pitch_data: List of pitch dictionaries
        num_segments: Number of segments to divide into
    
    Returns:
        List of segment confidence dicts with: segment_index, start, end, confidence, quality
    """
    if not pitch_data or len(pitch_data) == 0:
        return []
    
    # Get time range
    times = [p.get('time', 0.0) for p in pitch_data]
    total_duration = max(times) - min(times) if times else 0.0
    
    if total_duration == 0:
        return []
    
    segment_duration = total_duration / num_segments
    segments = []
    
    for i in range(num_segments):
        seg_start = min(times) + i * segment_duration
        seg_end = min(times) + (i + 1) * segment_duration
        
        # Get pitch points in this segment
        seg_points = [p for p in pitch_data if seg_start <= p.get('time', 0) < seg_end]
        
        if seg_points:
            confidences = [p.get('confidence', 0.0) for p in seg_points]
            valid_pitches = [p for p in seg_points if p.get('f_hz') is not None and p.get('f_hz', 0) > 0]
            
            segment_confidence = np.mean(confidences) if confidences else 0.0
            segment_coverage = len(valid_pitches) / len(seg_points) if seg_points else 0.0
            segment_quality = (segment_confidence * 0.6 + segment_coverage * 0.4)
            
            segments.append({
                'segment_index': i,
                'start': seg_start,
                'end': seg_end,
                'confidence': float(segment_confidence),
                'coverage': float(segment_coverage),
                'quality': float(segment_quality)
            })
        else:
            segments.append({
                'segment_index': i,
                'start': seg_start,
                'end': seg_end,
                'confidence': 0.0,
                'coverage': 0.0,
                'quality': 0.0
            })
    
    return segments

def compute_pitch_stability(pitch_data: List[Dict], times: np.ndarray = None) -> Dict[str, float]:
    """
    Compute pitch stability metrics for a pitch track.
    
    Args:
        pitch_data: List of pitch dictionaries with 'f_hz' and 'time'
        times: Optional time array (if None, extracted from pitch_data)
    
    Returns:
        Dictionary with stability metrics:
        - score: Stability score (0-100, higher = more stable)
        - stdDev: Standard deviation in semitones
        - coefficientOfVariation: CV = std/mean
        - changeRate: Semitones per second
    """
    try:
        if not pitch_data or len(pitch_data) < 3:
            return {
                'score': 0.0,
                'stdDev': 0.0,
                'coefficientOfVariation': 0.0,
                'changeRate': 0.0
            }
        
        # Extract valid pitch values
        valid_pitches = []
        valid_times = []
        for p in pitch_data:
            f_hz = p.get('f_hz')
            if f_hz is not None and f_hz > 0:
                valid_pitches.append(f_hz)
                valid_times.append(p.get('time', 0.0))
        
        if len(valid_pitches) < 3:
            return {
                'score': 0.0,
                'stdDev': 0.0,
                'coefficientOfVariation': 0.0,
                'changeRate': 0.0
            }
        
        # Convert to MIDI for semitone-based analysis
        midi_notes = np.array([69.0 + 12.0 * np.log2(f / 440.0) for f in valid_pitches])
        valid_times_arr = np.array(valid_times)
        
        # Calculate standard deviation
        std_dev = float(np.std(midi_notes))
        
        # Calculate coefficient of variation
        mean_midi = float(np.mean(midi_notes))
        coefficient_of_variation = std_dev / mean_midi if mean_midi > 0 else 0.0
        
        # Calculate change rate (semitones per second)
        if len(valid_times_arr) > 1:
            time_span = float(valid_times_arr[-1] - valid_times_arr[0])
            if time_span > 0:
                midi_changes = np.abs(np.diff(midi_notes))
                total_change = float(np.sum(midi_changes))
                change_rate = total_change / time_span
            else:
                change_rate = 0.0
        else:
            change_rate = 0.0
        
        # Calculate stability score (0-100)
        # Lower std dev, lower CV, lower change rate = higher stability
        # Normalize: std_dev < 1 semitone = 100, > 5 semitones = 0
        std_score = max(0.0, min(100.0, 100.0 * (1.0 - std_dev / 5.0)))
        
        # CV score: CV < 0.01 = 100, CV > 0.1 = 0
        cv_score = max(0.0, min(100.0, 100.0 * (1.0 - coefficient_of_variation / 0.1)))
        
        # Change rate score: < 0.1 semitones/sec = 100, > 2.0 = 0
        change_rate_score = max(0.0, min(100.0, 100.0 * (1.0 - change_rate / 2.0)))
        
        # Weighted average stability score
        stability_score = (std_score * 0.4 + cv_score * 0.3 + change_rate_score * 0.3)
        
        return {
            'score': float(max(0.0, min(100.0, stability_score))),
            'stdDev': float(std_dev),
            'coefficientOfVariation': float(coefficient_of_variation),
            'changeRate': float(change_rate)
        }
    except Exception as e:
        logger.warning(f"Error computing pitch stability: {e}", exc_info=True)
        return {
            'score': 0.0,
            'stdDev': 0.0,
            'coefficientOfVariation': 0.0,
            'changeRate': 0.0
        }


def compute_pitch_similarity(
    ref_pitch: List[Dict], 
    user_pitch: List[Dict],
    normalize_range: bool = True,
    octave_agnostic: bool = False,
    return_stability: bool = False,
    tolerance_cents: float = 50.0
) -> Union[float, Tuple[float, Dict]]:
    """
    Compute a relative pitch contour similarity score (0–100) between
    reference and student pitch tracks.

    Enhanced features:
    - Pitch range normalization: Handles different vocal ranges (male/female/children)
    - Octave-agnostic comparison: Option to ignore octave shifts
    - Pitch stability scoring: Measures how consistent the pitch is

    Key ideas:
    - Use MIDI (semitones) so equal ratios become equal distances.
    - Remove mean (DC offset) so we compare *shape* not absolute key.
    - Use DTW on downsampled contours for robustness.
    - Apply conservative noise filtering for stability (not strictness).
    
    Args:
        ref_pitch: Reference pitch data list
        user_pitch: User/student pitch data list
        normalize_range: If True, normalize pitch ranges before comparison (default: True)
        octave_agnostic: If True, compare modulo octave (default: False)
        return_stability: If True, return stability metrics alongside score (default: False)
    
    Returns:
        - If return_stability=False: similarity score (0-100)
        - If return_stability=True: (similarity_score, stability_metrics_dict)
    """
    try:
        if not ref_pitch or not user_pitch:
            return 0.0

        # Convert to arrays with time, f_hz, confidence
        def _to_arrays(pitch_list: List[Dict]):
            times = np.array([p.get("time", 0.0) for p in pitch_list], dtype=float)
            f_hz = np.array([p.get("f_hz") if p.get("f_hz") is not None else 0.0 for p in pitch_list], dtype=float)
            conf = np.array([p.get("confidence", 0.0) for p in pitch_list], dtype=float)
            return times, f_hz, conf

        ref_times, ref_f, ref_conf = _to_arrays(ref_pitch)
        user_times, user_f, user_conf = _to_arrays(user_pitch)

        # ENHANCEMENT: Calculate quality metrics for adaptive thresholds
        ref_quality = calculate_pitch_quality_metrics(ref_pitch)
        user_quality = calculate_pitch_quality_metrics(user_pitch)
        
        # ENHANCEMENT: Use adaptive confidence threshold based on audio quality
        ref_adaptive_threshold = adaptive_confidence_threshold(ref_conf, ref_quality)
        user_adaptive_threshold = adaptive_confidence_threshold(user_conf, user_quality)
        
        logger.debug(f"Adaptive confidence thresholds: ref={ref_adaptive_threshold:.3f}, user={user_adaptive_threshold:.3f}")
        logger.debug(f"Quality scores: ref={ref_quality.get('qualityScore', 0):.1f}, user={user_quality.get('qualityScore', 0):.1f}")
        
        # Filter using adaptive thresholds
        ref_mask = (ref_f > 0.0) & (ref_conf >= ref_adaptive_threshold)
        user_mask = (user_f > 0.0) & (user_conf >= user_adaptive_threshold)

        if np.sum(ref_mask) < 5 or np.sum(user_mask) < 5:
            logger.info("Not enough voiced pitch points for contour similarity")
            return 0.0

        ref_times_v = ref_times[ref_mask]
        user_times_v = user_times[user_mask]

        # Focus on overlapping active region to ignore long leading/trailing tails
        ref_start, ref_end = float(np.min(ref_times_v)), float(np.max(ref_times_v))
        user_start, user_end = float(np.min(user_times_v)), float(np.max(user_times_v))

        overlap_start = max(ref_start, user_start)
        overlap_end = min(ref_end, user_end)

        if overlap_end - overlap_start <= 0.02:
            # Very little overlap in time -> shapes effectively unrelated
            logger.info("Very small overlap between reference and student pitch regions")
            return 0.0

        # Filter to overlapping window
        ref_window_mask = ref_mask & (ref_times >= overlap_start) & (ref_times <= overlap_end)
        user_window_mask = user_mask & (user_times >= overlap_start) & (user_times <= overlap_end)

        ref_vals = ref_f[ref_window_mask]
        user_vals = user_f[user_window_mask]
        ref_times_window = ref_times[ref_window_mask]
        user_times_window = user_times[user_window_mask]

        if ref_vals.size < 5 or user_vals.size < 5:
            logger.info("Not enough voiced pitch points for contour similarity (after overlap)")
            return 0.0

        # Step 2: Enhanced noise filtering and stability improvements
        # 1. Adaptive spike detection with context awareness
        # 2. Adaptive pitch dropout interpolation (fill small gaps)
        # 3. Better gap handling for missing segments
        
        # Legacy function kept for backward compatibility (now uses adaptive version)
        def _enhanced_spike_detection(arr: np.ndarray, max_jump_semitones: float = 3.0) -> np.ndarray:
            """
            Enhanced spike detection using median-based method for better stability.
            More robust than simple difference-based detection.
            """
            if arr.size < 5:  # Need at least 5 points for median-based detection
                return arr
            
            # Convert to MIDI for semitone-based detection
            midi = 69.0 + 12.0 * np.log2(arr / 440.0)
            
            # Use median-based outlier detection (more robust to noise)
            # Calculate median absolute deviation (MAD) for robust threshold
            median_midi = np.median(midi)
            mad = np.median(np.abs(midi - median_midi))
            threshold = max(max_jump_semitones, 3.0 * mad)  # Use 3*MAD or min 3 semitones
            
            # Find outliers using median-based method
            outlier_mask = np.ones(arr.size, dtype=bool)
            for i in range(1, len(midi) - 1):
                # Check if point deviates significantly from local median
                local_window = midi[max(0, i-2):min(len(midi), i+3)]
                local_median = np.median(local_window)
                deviation = np.abs(midi[i] - local_median)
                
                # Also check adjacent differences
                if i > 0:
                    diff_prev = np.abs(midi[i] - midi[i-1])
                else:
                    diff_prev = 0
                if i < len(midi) - 1:
                    diff_next = np.abs(midi[i+1] - midi[i])
                else:
                    diff_next = 0
                
                # Mark as outlier if deviation is too large
                if deviation > threshold or diff_prev > max_jump_semitones or diff_next > max_jump_semitones:
                    outlier_mask[i] = False
            
            # If too many outliers, don't filter (might be valid rapid changes)
            if np.sum(~outlier_mask) > arr.size * 0.15:  # More than 15% outliers
                logger.debug(f"Too many outliers ({np.sum(~outlier_mask)}/{arr.size}), skipping spike removal")
                return arr
            
            if np.sum(~outlier_mask) > 0:
                logger.debug(f"Removed {np.sum(~outlier_mask)} spikes using median-based detection")
            
            return arr[outlier_mask]
        
        def _interpolate_dropouts(arr: np.ndarray, times: np.ndarray, max_gap_ms: float = 100.0) -> np.ndarray:
            """
            Interpolate small pitch dropouts (gaps) to stabilize scoring.
            Only fills small gaps (< max_gap_ms) to avoid over-interpolation.
            
            Args:
                arr: Pitch values array
                times: Corresponding time array
                max_gap_ms: Maximum gap size to interpolate (milliseconds)
            
            Returns:
                Array with dropouts interpolated
            """
            if arr.size < 3:
                return arr
            
            # Find gaps (NaN or zero values)
            valid_mask = (arr > 0) & ~np.isnan(arr)
            
            if np.all(valid_mask):
                return arr  # No gaps to fill
            
            # Convert times to milliseconds for gap detection
            times_ms = times * 1000.0
            
            # Create output array
            result = arr.copy()
            
            # Find gaps and interpolate small ones
            i = 0
            while i < len(arr):
                if not valid_mask[i]:
                    # Found a gap, find its end
                    gap_start = i
                    gap_start_time = times_ms[i] if i < len(times_ms) else times_ms[-1]
                    
                    # Find end of gap
                    gap_end = i
                    while gap_end < len(arr) and not valid_mask[gap_end]:
                        gap_end += 1
                    
                    if gap_end < len(times_ms):
                        gap_end_time = times_ms[gap_end]
                        gap_size_ms = gap_end_time - gap_start_time
                        
                        # Only interpolate small gaps
                        if gap_size_ms <= max_gap_ms and gap_start > 0 and gap_end < len(arr):
                            # Get values before and after gap
                            before_val = arr[gap_start - 1] if gap_start > 0 else arr[gap_end]
                            after_val = arr[gap_end] if gap_end < len(arr) else before_val
                            
                            # Linear interpolation
                            if gap_end > gap_start:
                                for j in range(gap_start, gap_end):
                                    alpha = (j - gap_start) / (gap_end - gap_start)
                                    result[j] = before_val * (1 - alpha) + after_val * alpha
                            
                            logger.debug(f"Interpolated pitch dropout: gap={gap_size_ms:.1f}ms, "
                                       f"indices={gap_start}-{gap_end}")
                    
                    i = gap_end
                else:
                    i += 1
            
            return result
        
        def _remove_outliers(arr: np.ndarray, max_jump_semitones: float = 3.0) -> np.ndarray:
            """Legacy function - now uses enhanced spike detection."""
            return _enhanced_spike_detection(arr, max_jump_semitones)
        
        def _smooth_hz(arr: np.ndarray) -> np.ndarray:
            """Moving average smoothing - more sensitive to actual differences than median."""
            if arr.size < 3:
                return arr
            # 3-point moving average (0.25, 0.5, 0.25) - more sensitive than median
            kernel = np.array([0.25, 0.5, 0.25], dtype=float)
            return np.convolve(arr, kernel, mode="same")

        # Step 2: Apply enhanced stability pipeline with adaptive methods
        # 1. ENHANCEMENT: Adaptive interpolation (preserves natural pauses, context-aware)
        ref_vals = adaptive_interpolation(
            ref_vals,
            ref_times_window,
            tempo_estimate=None,  # Can be calculated from audio if needed
            preserve_silences=True
        )
        user_vals = adaptive_interpolation(
            user_vals,
            user_times_window,
            tempo_estimate=None,
            preserve_silences=True
        )
        
        # 2. ENHANCEMENT: Adaptive spike detection (context-aware, preserves glissandos)
        # Calculate pitch ranges for adaptive thresholds
        ref_midi_temp = 69.0 + 12.0 * np.log2(ref_vals / 440.0)
        user_midi_temp = 69.0 + 12.0 * np.log2(user_vals / 440.0)
        ref_pitch_range = float(np.max(ref_midi_temp) - np.min(ref_midi_temp)) if ref_midi_temp.size > 0 else 12.0
        user_pitch_range = float(np.max(user_midi_temp) - np.min(user_midi_temp)) if user_midi_temp.size > 0 else 12.0
        
        ref_vals = adaptive_spike_detection(
            ref_vals,
            ref_times_window,
            pitch_range=ref_pitch_range,
            preserve_glissandos=True
        )
        user_vals = adaptive_spike_detection(
            user_vals,
            user_times_window,
            pitch_range=user_pitch_range,
            preserve_glissandos=True
        )
        
        if ref_vals.size < 5 or user_vals.size < 5:
            logger.info("Not enough pitch points after spike removal")
            return 0.0
        
        # 3. Apply moving average smoothing (reduces jitter, preserves shape)
        ref_vals = _smooth_hz(ref_vals)
        user_vals = _smooth_hz(user_vals)
        
        # 4. Stability check: validate pitch data quality
        ref_valid_ratio = np.sum(ref_vals > 0) / ref_vals.size if ref_vals.size > 0 else 0.0
        user_valid_ratio = np.sum(user_vals > 0) / user_vals.size if user_vals.size > 0 else 0.0
        
        if ref_valid_ratio < 0.3 or user_valid_ratio < 0.3:
            logger.warning(f"Low pitch data quality: ref_valid={ref_valid_ratio:.2%}, "
                         f"user_valid={user_valid_ratio:.2%}")
            # Still proceed but log warning

        # Convert to MIDI (semitones) for relative pitch comparison
        ref_midi = 69.0 + 12.0 * np.log2(ref_vals / 440.0)
        user_midi = 69.0 + 12.0 * np.log2(user_vals / 440.0)

        # ENHANCEMENT 1: Pitch range normalization
        # Normalize pitch ranges to handle different vocal ranges (male/female/children)
        ref_min, ref_max = float(np.min(ref_midi)), float(np.max(ref_midi))
        user_min, user_max = float(np.min(user_midi)), float(np.max(user_midi))
        ref_range = ref_max - ref_min
        user_range = user_max - user_min
        
        if normalize_range:
            # Normalize to 0-1 range
            if ref_range > 0.1:  # Avoid division by very small numbers
                ref_midi_normalized = (ref_midi - ref_min) / ref_range
            else:
                ref_midi_normalized = ref_midi - ref_min
            
            if user_range > 0.1:
                user_midi_normalized = (user_midi - user_min) / user_range
            else:
                user_midi_normalized = user_midi - user_min
            
            # Scale normalized values to a common range (e.g., 0-12 semitones)
            # This preserves relative contour while normalizing ranges
            common_range = 12.0  # One octave
            ref_midi = ref_midi_normalized * common_range
            user_midi = user_midi_normalized * common_range
            
            logger.debug(f"Range normalization applied: ref_range={ref_range:.2f}, user_range={user_range:.2f} semitones")

        # ENHANCEMENT 2: Octave-agnostic comparison
        # If enabled, compare modulo octave (12 semitones) to handle octave shifts
        if octave_agnostic:
            # Calculate mean difference to detect octave shifts
            ref_mean = np.mean(ref_midi)
            user_mean = np.mean(user_midi)
            mean_diff = user_mean - ref_mean
            
            # If difference is close to an octave (12 semitones), adjust
            octave_shift = round(mean_diff / 12.0)
            if abs(octave_shift) > 0:
                user_midi = user_midi - (octave_shift * 12.0)
                logger.debug(f"Octave-agnostic: detected {octave_shift} octave shift, adjusted user pitch")

        # Remove DC offset: compare relative contour, not absolute key
        # This ensures fairness - same pitch shape gets same score regardless of voice range
        ref_mean = np.mean(ref_midi)
        user_mean = np.mean(user_midi)
        ref_rel = ref_midi - ref_mean
        user_rel = user_midi - user_mean
        
        # Log relative pitch comparison for calibration tracking
        logger.debug(f"Relative pitch comparison: ref_mean={ref_mean:.2f} semitones, "
                    f"user_mean={user_mean:.2f} semitones, "
                    f"mean_diff={abs(ref_mean - user_mean):.2f} semitones")

        # Downsample to reduce DTW cost on long sequences
        def _downsample(arr: np.ndarray, step: int = 2) -> np.ndarray:
            if arr.size <= 2 * step:
                return arr
            return arr[::step]

        ref_rel_ds = _downsample(ref_rel, step=2)
        user_rel_ds = _downsample(user_rel, step=2)

        if ref_rel_ds.size == 0 or user_rel_ds.size == 0:
            return 0.0

        tolerance_semitones = tolerance_cents / 100.0
        def _dist_tolerance(a, b):
            d = abs(float(a) - float(b))
            return 0.0 if d <= tolerance_semitones else d
        dist, _ = fastdtw(ref_rel_ds, user_rel_ds, dist=_dist_tolerance)

        path_len = max(ref_rel_ds.size, user_rel_ds.size)
        if path_len == 0:
            return 0.0

        dist_norm = dist / float(path_len)

        # Map normalised distance -> [0,100]. Softer curve so same-voice can reach 85-100% (client requirement).
        # 1 / (1 + 0.25 * d) gives ~80% at d=1, ~67% at d=2, ~57% at d=3
        score = 100.0 / (1.0 + 0.25 * dist_norm)

        score_clamped = float(max(0.0, min(100.0, score)))
        logger.info(f"Pitch contour similarity: dist_norm={dist_norm:.3f}, score={score_clamped:.2f}%")
        
        # ENHANCEMENT 3: Pitch stability scoring
        if return_stability:
            # Calculate stability for both reference and student
            ref_stability = compute_pitch_stability(
                [{'f_hz': f, 'time': t} for f, t in zip(ref_vals, ref_times_window) if f > 0],
                ref_times_window
            )
            user_stability = compute_pitch_stability(
                [{'f_hz': f, 'time': t} for f, t in zip(user_vals, user_times_window) if f > 0],
                user_times_window
            )
            
            # Calculate comparison metadata
            comparison_metadata = {
                'rangeNormalized': normalize_range,
                'octaveAgnostic': octave_agnostic,
                'meanDifference': float(abs(ref_mean - user_mean)),
                'rangeDifference': float(abs(ref_range - user_range))
            }
            
            # ENHANCEMENT: Include quality metrics and confidence thresholds
            stability_metrics = {
                'reference': ref_stability,
                'student': user_stability,
                'comparison': comparison_metadata,
                'quality': {
                    'reference': ref_quality,
                    'student': user_quality
                },
                'confidenceThresholds': {
                    'reference': ref_adaptive_threshold,
                    'student': user_adaptive_threshold
                }
            }
            
            return (score_clamped, stability_metrics)
        
        return score_clamped
    except Exception as e:
        logger.warning(f"Error computing pitch contour similarity: {e}", exc_info=True)
        if return_stability:
            # Try to calculate quality metrics even on error
            try:
                ref_quality_err = calculate_pitch_quality_metrics(ref_pitch) if ref_pitch else {
                    'qualityScore': 0.0, 'snrEstimate': 0.0, 'reliability': 0.0, 'coverage': 0.0, 'confidenceMean': 0.0
                }
                user_quality_err = calculate_pitch_quality_metrics(user_pitch) if user_pitch else {
                    'qualityScore': 0.0, 'snrEstimate': 0.0, 'reliability': 0.0, 'coverage': 0.0, 'confidenceMean': 0.0
                }
            except:
                ref_quality_err = {'qualityScore': 0.0, 'snrEstimate': 0.0, 'reliability': 0.0, 'coverage': 0.0, 'confidenceMean': 0.0}
                user_quality_err = {'qualityScore': 0.0, 'snrEstimate': 0.0, 'reliability': 0.0, 'coverage': 0.0, 'confidenceMean': 0.0}
            
            return (0.0, {
                'reference': {'score': 0.0, 'stdDev': 0.0, 'coefficientOfVariation': 0.0, 'changeRate': 0.0},
                'student': {'score': 0.0, 'stdDev': 0.0, 'coefficientOfVariation': 0.0, 'changeRate': 0.0},
                'comparison': {'rangeNormalized': normalize_range, 'octaveAgnostic': octave_agnostic, 'meanDifference': 0.0, 'rangeDifference': 0.0},
                'quality': {
                    'reference': ref_quality_err,
                    'student': user_quality_err
                },
                'confidenceThresholds': {
                    'reference': 0.3,
                    'student': 0.3
                }
            })
        return 0.0

def extract_pitch(audio: np.ndarray, sr: int, fmin: float = 60.0, fmax: float = 1200.0) -> List[Dict]:
    """
    Extract pitch (F0) from audio using librosa's probabilistic YIN algorithm.
    Returns list of {time, f_hz, midi, confidence} dictionaries.
    
    Args:
        audio: Audio signal as numpy array
        sr: Sample rate
        fmin: Minimum frequency in Hz (default 60 for voice)
        fmax: Maximum frequency in Hz (default 1200 for voice)
    
    Returns:
        List of dictionaries with:
        - 'time' (seconds)
        - 'f_hz' (frequency in Hz, or None if unvoiced)
        - 'midi' (MIDI note number, or None if unvoiced)
        - 'confidence' (0-1)
    """
    try:
        # Check if audio is too short for pitch detection
        if len(audio) < 2048:  # Need at least one frame
            logger.warning(f"Audio too short for pitch extraction: {len(audio)} samples")
            return []
        
        # Ensure audio is not empty or all zeros
        if np.all(audio == 0) or np.max(np.abs(audio)) < 1e-6:
            logger.warning("Audio signal is too quiet or empty for pitch extraction")
            return []
        
        logger.info(f"Starting pitch extraction: {len(audio)} samples, {sr} Hz, range {fmin}-{fmax} Hz")
        
        # Use librosa's probabilistic YIN (pyin) for robust pitch detection
        # frame_length=2048, hop_length=512 gives good time resolution (~23ms at 22050Hz)
        # IMPORTANT: Do NOT use 'threshold' parameter - it's not supported in this librosa version
        f0, voiced_flag, voiced_probs = librosa.pyin(
            audio,
            fmin=fmin,
            fmax=fmax,
            frame_length=2048,
            hop_length=512,
            sr=sr
        )
        
        logger.info(f"Pitch extraction completed: {len(f0)} frames")
        f0_smooth = np.copy(f0)
        times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=512)

        # Confidence gating to reduce unstable voiced spikes
        if voiced_flag is None:
            voiced_flag = np.ones(len(f0), dtype=bool)
        if voiced_probs is None:
            voiced_probs = np.ones(len(f0))
        confidence_threshold = 0.22
        low_conf_mask = np.asarray(voiced_probs) < confidence_threshold
        f0_smooth[low_conf_mask] = np.nan

        # Spike suppression in MIDI domain: replace isolated large jumps with neighbor median
        midi_track = np.full(len(f0_smooth), np.nan, dtype=float)
        for i, p in enumerate(f0_smooth):
            if not np.isnan(p) and p > 0:
                midi_track[i] = 69.0 + 12.0 * np.log2(float(p) / 440.0)
        for i in range(1, len(midi_track) - 1):
            if np.isnan(midi_track[i]):
                continue
            left = midi_track[i - 1]
            right = midi_track[i + 1]
            if np.isnan(left) or np.isnan(right):
                continue
            jump_left = abs(midi_track[i] - left)
            jump_right = abs(midi_track[i] - right)
            neighbor_gap = abs(left - right)
            # Isolated spike: current differs strongly from both neighbors while neighbors agree
            if jump_left > 3.2 and jump_right > 3.2 and neighbor_gap < 1.5:
                midi_track[i] = (left + right) / 2.0

        # Light local median smoothing on short windows (preserve contour shape)
        for i in range(2, len(midi_track) - 2):
            if np.isnan(midi_track[i]):
                continue
            window = midi_track[i - 2:i + 3]
            valid = window[~np.isnan(window)]
            if valid.size >= 3:
                local_med = float(np.median(valid))
                if abs(midi_track[i] - local_med) > 2.0:
                    midi_track[i] = local_med

        # Convert smoothed MIDI back to Hz
        for i, m in enumerate(midi_track):
            if np.isnan(m):
                f0_smooth[i] = np.nan
            else:
                f0_smooth[i] = float(440.0 * (2.0 ** ((m - 69.0) / 12.0)))

        pitch_data = []
        for i, (time, pitch, is_voiced, prob) in enumerate(zip(times, f0_smooth, voiced_flag, voiced_probs)):
            try:
                if is_voiced and not np.isnan(pitch) and pitch > 0 and float(prob) >= confidence_threshold:
                    # Convert Hz to MIDI
                    midi_note = hz_to_midi(pitch)
                    pitch_data.append({
                        'time': float(time),
                        'f_hz': float(pitch),
                        'midi': midi_note,
                        'confidence': float(prob) if not np.isnan(prob) else 0.5
                    })
                else:
                    # Store unvoiced frames with null values
                    pitch_data.append({
                        'time': float(time),
                        'f_hz': None,
                        'midi': None,
                        'confidence': 0.0
                    })
            except (ValueError, OverflowError) as e:
                logger.warning(f"Error processing pitch point {i}: {e}")
                pitch_data.append({
                    'time': float(time),
                    'f_hz': None,
                    'midi': None,
                    'confidence': 0.0
                })
        
        voiced_count = len([p for p in pitch_data if p.get('f_hz') is not None])
        logger.info(f"Extracted {voiced_count} voiced pitch points from {len(pitch_data)} total frames")
        return pitch_data
        
    except Exception as e:
        logger.error(f"Error extracting pitch: {e}", exc_info=True)
        # Return empty list on error to prevent crash
        return []

def extract_features(audio: np.ndarray, sr: int) -> Dict[str, np.ndarray]:
    """
    Extract multiple audio features for better similarity comparison.
    Returns dictionary of feature arrays.
    """
    features = {}
    
    # MFCC (Mel-frequency cepstral coefficients) - captures timbre
    features['mfcc'] = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    
    # Chroma - captures pitch class information
    features['chroma'] = librosa.feature.chroma_stft(y=audio, sr=sr)
    
    # Spectral contrast - captures spectral shape
    features['spectral_contrast'] = librosa.feature.spectral_contrast(y=audio, sr=sr)
    
    # Tonnetz - tonal centroid features
    features['tonnetz'] = librosa.feature.tonnetz(y=audio, sr=sr)
    
    # Zero crossing rate - captures rhythm
    features['zcr'] = librosa.feature.zero_crossing_rate(audio)
    
    # Store for segment scoring (duration and frame-time conversion)
    features['sample_rate'] = sr
    features['hop_length'] = 512  # matches librosa.feature.mfcc default
    
    return features

def normalize_features(features: np.ndarray) -> np.ndarray:
    """
    Normalize feature matrix to zero mean and unit variance.
    """
    # Normalize each feature dimension independently
    mean = np.mean(features, axis=1, keepdims=True)
    std = np.std(features, axis=1, keepdims=True) + 1e-9  # Add small epsilon to avoid division by zero
    normalized = (features - mean) / std
    return normalized


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    """Clamp value to [lo, hi]."""
    return float(max(lo, min(hi, x)))


def _gamma_expand(score_0_100: float, gamma: float) -> float:
    """
    Nonlinear remap to expand range.
    gamma < 1 expands high-end and separates mid scores.
    gamma > 1 compresses high-end.
    """
    s = _clamp(score_0_100, 0.0, 100.0) / 100.0
    if s <= 0.0:
        return 0.0
    return _clamp((s ** gamma) * 100.0)


def _midrange_rescale(raw: float, lo_in: float = 35.0, hi_in: float = 65.0, lo_out: float = 65.0, hi_out: float = 92.0) -> float:
    """
    Smooth mid-range remap for moderate performances.
    Uses eased blending so there is no abrupt jump at lo_in/hi_in boundaries.
    """
    raw = _clamp(raw)
    if raw < lo_in:
        return raw
    if raw > hi_in:
        return raw
    t = (raw - lo_in) / (hi_in - lo_in)
    mapped = lo_out + t * (hi_out - lo_out)
    # Smoothstep blend: t=0 -> raw, t=1 -> mapped (continuous at boundaries)
    smooth_t = t * t * (3.0 - 2.0 * t)
    return _clamp((1.0 - smooth_t) * raw + smooth_t * mapped)


def _segment_discriminative_rescale(score_0_100: float) -> float:
    """
    Monotonic remap to improve practical score spread for segment scoring.
    Keeps low scores conservative, expands clustered mid-range, and applies a
    gentle lift for stronger segments.
    """
    s = _clamp(score_0_100)

    if s <= 25.0:
        return s
    if s <= 60.0:
        # 25..60 -> 22..70 (expand mid where recordings were clustered)
        return _clamp(22.0 + (s - 25.0) * (48.0 / 35.0))
    if s <= 85.0:
        # 60..85 -> 70..88 (gentle high-range lift, no saturation spike)
        return _clamp(70.0 + (s - 60.0) * (18.0 / 25.0))
    return s

def _weighted_median(values: List[float], weights: List[float]) -> float:
    """
    Compute weighted median for values in 0-100 range.
    Falls back to simple median-style behavior when weights are degenerate.
    """
    if not values:
        return 0.0
    if len(values) != len(weights):
        raise ValueError("values and weights must have same length")

    pairs = sorted((float(v), max(0.0, float(w))) for v, w in zip(values, weights))
    total_weight = sum(w for _, w in pairs)
    if total_weight <= 0.0:
        # Degenerate case: treat each segment equally
        mid = len(pairs) // 2
        return pairs[mid][0]

    cumulative = 0.0
    threshold = total_weight * 0.5
    for value, weight in pairs:
        cumulative += weight
        if cumulative >= threshold:
            return _clamp(value)
    return _clamp(pairs[-1][0])


def calibrate_score(final_score: float, base_score: float, pitch_score: float, 
                   ref_audio: np.ndarray, ref_sr: int) -> float:
    """
    Calibrate score to ensure consistency and fairness across repeated recordings.
    
    This function:
    - Normalizes scores based on audio characteristics
    - Ensures relative pitch comparison fairness
    - Maintains score consistency without changing strictness
    
    Args:
        final_score: Current final score (0-100)
        base_score: Base feature score (0-100)
        pitch_score: Pitch contour score (0-100)
        ref_audio: Reference audio array
        ref_sr: Reference sample rate
        
    Returns:
        Calibrated score (0-100)
    """
    try:
        # Calculate audio characteristics for calibration
        audio_duration = len(ref_audio) / float(ref_sr) if ref_sr > 0 else 0.0
        audio_energy = np.mean(np.abs(ref_audio)) if len(ref_audio) > 0 else 0.0
        
        # Calibration factors (small adjustments for consistency, not strictness)
        calibration_factor = 1.0  # Start with no change
        
        # For very short audio (< 0.5s), slightly adjust to ensure consistency
        if audio_duration > 0 and audio_duration < 0.5:
            calibration_factor = 0.98
            logger.debug(f"Short audio calibration: duration={audio_duration:.2f}s, factor={calibration_factor}")
        
        # For very quiet audio, ensure fair scoring
        if audio_energy < 0.01:
            calibration_factor = min(calibration_factor, 1.0)
            logger.debug(f"Quiet audio calibration: energy={audio_energy:.4f}, factor={calibration_factor}")
        
        # Allow best attempts to score higher: small boost when both base and pitch are decent
        if final_score >= 60 and base_score >= 45 and pitch_score >= 45:
            # Slight positive calibration so close imitation can reach 25-35%+ instead of capped ~20%
            boost = 1.0 + 0.015 * min(30, final_score - 60) / 30.0  # up to ~1.015 for 60%, ~1.03 for 90%+
            calibration_factor = min(calibration_factor * boost, 1.08)
            logger.debug(f"High-score calibration: final={final_score:.1f}, base={base_score:.1f}, pitch={pitch_score:.1f}, factor={calibration_factor:.3f}")
        
        # Apply calibration
        calibrated_score = final_score * calibration_factor
        
        # Log calibration for consistency tracking
        if calibration_factor != 1.0:
            logger.info(f"Score calibration applied: original={final_score:.2f}%, "
                       f"calibrated={calibrated_score:.2f}%, factor={calibration_factor:.3f}")
        
        return calibrated_score
        
    except Exception as e:
        logger.warning(f"Error in score calibration: {e}, using original score")
        return final_score

def dtw_distance_to_similarity(distance: float, ref_length: int, user_length: int, feature_dim: int, feature_name: str = None, scale_factor_override: float = None) -> float:
    """
    Convert DTW distance to similarity score (0-1).
    Uses a more robust normalization approach with feature-specific scaling.
    
    Args:
        distance: DTW distance value
        ref_length: Length of reference sequence
        user_length: Length of user sequence
        feature_dim: Dimension of feature vectors
        feature_name: Optional feature name to use feature-specific scaling
        scale_factor_override: Optional override for scale_factor (e.g., 1.2 for segment scores)
    """
    # Handle edge cases
    if distance <= 0:
        return 1.0
    if ref_length <= 0 or user_length <= 0 or feature_dim <= 0:
        return 0.0
    
    # Calculate average path length (minimum possible DTW distance)
    # For DTW, the minimum path length is approximately the longer sequence
    min_path_length = max(ref_length, user_length) * np.sqrt(feature_dim)
    
    # Avoid division by zero
    if min_path_length <= 0:
        return 0.0
    
    # Normalize distance by average path length
    # This gives us a relative distance measure
    normalized_distance = distance / min_path_length
    
    # CRITICAL: If normalized distance is very large, audio is completely different (e.g., silence vs speech)
    # Return 0.0 directly to prevent false similarity scores
    # Threshold: if normalized_distance > 5.0, similarity will be < exp(-5) ≈ 0.0067, which is effectively 0
    if normalized_distance > 5.0:
        logger.debug(f"Very large normalized distance ({normalized_distance:.3f}) indicates completely different audio. Returning 0.0 similarity.")
        return 0.0
    
    # Use override if provided, otherwise calculate based on feature_name
    # Slightly relaxed for overall score so "visually aligned" can reach 70%+ (client 25.02.26: good matches stuck at 45-47%)
    if scale_factor_override is not None:
        scale_factor = scale_factor_override
    else:
        is_small_segment = min(ref_length, user_length) < 10
        
        if feature_name == 'mfcc':
            if is_small_segment:
                scale_factor = 1.0   # was 0.8 - slightly stricter so bad matches go lower
            else:
                scale_factor = 0.95   # was 1.2 - relaxed so good matches score higher
        elif feature_name == 'chroma':
            if is_small_segment:
                scale_factor = 1.0   # was 0.9
            else:
                scale_factor = 1.1    # was 1.4 - relaxed for overall
        else:
            if is_small_segment:
                scale_factor = 1.4   # was 1.2
            else:
                scale_factor = 2.0   # was 1.8 - more discriminative
    
    similarity = np.exp(-normalized_distance * scale_factor)
    
    # Boost high similarity values - if similarity is already high, make it even higher
    # This ensures that high similarity values are sufficiently rewarded
    if similarity > 0.7:
        # Boost high similarities by up to 10% to ensure they're sufficiently rewarded
        boost = 1.0 + 0.1 * ((similarity - 0.7) / 0.3)  # Linear boost from 1.0 to 1.1
        similarity = min(1.0, similarity * boost)
    
    # Ensure similarity is in [0, 1] range and handle edge cases
    similarity = max(0.0, min(1.0, similarity))
    
    # Handle NaN or Inf
    if np.isnan(similarity) or np.isinf(similarity):
        return 0.0
    
    return similarity

def calculate_feature_similarity(ref_features: Dict[str, np.ndarray], 
                                 user_features: Dict[str, np.ndarray]) -> Dict[str, float]:
    """
    Calculate similarity score (0-1) for each feature type using DTW.
    Returns dictionary of similarity scores where 1.0 is perfect match.
    """
    similarities = {}
    
    for feature_name in ref_features.keys():
        if feature_name not in user_features:
            continue
        ref_feat = ref_features[feature_name]
        user_feat = user_features[feature_name]
        if not isinstance(ref_feat, np.ndarray) or not isinstance(user_feat, np.ndarray):
            continue
        if ref_feat.ndim < 2 or user_feat.ndim < 2:
            continue
        ref_norm = normalize_features(ref_feat)
        user_norm = normalize_features(user_feat)
        
        # Transpose to time x features (DTW works on time sequences)
        ref_t = ref_norm.T  # Shape: (time_frames, feature_dim)
        user_t = user_norm.T  # Shape: (time_frames, feature_dim)
        
        # Calculate DTW distance
        try:
            distance, _ = fastdtw(ref_t, user_t, dist=euclidean)
            
            # Get dimensions for normalization
            ref_length = ref_t.shape[0]
            user_length = user_t.shape[0]
            feature_dim = ref_t.shape[1]
            
            # Convert DTW distance to similarity score (0-1)
            # Pass feature_name for feature-specific scaling (MFCC/Chroma more forgiving)
            similarity = dtw_distance_to_similarity(distance, ref_length, user_length, feature_dim, feature_name=feature_name)
            similarities[feature_name] = similarity
            
            logger.debug(f"{feature_name}: distance={distance:.2f}, similarity={similarity:.3f}, "
                        f"ref_len={ref_length}, user_len={user_length}, dim={feature_dim}")
            
        except Exception as e:
            logger.warning(f"Failed to calculate DTW for {feature_name}: {e}")
            similarities[feature_name] = 0.0
    
    return similarities

def calculate_dynamic_segments(audio_duration_seconds: float) -> int:
    """
    Calculate number of segments based on audio duration.
    Target: ~2 seconds per segment
    Min: 5 segments, Max: 20 segments
    
    Args:
        audio_duration_seconds: Audio duration in seconds
        
    Returns:
        Number of segments (5-20)
    """
    target_segments = max(5, min(20, int(np.ceil(audio_duration_seconds / 2))))
    logger.info(f"Calculated dynamic segments: {target_segments} for {audio_duration_seconds:.2f}s audio")
    return target_segments

def _segment_pitch_score(ref_pitch: List[Dict], user_pitch: List[Dict],
                         seg_start: float, seg_end: float) -> float:
    """Compute pitch contour similarity (0-100) for a time segment. Returns 0 if insufficient data."""
    if not ref_pitch or not user_pitch:
        return 0.0
    # Small tolerance so boundary samples aren't excluded by float rounding
    tol = 1e-6
    ref_slice = [p for p in ref_pitch if (seg_start - tol) <= p.get('time', 0) <= (seg_end + tol)]
    user_slice = [p for p in user_pitch if (seg_start - tol) <= p.get('time', 0) <= (seg_end + tol)]
    if len(ref_slice) < 5 or len(user_slice) < 5:
        return 0.0
    try:
        # Use slightly wider tolerance for per-segment pitch comparison so brief
        # micro-ornament spikes do not dominate otherwise well-matched segments.
        return float(
            compute_pitch_similarity(
                ref_slice,
                user_slice,
                normalize_range=True,
                return_stability=False,
                tolerance_cents=80.0,
            )
        )
    except Exception:
        return 0.0


def calculate_segment_scores(ref_features: Dict[str, np.ndarray], 
                             user_features: Dict[str, np.ndarray],
                             num_segments: int = None,  # Changed: now optional
                             audio_duration: float = None,
                             text_segments: List[Dict] = None,
                             pitch_data: Dict = None,
                             dtw_path: List = None) -> List[Dict]:  # Optional: full-audio DTW path for aligned segment scoring
    """
    Calculate similarity scores for different segments of the audio.
    If text_segments are provided, score only those segments.
    When dtw_path is provided with text_segments, user segment bounds are derived from the path (alignment),
    so segment scores can reach high values even when tempo differs (fixes segment scores never exceeding 50%).
    Otherwise, divide audio into num_segments equal parts.
    Segment score = 0.5 * MFCC similarity + 0.5 * pitch contour similarity (when pitch_data provided).
    Returns list of segment scores.
    
    Args:
        ref_features: Reference audio features
        user_features: User audio features
        num_segments: If None, calculated dynamically based on audio_duration
        audio_duration: Audio duration in seconds (required if num_segments is None)
        text_segments: Optional list of Quranic text segments with 'start', 'end', 'text'
        pitch_data: Optional dict with 'reference' and 'student' pitch lists for blended scoring
        dtw_path: Optional list of (ref_idx, user_idx) from full-audio DTW for aligned segment extraction
    """
    segments = []
    
    # Use MFCC for segment analysis (most reliable)
    if 'mfcc' not in ref_features or 'mfcc' not in user_features:
        return segments
    
    ref_mfcc = ref_features['mfcc'].T
    user_mfcc = user_features['mfcc'].T
    
    ref_len = ref_mfcc.shape[0]
    user_len = user_mfcc.shape[0]
    ref_sr = ref_features.get('sample_rate', 16000)
    user_sr = user_features.get('sample_rate', 16000)
    ref_hop_length = ref_features.get('hop_length', 512)
    user_hop_length = user_features.get('hop_length', 512)
    
    ref_pitch = (pitch_data or {}).get('reference') or []
    user_pitch = (pitch_data or {}).get('student') or []
    use_pitch = len(ref_pitch) >= 5 and len(user_pitch) >= 5
    
    # Reference duration in seconds (for normalised segment times 0-1 -> seconds)
    ref_duration_sec = (ref_len * ref_hop_length) / float(ref_sr) if ref_sr and ref_sr > 0 else 0.0
    if text_segments and len(text_segments) > 0:
        logger.info(f"Segment scoring: use_pitch={use_pitch}, ref_duration_sec={ref_duration_sec:.2f}, ref_pitch_pts={len(ref_pitch)}, user_pitch_pts={len(user_pitch)}")
    
    # If text_segments are provided, use them instead of arbitrary divisions
    if text_segments and len(text_segments) > 0:
        logger.info(f"Calculating scores for {len(text_segments)} Quranic text segments")
        
        for i, text_seg in enumerate(text_segments):
            seg_start = float(text_seg.get('start', 0))
            seg_end = float(text_seg.get('end', 0))
            seg_text = text_seg.get('text', '')
            
            # Skip empty segments or invalid time ranges
            if seg_end <= seg_start:
                logger.warning(f"Text segment {i} has invalid time range: {seg_start}-{seg_end}, skipping")
                continue
            
            # If segment end <= 1.0, treat as normalised (0-1); convert to seconds for pitch and MFCC
            if ref_duration_sec > 0 and seg_end <= 1.0:
                seg_start_sec = seg_start * ref_duration_sec
                seg_end_sec = seg_end * ref_duration_sec
            else:
                seg_start_sec = seg_start
                seg_end_sec = seg_end
            
            # Convert time (seconds) to frame indices (reference)
            start_ref_frame = int(seg_start_sec * ref_sr / ref_hop_length)
            end_ref_frame = int(seg_end_sec * ref_sr / ref_hop_length)
            start_ref_frame = max(0, min(start_ref_frame, ref_len))
            end_ref_frame = max(start_ref_frame, min(end_ref_frame, ref_len))

            # User segment: use DTW path for alignment when available (fixes segment scores never exceeding 50%)
            if dtw_path and len(dtw_path) > 0:
                # Path: list of (ref_idx, user_idx) or ndarray (2, L)
                try:
                    if hasattr(dtw_path, 'shape') and len(dtw_path.shape) >= 2:
                        ref_indices = np.asarray(dtw_path[0]).ravel()
                        user_indices = np.asarray(dtw_path[1]).ravel()
                    else:
                        ref_indices = np.array([p[0] for p in dtw_path])
                        user_indices = np.array([p[1] for p in dtw_path])
                    mask = (ref_indices >= start_ref_frame) & (ref_indices < end_ref_frame)
                    if np.any(mask):
                        user_idx_in_seg = user_indices[mask]
                        start_user_frame = int(np.min(user_idx_in_seg))
                        end_user_frame = int(np.max(user_idx_in_seg)) + 1
                    else:
                        start_user_frame = int(seg_start_sec * user_sr / user_hop_length)
                        end_user_frame = int(seg_end_sec * user_sr / user_hop_length)
                except Exception as e:
                    logger.warning(f"DTW path segment mapping failed for segment {i}: {e}, using time-based alignment")
                    start_user_frame = int(seg_start_sec * user_sr / user_hop_length)
                    end_user_frame = int(seg_end_sec * user_sr / user_hop_length)
            else:
                start_user_frame = int(seg_start_sec * user_sr / user_hop_length)
                end_user_frame = int(seg_end_sec * user_sr / user_hop_length)

            start_user_frame = max(0, min(start_user_frame, user_len))
            end_user_frame = max(start_user_frame, min(end_user_frame, user_len))
            
            if end_ref_frame <= start_ref_frame or end_user_frame <= start_user_frame:
                logger.warning(f"Text segment {i} has no valid frames after conversion, skipping")
                continue
            
            ref_segment = ref_mfcc[start_ref_frame:end_ref_frame]
            user_segment = user_mfcc[start_user_frame:end_user_frame]
            
            try:
                # Calculate score for this text segment
                distance, _ = fastdtw(ref_segment, user_segment, dist=euclidean)
                
                ref_seg_len = ref_segment.shape[0]
                user_seg_len = user_segment.shape[0]
                feature_dim = ref_segment.shape[1]
                
                # Segment-local DTW should be slightly less strict than global scoring
                # so overall contour matches are not under-scored in short windows.
                similarity_01 = dtw_distance_to_similarity(
                    distance,
                    ref_seg_len,
                    user_seg_len,
                    feature_dim,
                    feature_name=None,
                    scale_factor_override=0.8,
                )
                
                if np.isnan(similarity_01) or np.isinf(similarity_01) or similarity_01 < 0:
                    similarity_01 = 0.0
                elif similarity_01 > 1.0:
                    similarity_01 = 1.0
                
                # Do not force a 0.1% floor; allow true near-zero similarity for consistency.
                if similarity_01 < 0.001:
                    similarity_01 = 0.0
                
                mfcc_100 = float(similarity_01 * 100)
                mfcc_100 = max(0.0, min(100.0, mfcc_100))
                # Blend with pitch contour when available (use seconds for pitch filtering)
                if use_pitch:
                    pitch_100 = _segment_pitch_score(ref_pitch, user_pitch, seg_start_sec, seg_end_sec)
                    # Tarannum assessment: segment improvement should follow
                    # pitch contour more than device-sensitive MFCC/timbre.
                    similarity = 0.4 * mfcc_100 + 0.6 * pitch_100
                else:
                    similarity = mfcc_100
                similarity = max(0.0, min(100.0, similarity))
                
                if similarity >= 80:
                    accuracy = 'high'
                elif similarity >= 50:
                    accuracy = 'medium'
                else:
                    accuracy = 'low'
                
                max_possible = 100.0
                normalized = _segment_discriminative_rescale(float(similarity))
                final_score = round(normalized, 2) if normalized >= 0.01 else normalized
                final_score = max(0.0, min(100.0, float(final_score)))
                normalized = max(0.0, min(100.0, float(normalized)))
                segment_dict = {
                    'segmentId': f'seg_{i}',
                    'start': seg_start_sec,
                    'end': seg_end_sec,
                    'score': float(final_score),
                    'normalized': float(round(normalized, 2)),
                    'raw': float(similarity_01),
                    'max': float(max_possible),
                    'accuracy': str(accuracy),
                    'text': seg_text
                }
                segments.append(segment_dict)
                logger.info(f"Text segment {i}: start={seg_start_sec:.2f}s, end={seg_end_sec:.2f}s, score={final_score:.2f}%, text='{seg_text[:50] if seg_text else 'N/A'}...'")
                
            except Exception as e:
                logger.warning(f"Failed to calculate score for text segment {i}: {e}", exc_info=True)
                segment_dict = {
                    'segmentId': f'seg_{i}',
                    'start': seg_start_sec,
                    'end': seg_end_sec,
                    'score': 0.0,
                    'normalized': 0.0,
                    'raw': 0.0,
                    'max': 100.0,
                    'accuracy': 'low',
                    'text': seg_text
                }
                segments.append(segment_dict)
        
        logger.info(f"Calculated scores for {len(segments)} Quranic text segments")
        return segments
    
    # Fallback to original behavior: divide into equal segments
    # Calculate dynamic segment count if not provided
    if num_segments is None:
        if audio_duration is None:
            logger.warning("num_segments and audio_duration both None, using default 10")
            num_segments = 10
        else:
            num_segments = calculate_dynamic_segments(audio_duration)
    
    segment_size_ref = max(1, ref_len // num_segments)
    segment_size_user = max(1, user_len // num_segments)
    
    for i in range(num_segments):
        start_ref = i * segment_size_ref
        end_ref = min((i + 1) * segment_size_ref, ref_len)
        start_user = i * segment_size_user
        end_user = min((i + 1) * segment_size_user, user_len)
        
        if end_ref <= start_ref or end_user <= start_user:
            continue
        
        ref_segment = ref_mfcc[start_ref:end_ref]
        user_segment = user_mfcc[start_user:end_user]
        
        try:
            distance, _ = fastdtw(ref_segment, user_segment, dist=euclidean)
            
            # Convert DTW distance to similarity using the same method as main scoring
            ref_seg_len = ref_segment.shape[0]
            user_seg_len = user_segment.shape[0]
            feature_dim = ref_segment.shape[1]
            
            # Use the same similarity conversion function
            # Segment-local DTW should be slightly less strict than global scoring.
            similarity_01 = dtw_distance_to_similarity(
                distance,
                ref_seg_len,
                user_seg_len,
                feature_dim,
                feature_name=None,
                scale_factor_override=0.8,
            )
            
            # Ensure similarity is a valid number
            if np.isnan(similarity_01) or np.isinf(similarity_01) or similarity_01 < 0:
                similarity_01 = 0.0
            elif similarity_01 > 1.0:
                similarity_01 = 1.0
            
            # Do not force a 0.1% floor; allow true near-zero similarity for consistency.
            if similarity_01 < 0.001:
                similarity_01 = 0.0
            
            mfcc_100 = float(similarity_01 * 100)
            mfcc_100 = max(0.0, min(100.0, mfcc_100))
            # Blend with pitch contour when available (so segments show variation and match overall score)
            if use_pitch and audio_duration and audio_duration > 0:
                seg_start_sec = (i / num_segments) * audio_duration
                seg_end_sec = ((i + 1) / num_segments) * audio_duration
                pitch_100 = _segment_pitch_score(ref_pitch, user_pitch, seg_start_sec, seg_end_sec)
                similarity = 0.4 * mfcc_100 + 0.6 * pitch_100
            else:
                similarity = mfcc_100
            similarity = max(0.0, min(100.0, similarity))
            
            if similarity < 1.0 and similarity > 0:
                logger.debug(f"Segment {i}: mfcc_100={mfcc_100:.2f}, similarity={similarity:.2f}%")
            
            # Determine accuracy level
            if similarity >= 80:
                accuracy = 'high'
            elif similarity >= 50:
                accuracy = 'medium'
            else:
                accuracy = 'low'
            
            # Normalized 0-100 for UI consistency (Milestone 5)
            max_possible = 100.0
            normalized = _segment_discriminative_rescale(float(similarity))
            if similarity > 0 and similarity < 0.01:
                final_score = float(similarity)
            else:
                final_score = round(normalized, 2)
            
            raw_01 = float(similarity_01)
            final_score = max(0.0, min(100.0, float(final_score)))
            normalized = max(0.0, min(100.0, float(normalized)))
            segment_dict = {
                'segmentId': f'seg_{i}',
                'start': float(i / num_segments),
                'end': float((i + 1) / num_segments),
                'score': float(final_score),
                'normalized': float(round(normalized, 2)),
                'raw': raw_01,
                'max': max_possible,
                'accuracy': str(accuracy)
            }
            if hasattr(segment_dict['score'], 'item'):
                segment_dict['score'] = segment_dict['score'].item()
            segment_dict['score'] = max(0.0, min(100.0, float(segment_dict.get('score', 0))))
            segment_dict['normalized'] = max(0.0, min(100.0, float(segment_dict.get('normalized', 0))))
            segments.append(segment_dict)
            
            logger.info(f"Segment {i}: start={segment_dict['start']}, end={segment_dict['end']}, score={segment_dict['score']}% (type: {type(segment_dict['score'])}), accuracy={segment_dict['accuracy']}")
        except Exception as e:
            logger.warning(f"Failed to calculate segment {i} score: {e}")
            segment_dict = {
                'segmentId': f'seg_{i}',
                'start': float(i / num_segments),
                'end': float((i + 1) / num_segments),
                'score': 0.0,
                'normalized': 0.0,
                'raw': 0.0,
                'max': 100.0,
                'accuracy': 'low'
            }
            segments.append(segment_dict)
            logger.info(f"Segment {i} (error fallback): start={segment_dict['start']}, end={segment_dict['end']}, score={segment_dict['score']}, accuracy={segment_dict['accuracy']}")
    
    return segments

def generate_training_feedback(
    final_score: float, 
    base_score: float, 
    pitch_score: float, 
    segments: List[Dict] = None,
    previous_attempts: List[float] = None,
    attempt_number: int = 1,
    pitch_data: Dict = None
) -> Dict[str, any]:
    """
    Generate training-friendly, non-judgmental feedback for learning purposes.
    
    Enhanced features:
    - Personalized feedback based on progress
    - Specific pitch/timing issues per segment
    - Context-aware messages (first attempt vs 10th attempt)
    - Milestone tracking
    - Multiple message variations
    
    Args:
        final_score: Overall similarity score (0-100)
        base_score: Base feature score (0-100)
        pitch_score: Pitch contour score (0-100)
        segments: List of segment scores (optional)
        previous_attempts: List of previous scores for comparison (optional)
        attempt_number: Current attempt number (default: 1)
        pitch_data: Pitch data dict with reference and student pitch (optional)
        
    Returns:
        Dictionary with feedback information:
        - 'label': Overall performance label
        - 'category': Performance category
        - 'message': Encouraging message (rotated)
        - 'strengths': List of what's working well
        - 'focus_areas': List of areas to focus on
        - 'segment_feedback': Enhanced per-segment feedback
        - 'progress': Progress comparison data
        - 'milestones': Achieved milestones
        - 'suggestions': Specific improvement suggestions
    """
    feedback = {
        'label': '',
        'category': '',
        'message': '',
        'strengths': [],
        'focus_areas': [],
        'segment_feedback': [],
        'progress': {},
        'milestones': [],
        'suggestions': []
    }
    
    # ENHANCEMENT: Calculate progress if previous attempts available
    progress_data = {}
    if previous_attempts and len(previous_attempts) > 0:
        avg_previous = np.mean(previous_attempts)
        best_previous = max(previous_attempts)
        improvement = final_score - avg_previous
        improvement_percent = (improvement / avg_previous * 100) if avg_previous > 0 else 0
        
        progress_data = {
            'previousAverage': float(avg_previous),
            'previousBest': float(best_previous),
            'improvement': float(improvement),
            'improvementPercent': float(improvement_percent),
            'isImproving': improvement > 0,
            'isNewBest': final_score > best_previous
        }
        feedback['progress'] = progress_data
    
    # ENHANCEMENT: Check for milestones
    milestones = []
    if final_score >= 80 and attempt_number == 1:
        milestones.append('first_excellent')
    elif final_score >= 80:
        milestones.append('excellent_score')
    if progress_data.get('isNewBest', False):
        milestones.append('new_personal_best')
    if attempt_number == 10:
        milestones.append('tenth_attempt')
    if attempt_number == 25:
        milestones.append('twenty_fifth_attempt')
    feedback['milestones'] = milestones
    
    # ENHANCEMENT: Multiple message variations (context-aware)
    excellent_messages = [
        'Your recitation closely matches the reference. Keep up the great work!',
        'Excellent work! Your recitation shows strong similarity to the reference.',
        'Outstanding! You\'re matching the reference very well.',
        'ممتاز! أداؤك قريب جداً من المرجعية.' if attempt_number > 5 else 'Excellent! Your performance is very close to the reference.'
    ]
    
    good_messages = [
        'You\'re making good progress! Your recitation shows strong similarity in many areas.',
        'Good work! Continue practicing to refine your recitation.',
        'Nice progress! You\'re on the right track.',
        'جيد! استمر في الممارسة لتحسين أدائك.' if attempt_number > 5 else 'Good! Keep practicing to improve your performance.'
    ]
    
    developing_messages = [
        'You\'re developing your recitation skills. Practice will help you improve further.',
        'Keep practicing! Every attempt helps you improve.',
        'You\'re learning! Continue to practice and you\'ll see progress.',
        'استمر في الممارسة! كل محاولة تساعدك على التحسين.' if attempt_number > 3 else 'Keep practicing! Each attempt helps you improve.'
    ]
    
    beginning_messages = [
        'Every practice session helps you improve. Keep going!',
        'You\'re taking the first steps. Practice makes perfect!',
        'Starting out is the hardest part. You\'re doing great!',
        'ابدأ بالممارسة! الخطوات الأولى هي الأصعب.' if attempt_number > 1 else 'Start practicing! The first steps are the hardest.'
    ]
    
    # Determine overall performance category and label (non-judgmental, encouraging)
    # ENHANCEMENT: Use rotated messages and progress-aware feedback
    message_index = attempt_number % 4  # Rotate through 4 messages
    
    if final_score >= 80:
        feedback['category'] = 'excellent'
        feedback['label'] = 'Excellent Match'
        feedback['message'] = excellent_messages[message_index]
        feedback['strengths'].append('Strong overall similarity')
        if pitch_score >= 70:
            feedback['strengths'].append('Good pitch accuracy')
        if base_score >= 70:
            feedback['strengths'].append('Good pronunciation and timing')
        
        # ENHANCEMENT: Progress-aware feedback
        if progress_data.get('isNewBest', False):
            feedback['strengths'].append('New personal best!')
        if progress_data.get('improvement', 0) > 5:
            feedback['strengths'].append(f'Improved by {progress_data.get("improvement", 0):.1f}% from your average')
            
    elif final_score >= 60:
        feedback['category'] = 'good'
        feedback['label'] = 'Good Progress'
        feedback['message'] = good_messages[message_index]
        feedback['strengths'].append('Solid foundation')
        if pitch_score >= 50:
            feedback['strengths'].append('Pitch is on track')
        if base_score >= 50:
            feedback['strengths'].append('Pronunciation is developing well')
        
        # ENHANCEMENT: Progress-aware suggestions
        if progress_data.get('improvement', 0) > 0:
            feedback['strengths'].append(f'You\'re improving! Up {progress_data.get("improvement", 0):.1f}% from average')
        feedback['focus_areas'].append('Continue practicing to refine your recitation')
        
    elif final_score >= 40:
        feedback['category'] = 'developing'
        feedback['label'] = 'Keep Practicing'
        feedback['message'] = developing_messages[message_index]
        feedback['strengths'].append('You\'re on the right path')
        if pitch_score > base_score:
            feedback['strengths'].append('Your pitch is improving')
        else:
            feedback['strengths'].append('Your pronunciation shows promise')
        
        # ENHANCEMENT: Compare to previous attempts
        if previous_attempts and len(previous_attempts) > 0:
            if final_score > np.mean(previous_attempts):
                feedback['strengths'].append('You\'re improving with each attempt')
            elif final_score < np.mean(previous_attempts):
                feedback['suggestions'].append('Try focusing on one aspect at a time')
        
        feedback['focus_areas'].append('Focus on matching the reference rhythm and pitch')
        feedback['focus_areas'].append('Practice listening and repeating')
    else:
        feedback['category'] = 'beginning'
        feedback['label'] = 'Getting Started'
        feedback['message'] = beginning_messages[message_index]
        feedback['strengths'].append('You\'re taking the first steps')
        feedback['strengths'].append('Consistent practice will help')
        
        # ENHANCEMENT: First attempt vs later attempts
        if attempt_number == 1:
            feedback['focus_areas'].append('Listen carefully to the reference audio first')
        else:
            feedback['focus_areas'].append('Compare this attempt to your previous ones')
        
        feedback['focus_areas'].append('Practice matching the pitch and rhythm')
        feedback['focus_areas'].append('Take your time and focus on accuracy')
    
    # Add specific improvement areas based on score components (non-judgmental)
    if pitch_score < 40 and base_score >= 40:
        feedback['focus_areas'].append('Work on matching the pitch contour')
    elif base_score < 40 and pitch_score >= 40:
        feedback['focus_areas'].append('Focus on pronunciation and timing')
    elif pitch_score < 40 and base_score < 40:
        feedback['focus_areas'].append('Practice both pitch and pronunciation together')
    
    # ENHANCEMENT: Generate enhanced segment-level feedback with specific issues
    if segments and len(segments) > 0:
        segment_feedback = []
        for i, seg in enumerate(segments):
            seg_score = seg.get('score', 0.0)
            seg_accuracy = seg.get('accuracy', 'low')
            
            seg_fb = {
                'segment_index': i,
                'start': seg.get('start', 0.0),
                'end': seg.get('end', 0.0),
                'score': seg_score,
                'label': '',
                'message': '',
                'issues': [],  # NEW: Specific issues
                'practiceTechnique': ''  # NEW: Suggested practice technique
            }
            
            # ENHANCEMENT: Analyze pitch data for specific issues if available
            if pitch_data and isinstance(pitch_data, dict):
                ref_pitch = pitch_data.get('reference', [])
                student_pitch = pitch_data.get('student', [])
                
                if ref_pitch and student_pitch:
                    # Find pitch points in this segment
                    seg_start = seg.get('start', 0.0)
                    seg_end = seg.get('end', 0.0)
                    
                    ref_seg_pitches = [p for p in ref_pitch if seg_start <= p.get('time', 0) < seg_end and p.get('f_hz')]
                    student_seg_pitches = [p for p in student_pitch if seg_start <= p.get('time', 0) < seg_end and p.get('f_hz')]
                    
                    if ref_seg_pitches and student_seg_pitches:
                        ref_avg = np.mean([p.get('f_hz') for p in ref_seg_pitches])
                        student_avg = np.mean([p.get('f_hz') for p in student_seg_pitches])
                        
                        # Detect pitch issues
                        pitch_diff_percent = abs((student_avg - ref_avg) / ref_avg * 100) if ref_avg > 0 else 0
                        if pitch_diff_percent > 10:
                            if student_avg > ref_avg:
                                seg_fb['issues'].append('pitch_too_high')
                            else:
                                seg_fb['issues'].append('pitch_too_low')
                        
                        # Detect timing issues (compare durations)
                        ref_duration = max([p.get('time', 0) for p in ref_seg_pitches]) - min([p.get('time', 0) for p in ref_seg_pitches])
                        student_duration = max([p.get('time', 0) for p in student_seg_pitches]) - min([p.get('time', 0) for p in student_seg_pitches])
                        if ref_duration > 0:
                            timing_diff = abs((student_duration - ref_duration) / ref_duration * 100)
                            if timing_diff > 15:
                                if student_duration > ref_duration:
                                    seg_fb['issues'].append('timing_too_slow')
                                else:
                                    seg_fb['issues'].append('timing_too_fast')
            
            # Enhanced non-judgmental segment feedback with specific issues
            if seg_score >= 80:
                seg_fb['label'] = 'Strong'
                seg_fb['message'] = 'This section matches well'
                if not seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Maintain this level of accuracy'
            elif seg_score >= 60:
                seg_fb['label'] = 'Good'
                seg_fb['message'] = 'This section is coming along'
                if 'pitch_too_high' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Try lowering your pitch slightly'
                elif 'pitch_too_low' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Try raising your pitch slightly'
                elif 'timing_too_slow' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Practice maintaining a steady pace'
                elif 'timing_too_fast' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Take your time, don\'t rush'
                else:
                    seg_fb['practiceTechnique'] = 'Continue practicing this section'
            elif seg_score >= 40:
                seg_fb['label'] = 'Developing'
                seg_fb['message'] = 'Keep practicing this section'
                if 'pitch_too_high' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Focus on matching the reference pitch - try lowering your voice'
                elif 'pitch_too_low' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Focus on matching the reference pitch - try raising your voice'
                elif 'timing_too_slow' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Practice with the reference to match the rhythm'
                elif 'timing_too_fast' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Slow down and match the reference timing'
                else:
                    seg_fb['practiceTechnique'] = 'Listen to the reference and repeat this section'
            else:
                seg_fb['label'] = 'Practice'
                seg_fb['message'] = 'Focus on this section'
                if 'pitch_too_high' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Practice this section slowly, focusing on lowering your pitch to match'
                elif 'pitch_too_low' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Practice this section slowly, focusing on raising your pitch to match'
                elif 'timing_too_slow' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Practice with a metronome or reference audio to improve timing'
                elif 'timing_too_fast' in seg_fb['issues']:
                    seg_fb['practiceTechnique'] = 'Slow down and practice each word carefully'
                else:
                    seg_fb['practiceTechnique'] = 'Repeat this section multiple times while listening to the reference'
            
            segment_feedback.append(seg_fb)
        
        feedback['segment_feedback'] = segment_feedback
        
        # ENHANCEMENT: Identify consistent problem areas
        low_score_segments = [seg for seg in segment_feedback if seg.get('score', 0) < 40]
        if len(low_score_segments) > len(segments) * 0.3:  # More than 30% low scores
            feedback['suggestions'].append('Focus on the sections marked for practice - they need more attention')
        
        # Identify most common issues
        all_issues = []
        for seg in segment_feedback:
            all_issues.extend(seg.get('issues', []))
        if all_issues:
            issue_counts = Counter(all_issues)
            most_common = issue_counts.most_common(1)[0]
            if most_common[1] > len(segments) * 0.2:  # Appears in >20% of segments
                issue_name = most_common[0]
                if issue_name == 'pitch_too_high':
                    feedback['suggestions'].append('Your overall pitch tends to be higher than the reference - try lowering it')
                elif issue_name == 'pitch_too_low':
                    feedback['suggestions'].append('Your overall pitch tends to be lower than the reference - try raising it')
                elif issue_name == 'timing_too_slow':
                    feedback['suggestions'].append('Your timing is slower than the reference - practice maintaining pace')
                elif issue_name == 'timing_too_fast':
                    feedback['suggestions'].append('Your timing is faster than the reference - slow down and match the rhythm')
    
    return feedback

def calculate_similarity_score(reference_path: str, user_path: str, return_segments: bool = False, return_pitch: bool = False, return_ayah_timing: bool = False, text_segments: List[Dict] = None) -> Union[float, Tuple, Dict]:
    """
    Calculate similarity score between reference and user audio using multiple features + DTW.
    Returns a score from 0-100, where 100 is perfect similarity.
    
    Args:
        reference_path: Path to reference audio file
        user_path: Path to user audio file
        return_segments: If True, include per-segment scores
        return_pitch: If True, include pitch data
        return_ayah_timing: If True, include ayah text timing
        
    Returns:
        Score and optionally segments, pitch_data, and ayah_timing based on flags
    """
    converted_ref = None
    converted_user = None
    
    try:
        # Verify files exist
        ref_path = Path(reference_path)
        user_path_obj = Path(user_path)
        
        if not ref_path.exists():
            raise FileNotFoundError(f"Reference audio file not found: {reference_path}")
        if not user_path_obj.exists():
            raise FileNotFoundError(f"User audio file not found: {user_path}")
        
        # Check file sizes
        ref_size = ref_path.stat().st_size
        user_size = user_path_obj.stat().st_size
        
        if ref_size == 0:
            raise ValueError(f"Reference audio file is empty: {reference_path}")
        if user_size == 0:
            raise ValueError(f"User audio file is empty: {user_path}")
        
        logger.info(f"Loading audio files: ref={ref_size} bytes, user={user_size} bytes")
        
        # Convert to WAV if necessary
        converted_ref = convert_to_wav(reference_path)
        converted_user = convert_to_wav(user_path)
        
        # Load audio files with error handling - using reduced sample rate for memory efficiency
        PROCESSING_SAMPLE_RATE = 16000  # Reduced from 22050 to save memory (~27% reduction)
        try:
            ref_audio, ref_sr = librosa.load(converted_ref, sr=PROCESSING_SAMPLE_RATE, mono=True)
            logger.info(f"Loaded reference audio: {len(ref_audio)} samples, {ref_sr} Hz")
            
            # Delete converted file immediately if different from original to free disk/memory
            if converted_ref != reference_path and Path(converted_ref).exists():
                try:
                    os.remove(converted_ref)
                    logger.info(f"Deleted temporary converted ref file: {converted_ref}")
                except Exception as e:
                    logger.warning(f"Could not delete temp ref file: {e}")
        except Exception as e:
            raise ValueError(f"Failed to load reference audio: {str(e)}")
        
        try:
            user_audio, user_sr = librosa.load(converted_user, sr=PROCESSING_SAMPLE_RATE, mono=True)
            logger.info(f"Loaded user audio: {len(user_audio)} samples, {user_sr} Hz")
            
            # Delete converted file immediately if different from original to free disk/memory
            if converted_user != user_path and Path(converted_user).exists():
                try:
                    os.remove(converted_user)
                    logger.info(f"Deleted temporary converted user file: {converted_user}")
                except Exception as e:
                    logger.warning(f"Could not delete temp user file: {e}")
        except Exception as e:
            raise ValueError(f"Failed to load user audio: {str(e)}")
        
        # Check if audio is too short (adjusted for 16000 Hz sample rate)
        if len(ref_audio) < 800:  # Less than ~0.05 seconds at 16000 Hz
            raise ValueError("Reference audio is too short (less than 0.05 seconds)")
        if len(user_audio) < 800:
            raise ValueError("User audio is too short (less than 0.05 seconds)")
        
        # Step 2: Enhanced preprocessing with noise reduction for stability
        # Apply noise reduction to reduce impact of background noise, spikes, and artifacts
        logger.info("Preprocessing audio: normalization + noise reduction for stability")
        
        # Normalize first
        ref_audio_normalized = librosa.util.normalize(ref_audio)
        user_audio_normalized = librosa.util.normalize(user_audio)
        
        # Apply noise reduction for better pitch extraction stability
        # This reduces impact of noise, spikes, and artifacts on scoring
        try:
            if len(ref_audio_normalized) > 2048:
                ref_audio_processed = reduce_noise(ref_audio_normalized, ref_sr)
                logger.info("Applied noise reduction to reference audio")
            else:
                ref_audio_processed = ref_audio_normalized
                logger.info("Reference audio too short for noise reduction, using normalized only")
        except Exception as e:
            logger.warning(f"Noise reduction failed for reference: {e}, using normalized audio")
            ref_audio_processed = ref_audio_normalized
        
        try:
            if len(user_audio_normalized) > 2048:
                user_audio_processed = reduce_noise(user_audio_normalized, user_sr)
                logger.info("Applied noise reduction to user audio")
            else:
                user_audio_processed = user_audio_normalized
                logger.info("User audio too short for noise reduction, using normalized only")
        except Exception as e:
            logger.warning(f"Noise reduction failed for user: {e}, using normalized audio")
            user_audio_processed = user_audio_normalized
        
        logger.info(f"After normalization: ref={len(ref_audio_processed)} samples, user={len(user_audio_processed)} samples")
        
        # Compute durations for downsampling / time grid alignment
        # Use processed audio duration (normalized, not trimmed - matches extract-pitch behavior)
        ref_duration = len(ref_audio_processed) / float(ref_sr) if ref_sr and ref_sr > 0 else 0.0
        user_duration = len(user_audio_processed) / float(user_sr) if user_sr and user_sr > 0 else 0.0

        logger.info(f"Durations: ref_duration={ref_duration:.3f}s, user_duration={user_duration:.3f}s")

        # Silence detection: if user audio is mostly silent, return low score (fixes high baseline floor)
        try:
            ref_rms_energy = np.sqrt(np.mean(ref_audio_processed ** 2)) if len(ref_audio_processed) > 0 else 0.0
            user_rms_energy = np.sqrt(np.mean(user_audio_processed ** 2)) if len(user_audio_processed) > 0 else 0.0
            ref_max_amplitude = np.max(np.abs(ref_audio_processed)) if len(ref_audio_processed) > 0 else 0.0
            user_max_amplitude = np.max(np.abs(user_audio_processed)) if len(user_audio_processed) > 0 else 0.0
            logger.info(
                f"Audio energy: ref_RMS={ref_rms_energy:.6f}, ref_max={ref_max_amplitude:.6f}, "
                f"user_RMS={user_rms_energy:.6f}, user_max={user_max_amplitude:.6f}"
            )
            # User is effectively silence: RMS very low or user < 8% of reference energy (client: silence should be close to 0%)
            silence_rms_threshold = 0.003
            if user_rms_energy < silence_rms_threshold or (ref_rms_energy > 0.008 and user_rms_energy < 0.08 * ref_rms_energy):
                logger.warning(f"User audio detected as silence or near-silence (user_RMS={user_rms_energy:.6f}). Returning low score.")
                _silence_score = 2.0  # Very low score for silence (client: close to 0%, PDF Recording 4 = 3%)
                if return_segments or return_pitch or return_ayah_timing:
                    segments_out = []
                    if return_segments and text_segments:
                        for i, seg in enumerate(text_segments):
                            seg_start = float(seg.get('start', 0))
                            seg_end = float(seg.get('end', 0))
                            if ref_duration and seg_end <= 1.0:
                                seg_start = seg_start * ref_duration
                                seg_end = seg_end * ref_duration
                            segments_out.append({
                                'segment_index': i, 'score': _silence_score, 'start_time': seg_start, 'end_time': seg_end,
                                'start': seg_start, 'end': seg_end, 'accuracy': 'low', 'text': seg.get('text', '')
                            })
                    elif return_segments:
                        n_seg = max(1, int(ref_duration / 2))
                        for i in range(n_seg):
                            s = (i / n_seg) * ref_duration
                            e = ((i + 1) / n_seg) * ref_duration
                            segments_out.append({
                                'segment_index': i, 'score': _silence_score, 'start_time': s, 'end_time': e,
                                'start': s, 'end': e, 'accuracy': 'low'
                            })
                    ret = [_silence_score]
                    if return_segments:
                        ret.append(segments_out)
                    if return_pitch:
                        ret.append({})
                    if return_ayah_timing:
                        ret.append([])
                    return tuple(ret) if len(ret) > 1 else ret[0]
                return _silence_score
        except Exception as e:
            logger.warning(f"Silence/energy check failed: {e}")

        # Extract pitch data if requested (or if segment scores need pitch blend)
        pitch_data = {}
        if return_pitch or return_segments:
            try:
                logger.info("Extracting pitch data...")
                # Extract pitch from processed audio
                ref_pitch = extract_pitch(ref_audio_processed, ref_sr)
                logger.info(f"Reference pitch extracted: {len(ref_pitch)} points")

                user_pitch = extract_pitch(user_audio_processed, user_sr)
                logger.info(f"Student pitch extracted: {len(user_pitch)} points")

                # If both pitch arrays are empty: log and continue (frontend will show 'Pitch Data Unavailable')
                if (not ref_pitch or len(ref_pitch) == 0) and (not user_pitch or len(user_pitch) == 0):
                    logger.error("Both reference and student pitch extraction returned no frames. Check audio preprocessing and extraction pipeline.")

                # Calculate error points (where pitch deviates significantly)
                error_points = []
                if ref_pitch and user_pitch and len(ref_pitch) > 0 and len(user_pitch) > 0:
                    try:
                        # Create time-indexed dicts of voiced frames
                        ref_dict = {p['time']: p for p in ref_pitch if p.get('f_hz') is not None and p.get('f_hz') > 0}
                        user_dict = {p['time']: p for p in user_pitch if p.get('f_hz') is not None and p.get('f_hz') > 0}

                        if ref_dict and user_dict:
                            # Combine times and check deviations
                            all_times = sorted(set(list(ref_dict.keys()) + list(user_dict.keys())))
                            time_tolerance = 0.1  # 100ms tolerance

                            # Limit processing to avoid long loops
                            max_points = 1000
                            if len(all_times) > max_points:
                                step = max(1, len(all_times) // max_points)
                                all_times = all_times[::step]

                            for time in all_times:
                                try:
                                    # Find nearest times in each dict
                                    ref_time = min(ref_dict.keys(), key=lambda t: abs(t - time)) if ref_dict else None
                                    user_time = min(user_dict.keys(), key=lambda t: abs(t - time)) if user_dict else None

                                    if ref_time is not None and user_time is not None and abs(ref_time - time) < time_tolerance and abs(user_time - time) < time_tolerance:
                                        ref_p = ref_dict[ref_time].get('f_hz')
                                        user_p = user_dict[user_time].get('f_hz')
                                        if ref_p and user_p and ref_p > 0 and user_p > 0:
                                            deviation = abs(ref_p - user_p) / ref_p
                                            if deviation > 0.15:  # 15% deviation threshold
                                                error_points.append(float(time))
                                except Exception as e:
                                    logger.warning(f"Error comparing pitch at time {time}: {e}")
                                    continue
                    except Exception as e:
                        logger.error(f"Error calculating error points: {e}", exc_info=True)
                        error_points = []

                # Downsample pitch data for better performance (15ms hop = ~67 points/second)
                # NOTE: pass duration_seconds to ensure full-time grid and alignment
                # Keep both curves on the same reference timeline so graph/playback stay synchronized.
                # Using different duration grids (ref vs user) can create progressive visual drift.
                ref_pitch_downsampled = downsample_pitch(ref_pitch, duration_seconds=ref_duration, target_hop_ms=15.0)
                user_pitch_downsampled = downsample_pitch(user_pitch, duration_seconds=ref_duration, target_hop_ms=15.0)

                pitch_data = {
                    'reference': ref_pitch_downsampled,
                    'student': user_pitch_downsampled,
                    'errorPoints': error_points
                }
                logger.info(f"Pitch data prepared: ref={len(ref_pitch_downsampled)} points (from {len(ref_pitch)}), user={len(user_pitch_downsampled)} points (from {len(user_pitch)}), {len(error_points)} error points")
            except Exception as e:
                logger.error(f"Error in pitch extraction pipeline: {e}", exc_info=True)
                # Return empty pitch data instead of crashing
                pitch_data = {
                    'reference': [],
                    'student': [],
                    'errorPoints': []
                }

        # No-voice check using pitch: if user has very little voiced content vs reference, treat as silence (client: Recording 3 "No Voice (Mic Active)" was 21% - should be close to 0%)
        if isinstance(pitch_data, dict):
            ref_list = pitch_data.get('reference') or []
            user_list = pitch_data.get('student') or []
            ref_voiced = sum(1 for p in ref_list if p.get('f_hz') and float(p.get('f_hz', 0)) > 0)
            user_voiced = sum(1 for p in user_list if p.get('f_hz') and float(p.get('f_hz', 0)) > 0)
            if ref_voiced >= 30 and user_voiced < max(15, 0.12 * ref_voiced):
                logger.warning(f"No-voice check: user voiced points={user_voiced}, ref={ref_voiced}. Returning low score.")
                _no_voice_score = 2.0
                if return_segments or return_pitch or return_ayah_timing:
                    segs_out = []
                    if return_segments and text_segments:
                        for i, seg in enumerate(text_segments):
                            s0 = float(seg.get('start', 0)); e0 = float(seg.get('end', 0))
                            if ref_duration and e0 <= 1.0: s0, e0 = s0 * ref_duration, e0 * ref_duration
                            segs_out.append({'segment_index': i, 'score': _no_voice_score, 'start_time': s0, 'end_time': e0, 'start': s0, 'end': e0, 'accuracy': 'low', 'text': seg.get('text', '')})
                    elif return_segments and ref_duration:
                        n = max(1, int(ref_duration / 2))
                        for i in range(n):
                            s0 = (i / n) * ref_duration; e0 = ((i + 1) / n) * ref_duration
                            segs_out.append({'segment_index': i, 'score': _no_voice_score, 'start_time': s0, 'end_time': e0, 'start': s0, 'end': e0, 'accuracy': 'low'})
                    ret = [_no_voice_score]
                    if return_segments: ret.append(segs_out)
                    if return_pitch: ret.append(pitch_data)
                    if return_ayah_timing: ret.append([])
                    return tuple(ret) if len(ret) > 1 else ret[0]
                return _no_voice_score

        # Extract multiple features
        logger.info("Extracting audio features...")
        ref_features = extract_features(ref_audio_processed, ref_sr)
        user_features = extract_features(user_audio_processed, user_sr)
        
        logger.info(f"Extracted features: {list(ref_features.keys())}")
        
        # Calculate similarity scores for each feature type using DTW
        logger.info("Calculating feature similarities using DTW...")
        feature_similarities = calculate_feature_similarity(ref_features, user_features)
        
        logger.info(f"Feature similarities (0-1 scale): {feature_similarities}")
        
        # CRITICAL: If all feature similarities are very low, audio is completely different
        # This is a safety net in case silence detection didn't catch everything
        if feature_similarities:
            max_similarity = max(feature_similarities.values())
            avg_similarity = sum(feature_similarities.values()) / len(feature_similarities)
            # If max similarity < 0.05 and avg < 0.03, audio is effectively completely different
            if max_similarity < 0.05 and avg_similarity < 0.03:
                logger.warning(f"All feature similarities are very low (max={max_similarity:.4f}, avg={avg_similarity:.4f}). Audio is completely different. Returning score of 0.")
                if return_segments or return_pitch or return_ayah_timing:
                    segments = []
                    if return_segments:
                        num_segments = 5
                        for i in range(num_segments):
                            segments.append({
                                'segment_index': i,
                                'score': 0.0,
                                'start_time': float(i * user_duration / num_segments) if user_duration > 0 else 0.0,
                                'end_time': float((i + 1) * user_duration / num_segments) if user_duration > 0 else 0.0
                            })
                    
                    return_values = [0.0]
                    if return_segments:
                        return_values.append(segments)
                    if return_pitch:
                        return_values.append({})
                    if return_ayah_timing:
                        return_values.append([])
                    
                    return tuple(return_values) if len(return_values) > 1 else return_values[0]
                else:
                    return 0.0
        
        # Weight different features for assessment scoring.
        # Keep pronunciation/audio features meaningful, but reduce over-penalizing
        # different microphones, voice timbre, and recording devices.
        feature_weights = {
            'mfcc': 0.25,              # Pronunciation/timbre, but device-sensitive
            'chroma': 0.35,            # Tonal/tarannum pattern
            'spectral_contrast': 0.15, # Audio spectral match
            'tonnetz': 0.10,           # Tonal quality
            'zcr': 0.15                # Rhythm/tempo proxy
        }
        
        # Calculate weighted average similarity score
        total_weight = 0.0
        weighted_similarity = 0.0
        
        for feature_name, similarity in feature_similarities.items():
            weight = feature_weights.get(feature_name, 0.0)
            weighted_similarity += similarity * weight
            total_weight += weight
        
        # Base feature score (0-100) from MFCC + other features
        if total_weight > 0:
            # Convert from 0-1 similarity to 0-100 score
            base_score = (weighted_similarity / total_weight) * 100.0
        else:
            base_score = 0.0
        
        # Ensure base score is in valid range
        base_score = max(0.0, min(100.0, base_score))

        # Optional: compute relative pitch contour similarity (0–100)
        # Enhanced with range normalization, octave-agnostic mode, and stability scoring
        pitch_shape_score = 0.0
        pitch_stability_metrics = None
        try:
            if isinstance(pitch_data, dict):
                ref_pitch_ds = pitch_data.get("reference") or []
                user_pitch_ds = pitch_data.get("student") or []
                if ref_pitch_ds and user_pitch_ds:
                    # Call enhanced pitch similarity with stability metrics
                    result = compute_pitch_similarity(
                        ref_pitch_ds, 
                        user_pitch_ds,
                        normalize_range=True,  # Enable range normalization for fairness
                        octave_agnostic=False,  # Can be enabled via config if needed
                        return_stability=True,  # Return stability metrics
                        tolerance_cents=80.0,   # Favor overall contour similarity over brief spikes
                    )
                    # Handle both old (float) and new (tuple) return types
                    if isinstance(result, tuple):
                        pitch_shape_score, pitch_stability_metrics = result
                    else:
                        pitch_shape_score = result
        except Exception as e:
            logger.warning(f"Error computing blended pitch shape score: {e}", exc_info=True)
            pitch_shape_score = 0.0
            pitch_stability_metrics = None

        # --- TARANNUM-AWARE ASSESSMENT NORMALIZATION ---
        # Assessment remains strict for silence/wrong audio, but gives more credit
        # when the visible pitch contour and ayah segments improve.
        w_base = 0.4
        w_pitch = 0.6

        if pitch_shape_score < 15.0 and base_score > 25.0:
            logger.info(
                "Very low pitch similarity (%.2f%%) with moderate base score (%.2f%%), increasing base weight",
                pitch_shape_score,
                base_score,
            )
            w_base = 0.6
            w_pitch = 0.4

        raw_blend = _clamp(w_base * base_score + w_pitch * pitch_shape_score)

        base_expanded = _gamma_expand(base_score, gamma=0.75)
        pitch_expanded = _gamma_expand(pitch_shape_score, gamma=0.85)
        expanded_blend = _clamp(w_base * base_expanded + w_pitch * pitch_expanded)

        mismatch = abs(base_score - pitch_shape_score)
        if mismatch >= 30.0:
            penalty = min(10.0, (mismatch - 30.0) * (10.0 / 40.0))
            expanded_blend = _clamp(expanded_blend - penalty)
            logger.info(f"Mismatch penalty: |base-pitch|={mismatch:.1f} -> -{penalty:.1f} (score={expanded_blend:.1f})")

        final_score = expanded_blend

        if base_score >= 30.0 and pitch_shape_score >= 30.0 and 30.0 <= final_score <= 65.0:
            before = final_score
            final_score = _midrange_rescale(final_score, 30.0, 65.0, 52.0, 88.0)
            logger.info(
                f"Mid-range rescaling: raw={before:.1f}% -> {final_score:.1f}% (base={base_score:.1f}, pitch={pitch_shape_score:.1f})"
            )

        if pitch_shape_score < 15.0 and base_score < 35.0:
            cap = min(12.0, 0.5 * max(base_score, pitch_shape_score))
            final_score = min(final_score, cap)
            logger.info(
                "Wrong-content gate (strong): pitch=%.1f%%, base=%.1f%% -> cap=%.1f%%, final=%.1f%%",
                pitch_shape_score,
                base_score,
                cap,
                final_score,
            )
        elif pitch_shape_score < 25.0 and base_score < 40.0:
            cap = min(35.0, 0.9 * max(base_score, pitch_shape_score))
            final_score = min(final_score, cap)
            logger.info(
                "Wrong-content gate: pitch=%.1f%%, base=%.1f%% -> cap=%.1f%%, final=%.1f%%",
                pitch_shape_score,
                base_score,
                cap,
                final_score,
            )
        elif pitch_shape_score < 35.0 and base_score < 45.0:
            cap = min(45.0, 1.05 * max(base_score, pitch_shape_score))
            final_score = min(final_score, cap)
            logger.info(
                "Low-signal gate: pitch=%.1f%%, base=%.1f%% -> cap=%.1f%%, final=%.1f%%",
                pitch_shape_score,
                base_score,
                cap,
                final_score,
            )
        elif pitch_shape_score < 35.0 or base_score < 35.0:
            cap = min(55.0, 1.15 * max(base_score, pitch_shape_score))
            final_score = min(final_score, cap)
            logger.info(
                "Soft low-component gate: pitch=%.1f%%, base=%.1f%% -> cap=%.1f%%, final=%.1f%%",
                pitch_shape_score,
                base_score,
                cap,
                final_score,
            )

        if base_score >= 40.0 and pitch_shape_score >= 40.0:
            avg_exp = (base_expanded + pitch_expanded) / 2.0
            boosted = min(100.0, 48.0 + (avg_exp - 40.0) * 1.35)
            final_score = max(final_score, boosted)
            final_score = min(100.0, final_score)
            logger.info(f"Near-perfect reward: base={base_score:.1f}%, pitch={pitch_shape_score:.1f}% -> final={final_score:.1f}%")

        final_score = calibrate_score(
            final_score,
            base_score,
            pitch_shape_score,
            ref_audio_processed,
            ref_sr,
        )
        final_score = _clamp(final_score)

        # Tuning diagnostics requested by client: expose raw/step-wise values to logs
        raw_base_score = _clamp(base_score)
        raw_pitch_contour_score = _clamp(pitch_shape_score)
        blended_score_before_rescaling = _clamp(raw_blend)
        final_score_after_rescaling = _clamp(final_score)
        logger.info(
            "Scoring diagnostics: raw_base_score=%.2f, raw_pitch_contour_score=%.2f, "
            "blended_score_before_rescaling=%.2f, final_score_after_rescaling=%.2f",
            raw_base_score,
            raw_pitch_contour_score,
            blended_score_before_rescaling,
            final_score_after_rescaling,
        )
        
        # Log individual feature contributions
        feature_contributions = {}
        feature_scores = {}
        for feature_name, similarity in feature_similarities.items():
            weight = feature_weights.get(feature_name, 0.0)
            contribution = similarity * weight * 100
            feature_scores[feature_name] = round(similarity * 100.0, 2)
            feature_contributions[feature_name] = {
                'similarity': round(similarity, 3),
                'weight': weight,
                'contribution': round(contribution, 2)
            }
        
        logger.info(f"Feature contributions: {feature_contributions}")
        logger.info(f"Base feature score: {base_score:.2f}%, pitch contour score: {pitch_shape_score:.2f}%, final similarity score: {final_score:.2f}%")
        
        # Calculate segment scores if requested (blended MFCC + pitch when pitch_data available)
        segments = []
        segment_based_overall = None
        if return_segments:
            logger.info("Calculating per-segment scores (MFCC + pitch blend)...")
            ref_duration = len(ref_audio_processed) / float(ref_sr) if ref_sr > 0 else 0.0
            segment_pitch_data = None
            if isinstance(pitch_data, dict) and pitch_data.get('reference') and pitch_data.get('student'):
                segment_pitch_data = pitch_data
            # Compute full-audio DTW path for MFCC so segment scoring uses aligned user segments (fixes segments never exceeding 50%)
            mfcc_path = None
            if text_segments and 'mfcc' in ref_features and 'mfcc' in user_features:
                try:
                    ref_t = ref_features['mfcc'].T
                    user_t = user_features['mfcc'].T
                    _, mfcc_path = fastdtw(ref_t, user_t, dist=euclidean)
                    logger.info("Using DTW path for aligned segment scoring")
                except Exception as e:
                    logger.warning(f"Could not compute DTW path for segments: {e}")
            segments = calculate_segment_scores(ref_features, user_features, 
                                               num_segments=None,
                                               audio_duration=ref_duration,
                                               text_segments=text_segments,
                                               pitch_data=segment_pitch_data,
                                               dtw_path=mfcc_path)
            logger.info(f"Calculated {len(segments)} segment scores")
            # Product requirement: total score must directly reflect segment performance.
            # Use robust segment aggregation so one/two outlier segments do not overly
            # collapse total score while still staying fully segment-driven.
            if segments and ref_duration and ref_duration > 0:
                total_weight = 0.0
                weighted_sum = 0.0
                seg_scores = []
                seg_weights = []
                for seg in segments:
                    start_s = float(seg.get('start', seg.get('start_time', 0)))
                    end_s = float(seg.get('end', seg.get('end_time', 0)))
                    dur = max(0, end_s - start_s)
                    total_weight += dur
                    score = float(seg.get('score', 0))
                    weighted_sum += score * dur
                    seg_scores.append(score)
                    seg_weights.append(dur)
                if total_weight > 0:
                    weighted_mean = _clamp(float(weighted_sum / total_weight))
                    weighted_median = _weighted_median(seg_scores, seg_weights)
                    # Robust blend for segment-only view (kept for diagnostics/UI).
                    segment_based_overall = _clamp(0.7 * weighted_mean + 0.3 * weighted_median)
                    pre_segment_final = float(final_score)
                    # Tarannum-aware assessment: segments/ayah timing are meaningful,
                    # so they should move the total score visibly without dominating it.
                    final_score = _clamp(0.75 * pre_segment_final + 0.25 * segment_based_overall)
                    logger.info(
                        "Global-first total score: weighted_mean=%.2f, weighted_median=%.2f, "
                        "segment_based_overall=%.2f, pre_segment_final=%.2f, final=%.2f",
                        weighted_mean,
                        weighted_median,
                        segment_based_overall,
                        pre_segment_final,
                        final_score,
                    )
        
        # Extract ayah timing if requested
        ayah_timing = []
        if return_ayah_timing:
            try:
                # Get audio duration from reference audio (use processed audio length)
                ref_duration = len(ref_audio_processed) / float(ref_sr) if ref_sr > 0 else 0.0
                logger.info(f"Extracting ayah timing for {ref_duration:.2f}s audio...")
                ayah_timing = extract_ayah_timing(str(ref_path), ref_duration)
                logger.info(f"Extracted {len(ayah_timing)} ayah timing segments")
                user_duration = len(user_audio) / float(user_sr) if user_sr > 0 else 0.0

            except Exception as e:
                logger.error(f"Error extracting ayah timing: {e}", exc_info=True)
                ayah_timing = []
        
        # Recalculate segment scores with one coherent policy:
        # 1) keep local variation
        # 2) move toward global score in a controlled way
        # 3) force duration-weighted segment average to equal total score
        if return_segments and segments and isinstance(final_score, (int, float)):
            try:
                global_anchor = float(final_score)
                adjusted_segments = []
                local_scores = []
                seg_weights = []

                # First pass: local-to-global blended segment values.
                for seg in segments:
                    seg_copy = dict(seg)
                    local_score = float(seg_copy.get('score', 0.0))
                    start_s = float(seg_copy.get('start', seg_copy.get('start_time', 0.0)))
                    end_s = float(seg_copy.get('end', seg_copy.get('end_time', 0.0)))
                    dur = max(0.001, end_s - start_s)
                    local_scores.append(local_score)
                    seg_weights.append(dur)
                    seg_copy['score_raw'] = local_score
                    # Keep variation but softly anchor to total policy.
                    seg_copy['score'] = _clamp(0.7 * local_score + 0.3 * global_anchor)
                    adjusted_segments.append(seg_copy)

                # Second pass: enforce exact weighted-average consistency with total.
                total_w = float(sum(seg_weights))
                if total_w > 0:
                    current_wavg = sum(
                        float(seg.get('score', 0.0)) * w
                        for seg, w in zip(adjusted_segments, seg_weights)
                    ) / total_w
                    delta = global_anchor - current_wavg
                else:
                    delta = 0.0

                final_segments = []
                for seg in adjusted_segments:
                    seg_final = dict(seg)
                    corrected = _clamp(float(seg_final.get('score', 0.0)) + float(delta))
                    seg_final['score'] = round(corrected, 2)
                    seg_final['normalized'] = round(corrected, 2)
                    final_segments.append(seg_final)

                segments = final_segments
                logger.info(
                    "Segment policy recalculation: global_anchor=%.2f, correction_delta=%.2f, segments=%d",
                    global_anchor,
                    float(delta),
                    len(segments),
                )
            except Exception as e:
                logger.warning(f"Failed to apply segment policy recalculation: {e}", exc_info=True)

        # Cleanup large variables to free memory before returning
        try:
            import gc
            del ref_audio, user_audio, ref_audio_processed, user_audio_processed
            del ref_features, user_features
            gc.collect()  # Force garbage collection
            logger.info("Memory cleaned up after processing")
        except Exception as e:
            logger.warning(f"Error during memory cleanup: {e}")
        
        # Step 3: Generate enhanced training-friendly feedback (non-judgmental, encouraging)
        # Note: Previous attempts and attempt number would come from frontend/progress tracking
        # For now, we'll generate basic feedback, but the function supports enhanced features
        training_feedback = generate_training_feedback(
            final_score, 
            base_score, 
            pitch_shape_score,
            segments if return_segments else None,
            previous_attempts=None,  # Can be passed from frontend if available
            attempt_number=1,  # Can be passed from frontend if available
            pitch_data=pitch_data if return_pitch else None
        )
        
        # Add pitch stability metrics to pitch_data if available
        if return_pitch and pitch_stability_metrics is not None:
            if isinstance(pitch_data, dict):
                pitch_data['stability'] = pitch_stability_metrics
                logger.info("Added pitch stability metrics to pitch_data")
        
        # Detect training markers for student pitch data
        if return_pitch and isinstance(pitch_data, dict) and 'student' in pitch_data:
            try:
                student_pitch_list = pitch_data.get('student', [])
                if student_pitch_list and len(student_pitch_list) > 0:
                    # Calculate quality metrics for marker detection
                    quality_metrics = calculate_pitch_quality_metrics(student_pitch_list)
                    # Detect markers
                    markers = detect_training_markers(student_pitch_list, quality_metrics)
                    pitch_data['markers'] = markers
                    logger.info(f"Detected {len(markers)} training markers")
            except Exception as e:
                logger.warning(f"Error detecting training markers: {e}", exc_info=True)
                if isinstance(pitch_data, dict):
                    pitch_data['markers'] = []
        
        # Detect pronunciation confusion alerts (beta feature)
        pronunciation_alerts = []
        try:
            logger.info("Detecting pronunciation confusion alerts (beta)...")
            pronunciation_alerts = detect_pronunciation_confusion(
                student_audio_path=str(user_path),
                expected_text_segments=ayah_timing if ayah_timing else None,
                confidence_threshold=0.6
            )
            logger.info(f"Detected {len(pronunciation_alerts)} pronunciation alerts")
        except Exception as e:
            logger.warning(f"Error detecting pronunciation alerts: {e}", exc_info=True)
            pronunciation_alerts = []

        # Return based on what was requested
        # Build return tuple dynamically to handle all combinations
        return_values = [final_score]
        if return_segments:
            return_values.append(segments)
        if return_pitch:
            return_values.append(pitch_data)
        if return_ayah_timing:
            return_values.append(ayah_timing)
        
        # Always include pronunciation alerts (beta feature) - even if empty
        return_values.append(pronunciation_alerts)
        
        # Add score breakdown to training feedback for frontend display
        # Breakdown: base_score (pronunciation/timing) and pitch_shape_score (pitch accuracy)
        if isinstance(training_feedback, dict):
            training_feedback['scoreBreakdown'] = {
                'base_score': round(base_score, 2),
                'pitch_score': round(pitch_shape_score, 2),
                'audio_match_score': round(base_score, 2),
                'segment_consistency_score': (round(segment_based_overall, 2) if isinstance(segment_based_overall, (int, float)) else None),
                'raw_base_score': round(raw_base_score, 2),
                'raw_pitch_contour_score': round(raw_pitch_contour_score, 2),
                'feature_scores': feature_scores,
                'blended_score_before_rescaling': round(blended_score_before_rescaling, 2),
                'final_score_after_rescaling': round(final_score_after_rescaling, 2),
                'final_score_after_segment_fusion': round(final_score, 2),
                'segment_based_overall': (round(segment_based_overall, 2) if isinstance(segment_based_overall, (int, float)) else None),
                'assessment_weights': {
                    'pitch_contour': 40,
                    'segment_consistency': 25,
                    'tonal_audio_features': 20,
                    'pronunciation_like_audio_match': 15,
                },
            }
        
        # Always include training feedback as the last element
        return_values.append(training_feedback)
        
        # Return tuple with feedback included
        return tuple(return_values)
    
    except Exception as e:
        logger.error(f"Error in scoring: {e}", exc_info=True)
        raise  # Re-raise to let the API handle it
    
    finally:
        # Cleanup temporary WAV files
        try:
            if converted_ref and converted_ref != reference_path and os.path.exists(converted_ref):
                os.remove(converted_ref)
                logger.info(f"Cleaned up converted reference: {converted_ref}")
            if converted_user and converted_user != user_path and os.path.exists(converted_user):
                os.remove(converted_user)
                logger.info(f"Cleaned up converted user audio: {converted_user}")
        except Exception as cleanup_error:
            logger.warning(f"Error cleaning up converted files: {cleanup_error}")
