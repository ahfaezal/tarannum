import argparse
import os
from pathlib import Path

import numpy as np
from scipy.io import wavfile

from scoring_engine import calculate_similarity_score


def generate_sine_wave(
    path: Path,
    freq_hz: float = 220.0,
    duration_s: float = 2.0,
    sr: int = 16000,
    noise_std: float = 0.0,
) -> None:
    """
    Generate a simple mono sine-wave test signal and write it as a WAV file.
    """
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    signal = np.sin(2 * np.pi * freq_hz * t)

    if noise_std > 0.0:
        signal = signal + np.random.normal(scale=noise_std, size=signal.shape)

    # Normalise to int16 range
    signal = np.clip(signal, -1.0, 1.0)
    int16_audio = (signal * 32767).astype(np.int16)
    wavfile.write(str(path), sr, int16_audio)


def run_one_test(ref_path: Path, user_path: Path, label: str) -> None:
    """
    Run similarity scoring for a single (reference, user) pair and print details.
    """
    print(f"\n=== {label} ===")
    print(f"Reference: {ref_path}")
    print(f"User     : {user_path}")

    # We requested: return_segments=True, return_pitch=True, return_ayah_timing=False
    # -> return values: (final_score, segments, pitch_data)
    score, segments, pitch_data = calculate_similarity_score(
        str(ref_path),
        str(user_path),
        return_segments=True,
        return_pitch=True,
        return_ayah_timing=False,
    )

    print(f"Total score      : {score:.2f}")

    if segments:
        seg_scores = [s.get("score", 0.0) for s in segments]
        if seg_scores:
            print(
                "Segment scores   : "
                f"min={min(seg_scores):.2f}, "
                f"max={max(seg_scores):.2f}, "
                f"avg={sum(seg_scores)/len(seg_scores):.2f}"
            )
        else:
            print("Segment scores   : (no segment scores returned)")
    else:
        print("Segment scores   : (segments not returned)")

    # Basic sanity on pitch_data presence
    if isinstance(pitch_data, dict):
        ref_pitch = pitch_data.get("reference") or []
        user_pitch = pitch_data.get("student") or []
        print(
            f"Pitch points     : ref={len(ref_pitch)} voiced+unvoiced, "
            f"user={len(user_pitch)} voiced+unvoiced"
        )
    else:
        print("Pitch data       : (not returned)")


def run_synthetic_tests(tmp_dir: Path) -> None:
    """
    Generate synthetic test WAVs and run a few sanity checks.

    This does not prove musical correctness, but quickly validates that:
    - Identical audio -> very high score
    - Slightly noisy but same pitch -> high score
    - Very different pitch -> clearly lower score
    """
    tmp_dir.mkdir(parents=True, exist_ok=True)

    ref = tmp_dir / "ref_220hz.wav"
    user_same = tmp_dir / "user_same_220hz.wav"
    user_noisy = tmp_dir / "user_noisy_220hz.wav"
    user_diff = tmp_dir / "user_diff_440hz.wav"

    # Reference and identical copy
    generate_sine_wave(ref, freq_hz=220.0, duration_s=2.0, noise_std=0.0)
    generate_sine_wave(user_same, freq_hz=220.0, duration_s=2.0, noise_std=0.0)

    # Same pitch with a bit of noise
    generate_sine_wave(user_noisy, freq_hz=220.0, duration_s=2.0, noise_std=0.02)

    # Different pitch
    generate_sine_wave(user_diff, freq_hz=440.0, duration_s=2.0, noise_std=0.0)

    print("Running synthetic sanity tests...")
    run_one_test(ref, user_same, "Test 1: Identical audio (expect ~90–100)")
    run_one_test(ref, user_noisy, "Test 2: Same pitch + noise (expect high but < identical)")
    run_one_test(ref, user_diff, "Test 3: Different pitch (expect clearly lower)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Quick scoring engine test harness. "
        "You can either run built‑in synthetic tests or provide your own files."
    )
    parser.add_argument(
        "--ref",
        type=str,
        help="Path to reference audio file (e.g. WAV/MP3). If omitted, synthetic tests are run.",
    )
    parser.add_argument(
        "--user",
        type=str,
        help="Path to user audio file. Required if --ref is provided.",
    )
    parser.add_argument(
        "--tmp-dir",
        type=str,
        default="backend/temp_audio/test_scoring",
        help="Directory for temporary synthetic WAVs.",
    )

    args = parser.parse_args()
    tmp_dir = Path(args.tmp_dir)

    if args.ref and args.user:
        # User-provided files
        ref_path = Path(args.ref)
        user_path = Path(args.user)
        if not ref_path.exists():
            raise FileNotFoundError(f"Reference file not found: {ref_path}")
        if not user_path.exists():
            raise FileNotFoundError(f"User file not found: {user_path}")

        run_one_test(ref_path, user_path, "Custom test")
    else:
        # No files provided -> run built-in synthetic tests
        run_synthetic_tests(tmp_dir)


if __name__ == "__main__":
    main()


