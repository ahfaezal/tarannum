import gc
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from pydub import AudioSegment

from iqra.config import is_azure_speech_configured


class AzureSpeechAssessmentError(RuntimeError):
    pass


def _speech_sdk():
    try:
        import azure.cognitiveservices.speech as speechsdk
    except ImportError as exc:
        raise AzureSpeechAssessmentError(
            "Azure Speech SDK is not installed on the backend."
        ) from exc
    return speechsdk


def _score(value: Any) -> float | None:
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def parse_detailed_result(payload: dict[str, Any]) -> list[dict[str, Any]]:
    nbest = payload.get("NBest") or []
    if not nbest:
        return []

    words = []
    for item in nbest[0].get("Words") or []:
        assessment = item.get("PronunciationAssessment") or {}
        phonemes = []
        for phoneme in item.get("Phonemes") or []:
            phoneme_assessment = phoneme.get("PronunciationAssessment") or {}
            phonemes.append(
                {
                    "phoneme": phoneme.get("Phoneme"),
                    "accuracy_score": _score(phoneme_assessment.get("AccuracyScore")),
                }
            )

        words.append(
            {
                "word": item.get("Word"),
                "accuracy_score": _score(assessment.get("AccuracyScore")),
                "error_type": assessment.get("ErrorType") or "None",
                "phonemes": phonemes,
            }
        )
    return words


def _wav_copy(source: Path, destination: Path) -> None:
    audio = AudioSegment.from_file(source)
    audio = audio.set_channels(1).set_frame_rate(16_000).set_sample_width(2)
    audio.export(destination, format="wav")


def assess_pronunciation(
    audio_path: Path,
    reference_text: str,
    locale: str = "ar-SA",
) -> dict[str, Any]:
    if not is_azure_speech_configured():
        raise AzureSpeechAssessmentError("Azure Speech is not configured.")
    if not reference_text.strip():
        raise AzureSpeechAssessmentError("Reference text is required.")

    speechsdk = _speech_sdk()
    with tempfile.TemporaryDirectory(prefix="tarannum-iqra-") as directory:
        wav_path = Path(directory) / "assessment.wav"
        _wav_copy(audio_path, wav_path)

        speech_config = speechsdk.SpeechConfig(
            subscription=os.environ["AZURE_SPEECH_KEY"],
            region=os.environ["AZURE_SPEECH_REGION"],
        )
        speech_config.speech_recognition_language = locale
        audio_config = speechsdk.audio.AudioConfig(filename=str(wav_path))
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config,
        )
        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True,
        )
        pronunciation_config.apply_to(recognizer)

        result = None
        assessment = None
        try:
            result = recognizer.recognize_once_async().get()
            if result.reason == speechsdk.ResultReason.Canceled:
                cancellation = speechsdk.CancellationDetails(result)
                raise AzureSpeechAssessmentError(
                    "Azure Speech canceled the assessment: "
                    f"{cancellation.reason} ({cancellation.error_code})."
                )
            if result.reason != speechsdk.ResultReason.RecognizedSpeech:
                raise AzureSpeechAssessmentError(
                    "Azure Speech could not recognize a valid spoken response."
                )

            assessment = speechsdk.PronunciationAssessmentResult(result)
            detailed_json = result.properties.get(
                speechsdk.PropertyId.SpeechServiceResponse_JsonResult
            )
            detailed = json.loads(detailed_json) if detailed_json else {}
            response = {
                "recognized_text": result.text,
                "accuracy_score": _score(assessment.accuracy_score),
                "fluency_score": _score(assessment.fluency_score),
                "completeness_score": _score(assessment.completeness_score),
                "pronunciation_score": _score(assessment.pronunciation_score),
                "words": parse_detailed_result(detailed),
                "provider": "azure-speech",
                "locale": locale,
            }
        finally:
            assessment = None
            result = None
            pronunciation_config = None
            recognizer = None
            audio_config = None
            speech_config = None
            gc.collect()
            time.sleep(0.05)

        return response
