/**
 * Real-time pitch extraction for student voice using Web Audio API
 * TIMING FIX: Preserves exact recording timing - no silence trimming
 * Student can wait before speaking - graph will show accurate timing
 */

export interface PitchPoint {
  time: number; // Time in seconds (relative to recording start)
  frequency: number | null; // Frequency in Hz, null if unvoiced
  midi: number | null; // MIDI note number, null if unvoiced
  confidence: number; // 0-1 confidence score
}

export interface PitchFilterOptions {
  minHz?: number;        // Default: 0 (no minimum - capture all frequencies)
  maxHz?: number;        // Default: Infinity (no maximum - capture all frequencies)
  minConfidence?: number; // Default: 0.0 (no threshold - capture everything)
  smoothingWindow?: number; // Default: 1 (no smoothing - raw data)
  enabled?: boolean;     // Default: false (no filtering)
}

// Shared live pitch config used by both practice and recording graphs.
// Keeping one source of truth prevents behavior drift between modes.
export const LIVE_PITCH_FILTER_OPTIONS: PitchFilterOptions = {
  minHz: 60,
  maxHz: 1200,
  minConfidence: 0.45,
  smoothingWindow: 2,
  enabled: true,
};

/**
 * Filter pitch point by range and confidence
 * Returns null if pitch should be filtered out
 */
export function filterPitch(
  pitch: PitchPoint,
  options: PitchFilterOptions = {}
): PitchPoint | null {
  const {
    minHz = 0,           // No minimum - capture all frequencies
    maxHz = Infinity,    // No maximum - capture all frequencies
    minConfidence = 0.0,  // No threshold - capture everything
    enabled = false,      // Disabled by default - no filtering
  } = options;

  if (!enabled) {
    return pitch; // No filtering - return raw pitch data
  }

  if (pitch.frequency === null || pitch.frequency === undefined) {
    return { ...pitch, frequency: null, midi: null };
  }

  if (!isFinite(pitch.frequency)) {
    return { ...pitch, frequency: null, midi: null };
  }

  if (pitch.confidence < minConfidence) {
    return { ...pitch, frequency: null, midi: null };
  }

  if (pitch.frequency < minHz || pitch.frequency > maxHz) {
    return { ...pitch, frequency: null, midi: null };
  }

  return pitch;
}

/**
 * Smooth pitch data using weighted median (Savitzky-Golay-like)
 * Reduces noise spikes while preserving overall contour
 */
export function smoothPitchData(
  pitchData: PitchPoint[],
  windowSize: number = 7
): PitchPoint[] {
  if (pitchData.length === 0 || windowSize <= 1) {
    return pitchData;
  }

  const smoothed: PitchPoint[] = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < pitchData.length; i++) {
    const window = pitchData.slice(
      Math.max(0, i - halfWindow),
      Math.min(pitchData.length, i + halfWindow + 1)
    );
    
    const validFreqs = window
      .map(p => p.frequency)
      .filter(f => f !== null) as number[];
    
    if (validFreqs.length > 0) {
      // Use weighted average of middle 50% of values (rejects outliers)
      const sortedFreqs = [...validFreqs].sort((a, b) => a - b);
      
      // For better smoothing, use weighted average of middle 50% of values
      const startIdx = Math.floor(sortedFreqs.length * 0.25);
      const endIdx = Math.ceil(sortedFreqs.length * 0.75);
      const middleFreqs = sortedFreqs.slice(startIdx, endIdx);
      
      if (middleFreqs.length > 0) {
        const smoothedFreq = middleFreqs.reduce((a, b) => a + b, 0) / middleFreqs.length;
        
        smoothed.push({
          ...pitchData[i],
          frequency: smoothedFreq,
          midi: smoothedFreq ? 69 + 12 * Math.log2(smoothedFreq / 440) : null,
        });
      } else {
        // Fallback to median if no middle values
        const medianFreq = sortedFreqs[Math.floor(sortedFreqs.length / 2)];
        smoothed.push({
          ...pitchData[i],
          frequency: medianFreq,
          midi: medianFreq ? 69 + 12 * Math.log2(medianFreq / 440) : null,
        });
      }
    } else {
      smoothed.push(pitchData[i]);
    }
  }
  
  return smoothed;
}

export class RealTimePitchExtractor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Float32Array<ArrayBuffer> | null = null;
  private animationFrameId: number | null = null;
  private startTime: number = 0;
  private isRunning: boolean = false;
  private onPitchUpdate: ((pitch: PitchPoint) => void) | null = null;
  private stream: MediaStream | null = null;

  // Noise reduction: High-pass filter
  private highPassFilter: BiquadFilterNode | null = null;

  // Track previous pitch for smoothing (but NOT for gap filling)
  private previousFrequency: number | null = null;

  // EMA smoothing state for live pitch (continuous, less staircase than median).
  private emaFrequency: number | null = null;
  private readonly EMA_ALPHA = 0.35;
  private readonly MAX_VOICED_STEP_HZ = 75;
  private readonly OUTLIER_CENTS_THRESHOLD = 180;
  
  // Pitch filtering options - NO RANGE RESTRICTIONS
  private filterOptions: PitchFilterOptions = {
    minHz: 0,            // No minimum - capture all frequencies
    maxHz: Infinity,     // No maximum - capture all frequencies
    minConfidence: 0.0,  // No confidence threshold - capture everything
    smoothingWindow: 1,   // No smoothing - raw data only
    enabled: false,       // DISABLED - no filtering at all
  };
  
  // Recent pitch buffer for optional post-filter smoothing
  private recentPitchBuffer: PitchPoint[] = [];
  private readonly MAX_BUFFER_SIZE = 20;

  /**
   * Set pitch filter options
   */
  setFilterOptions(options: Partial<PitchFilterOptions>): void {
    this.filterOptions = { ...this.filterOptions, ...options };
  }

  /**
   * Detect if a frequency is an outlier based on recent frequencies
   */
  private detectOutlier(frequency: number, recentFreqs: number[]): boolean {
    if (recentFreqs.length < 3) return false;
    
    const mean = recentFreqs.reduce((a, b) => a + b, 0) / recentFreqs.length;
    const variance = recentFreqs.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / recentFreqs.length;
    const stdDev = Math.sqrt(variance);
    
    // If frequency is more than 2.5 standard deviations from mean, it's an outlier
    return Math.abs(frequency - mean) > 2.5 * stdDev;
  }

  /**
   * Light voiced outlier suppression:
   * - keeps natural contour changes
   * - suppresses short unstable jumps seen as spikes during recitation
   */
  private stabilizeVoicedFrequency(
    frequency: number,
    confidence: number
  ): number {
    const prev = this.previousFrequency;
    if (prev === null || !isFinite(prev) || prev <= 0) {
      return frequency;
    }

    const ratio = frequency / prev;
    const centsDelta = Math.abs(1200 * Math.log2(Math.max(ratio, 1e-6)));
    const recentVoiced = this.recentPitchBuffer
      .map((p) => p.frequency)
      .filter((f): f is number => f !== null && f !== undefined && isFinite(f));
    const isOutlier = this.detectOutlier(frequency, recentVoiced);

    // Only intervene on suspicious low/medium-confidence jumps.
    if (
      (isOutlier || centsDelta > this.OUTLIER_CENTS_THRESHOLD) &&
      confidence < 0.8
    ) {
      const lower = prev - this.MAX_VOICED_STEP_HZ;
      const upper = prev + this.MAX_VOICED_STEP_HZ;
      return Math.max(lower, Math.min(upper, frequency));
    }

    return frequency;
  }

  /**
   * Initialize pitch extraction from microphone stream
   */
  async startFromStream(
    stream: MediaStream,
    onPitchUpdate: (pitch: PitchPoint) => void,
    filterOptions?: Partial<PitchFilterOptions>
  ): Promise<void> {
    // Apply filter options if provided
    if (filterOptions) {
      this.setFilterOptions(filterOptions);
    }
    this.onPitchUpdate = onPitchUpdate;
    this.stream = stream;

    // Create AudioContext
    this.audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    // Create analyser node with optimal settings
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 8192; // Larger FFT for better low-frequency resolution
    this.analyser.smoothingTimeConstant = 0.3; // More smoothing for stability
    this.analyser.minDecibels = -100; // More sensitive to quiet sounds
    this.analyser.maxDecibels = -10;

    // Create high-pass filter for noise reduction - adjusted for better voice capture
    this.highPassFilter = this.audioContext.createBiquadFilter();
    this.highPassFilter.type = "highpass";
    this.highPassFilter.frequency.value = 60; // Lowered from 80Hz to preserve lower voice frequencies
    this.highPassFilter.Q.value = 0.7071; // Butterworth response

    // ADD: Create low-pass filter to remove high-frequency noise
    const lowPassFilter = this.audioContext.createBiquadFilter();
    lowPassFilter.type = "lowpass";
    lowPassFilter.frequency.value = 4000; // Increased from 3000Hz to preserve voice harmonics
    lowPassFilter.Q.value = 0.7071;

    // Connect: microphone -> high-pass -> low-pass -> analyser
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.highPassFilter);
    this.highPassFilter.connect(lowPassFilter);
    lowPassFilter.connect(this.analyser);

    // Initialize data array
    this.dataArray = new Float32Array(this.analyser.fftSize);

    // Reset state
    this.startTime = Date.now();
    this.isRunning = true;
    this.previousFrequency = null;
    this.emaFrequency = null;
    this.recentPitchBuffer = [];

    console.log(
      "[PitchExtractor] Started - timing preserved (no silence trimming)"
    );

    // Start extraction loop
    this.extractPitchLoop();
  }

  /**
   * Main pitch extraction loop
   * CRITICAL: Always outputs pitch points at correct time, even if null
   * This preserves timing so student can wait before speaking
   */
  private extractPitchLoop = () => {
    if (!this.isRunning || !this.analyser || !this.dataArray) {
      return;
    }

    // Get time-domain data (already filtered)
    this.analyser.getFloatTimeDomainData(this.dataArray);

    // Calculate current time FIRST - this is the exact recording time
    const time = (Date.now() - this.startTime) / 1000;

    // Calculate audio levels
    const maxAmplitude = Math.max(...Array.from(this.dataArray).map(Math.abs));
    const rms = Math.sqrt(
      Array.from(this.dataArray)
        .map((x) => x * x)
        .reduce((a, b) => a + b, 0) / this.dataArray.length
    );

    // Debug logging (every ~1 second)
    if (Math.random() < 0.017) {
      console.log(
        `[Pitch] Time: ${time.toFixed(2)}s, Max: ${maxAmplitude.toFixed(4)}, ` +
          `RMS: ${rms.toFixed(4)}, Freq: ${
            this.previousFrequency?.toFixed(1) || "null"
          }`
      );
    }

    // Detect pitch (or null if silent/unvoiced)
    const sampleRate = this.audioContext!.sampleRate;
    const pitchResult = this.detectPitch(
      this.dataArray,
      sampleRate,
      maxAmplitude,
      rms
    );

    let finalFrequency = pitchResult.frequency;
    let finalConfidence = pitchResult.confidence;

    // Create pitch point
    let pitchPoint: PitchPoint = {
      time, // Exact recording time - not shifted
      frequency: finalFrequency,
      midi: finalFrequency ? this.hzToMidi(finalFrequency) : null,
      confidence: finalConfidence,
    };

    // Apply filtering if enabled
    if (this.filterOptions.enabled) {
      const filtered = filterPitch(pitchPoint, this.filterOptions);
      if (filtered) {
        pitchPoint = filtered;
        finalFrequency = pitchPoint.frequency;
      } else {
        // Filtered out - set to null but keep time
        pitchPoint = { ...pitchPoint, frequency: null, midi: null };
        finalFrequency = null;
      }
    }

    // Light outlier filtering while voiced (before EMA) to reduce transient spikes.
    if (
      this.filterOptions.enabled &&
      finalFrequency !== null &&
      isFinite(finalFrequency)
    ) {
      finalFrequency = this.stabilizeVoicedFrequency(
        finalFrequency,
        finalConfidence
      );
      pitchPoint = {
        ...pitchPoint,
        frequency: finalFrequency,
        midi: finalFrequency ? this.hzToMidi(finalFrequency) : null,
      };
    }

    // Apply smoothing ONLY when explicitly requested via smoothingWindow > 1.
    // Live mode uses smoothingWindow=1 so extractor outputs near-raw pitch.
    if (
      this.filterOptions.enabled &&
      finalFrequency !== null &&
      this.filterOptions.smoothingWindow &&
      this.filterOptions.smoothingWindow > 1
    ) {
      // EMA smoothing produces a natural contour without staircase plateaus.
      finalFrequency =
        this.emaFrequency === null
          ? finalFrequency
          : this.emaFrequency + (finalFrequency - this.emaFrequency) * this.EMA_ALPHA;
      this.emaFrequency = finalFrequency;

      // Check for octave errors and correct them
      if (this.previousFrequency !== null && finalFrequency !== null) {
        const ratio = finalFrequency / this.previousFrequency;

        // If frequency jumped by ~octave, likely an error
        if (ratio > 1.9 && ratio < 2.1) {
          finalFrequency = finalFrequency / 2; // Octave down
        } else if (ratio > 0.48 && ratio < 0.52) {
          finalFrequency = finalFrequency * 2; // Octave up
        }
      }

      this.previousFrequency = finalFrequency;
      
      // Update pitch point with smoothed frequency
      pitchPoint = {
        ...pitchPoint,
        frequency: finalFrequency,
        midi: finalFrequency ? this.hzToMidi(finalFrequency) : null,
      };
    } else if (finalFrequency !== null) {
      // Keep raw frequency when smoothing is disabled.
      this.previousFrequency = finalFrequency;
    } else {
      // Null pitch - clear smoothing buffer to avoid stale data
      this.emaFrequency = null;
    }

    // Additional smoothing using recent pitch buffer (for visual stability)
    if (this.filterOptions.enabled && this.filterOptions.smoothingWindow && this.filterOptions.smoothingWindow > 1) {
      this.recentPitchBuffer.push(pitchPoint);
      if (this.recentPitchBuffer.length > this.MAX_BUFFER_SIZE) {
        this.recentPitchBuffer.shift();
      }
      
      // Apply smoothing to recent buffer
      if (this.recentPitchBuffer.length >= this.filterOptions.smoothingWindow) {
        const smoothed = smoothPitchData(
          this.recentPitchBuffer.slice(-this.filterOptions.smoothingWindow),
          this.filterOptions.smoothingWindow
        );
        if (smoothed.length > 0) {
          pitchPoint = smoothed[smoothed.length - 1];
        }
      }
    }

    // CRITICAL: Always send update with correct time, even if null
    // This ensures the graph shows silence/waiting accurately
    if (this.onPitchUpdate) {
      this.onPitchUpdate(pitchPoint);
    }

    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.extractPitchLoop);
  };

  /**
   * Detect pitch using autocorrelation
   * Returns null for silence/unvoiced - preserves timing
   */
  private detectPitch(
    buffer: Float32Array<ArrayBufferLike>,
    sampleRate: number,
    maxAmplitude: number,
    rms: number
  ): { frequency: number | null; confidence: number } {
    // Quick silence check - very lenient to capture all voice
    // Very low thresholds to ensure no voice is missed
    if (maxAmplitude < 0.0003 || rms < 0.0001) { // Very lenient - capture all voice
      return { frequency: null, confidence: 0.0 };
    }

    const minPeriod = Math.floor(sampleRate / 1200); // Max frequency: 1200 Hz
    const maxPeriod = Math.floor(sampleRate / 60); // Min frequency: 60 Hz

    // DC removal
    const mean = buffer.reduce((a, b) => a + b, 0) / buffer.length;
    const normalized = Array.from(buffer).map((x) => x - mean);

    // Calculate energy
    const energy =
      normalized.reduce((sum, val) => sum + val * val, 0) / normalized.length;

    // More lenient energy threshold
    if (energy < 0.00012) {
      return { frequency: null, confidence: 0.0 };
    }

    const rmsNorm = Math.sqrt(energy);

    // Autocorrelation search
    let bestPeriod = 0;
    let bestCorrelation = -Infinity;
    let secondBestCorrelation = -Infinity;

    // Search all periods thoroughly
    for (
      let period = minPeriod;
      period < maxPeriod && period < normalized.length / 2;
      period++
    ) {
      let correlation = 0;
      let sumSquares = 0;
      const maxOffset = Math.min(normalized.length - period, 4096);

      // Full autocorrelation
      for (let i = 0; i < maxOffset; i++) {
        const val1 = normalized[i];
        const val2 = normalized[i + period];
        correlation += val1 * val2;
        sumSquares += val2 * val2;
      }

      // Normalize by geometric mean
      const normalizedCorrelation =
        correlation /
        (Math.sqrt(sumSquares * maxOffset * rmsNorm * rmsNorm) + 0.00001);

      if (normalizedCorrelation > bestCorrelation) {
        secondBestCorrelation = bestCorrelation;
        bestCorrelation = normalizedCorrelation;
        bestPeriod = period;
      } else if (normalizedCorrelation > secondBestCorrelation) {
        secondBestCorrelation = normalizedCorrelation;
      }
    }

    // Threshold for voiced detection - balanced for quality
    const CORRELATION_THRESHOLD = 0.13;

    if (bestCorrelation < CORRELATION_THRESHOLD || bestPeriod === 0) {
      return { frequency: null, confidence: 0.0 };
    }

    const frequency = sampleRate / bestPeriod;

    // Validate frequency range
    if (frequency < 60 || frequency > 1200 || !isFinite(frequency)) {
      return { frequency: null, confidence: 0.0 };
    }

    // Calculate confidence
    const correlationStrength = Math.min(1.0, bestCorrelation * 2);
    const peakClarity =
      secondBestCorrelation > 0
        ? Math.min(
            1.0,
            (bestCorrelation - secondBestCorrelation) / bestCorrelation
          )
        : 1.0;

    const confidence = Math.min(
      0.95,
      correlationStrength * 0.6 + peakClarity * 0.4
    );

    return {
      frequency,
      confidence: Math.max(0.1, Math.min(1.0, confidence)),
    };
  }

  /**
   * Convert Hz to MIDI note number
   */
  private hzToMidi(freq: number): number {
    return 69 + 12 * Math.log2(freq / 440);
  }

  /**
   * Stop pitch extraction and cleanup
   */
  stop(): void {
    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.highPassFilter) {
      this.highPassFilter.disconnect();
      this.highPassFilter = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.analyser = null;
    this.dataArray = null;
    this.onPitchUpdate = null;
    this.previousFrequency = null;
    this.emaFrequency = null;
    this.recentPitchBuffer = [];

    console.log("[PitchExtractor] Stopped");
  }

  /**
   * Check if extractor is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current recording time in seconds
   */
  getCurrentTime(): number {
    if (!this.isRunning) return 0;
    return (Date.now() - this.startTime) / 1000;
  }
}
