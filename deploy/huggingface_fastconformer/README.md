---
pipeline_tag: automatic-speech-recognition
language:
  - ar
license: cc-by-4.0
---

# Tarannum Kids Arabic FastConformer Shadow Endpoint

Private experimental endpoint for IQRA 6 comparison. Azure remains the
authoritative assessment engine; this endpoint only returns a second Arabic
transcription.

## Deployment

1. Create a private Hugging Face model repository owned by the Tarannum account.
2. Upload `handler.py`, `requirements.txt`, and this README to its repository root.
3. Deploy that repository as a custom Inference Endpoint.
4. Select AWS, one NVIDIA T4, private authentication, min replicas 0, max 1,
   and scale-to-zero after 15 minutes.
5. Do not deploy the NVIDIA source repository directly; it has no endpoint
   handler for the Tarannum request contract.

The handler downloads
`nvidia/stt_ar_fastconformer_hybrid_large_pcd_v1.0` during initialization.

## Request contract

```json
{
  "model": "nvidia/stt_ar_fastconformer_hybrid_large_pcd_v1.0",
  "language": "ar",
  "filename": "fastconformer-input.wav",
  "audio_base64": "<base64 16 kHz mono PCM WAV>"
}
```

Response:

```json
{
  "text": "الرَّحْمَنِ الرَّحِيمِ",
  "model": "nvidia/stt_ar_fastconformer_hybrid_large_pcd_v1.0",
  "language": "ar"
}
```

Never commit Hugging Face tokens or endpoint secrets to this repository.
