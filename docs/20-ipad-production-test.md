# Tarannum.ai — 20 iPad Production Test

## Objective

Validate that 20 participants sharing one public Wi-Fi IP can access Tarannum.ai, register, train, record, submit and receive a score without HTTP 429, server errors or indefinite loading.

## Test topology

- Devices: 20 × iPad 9th generation with Jabra Evolve 30.
- Primary network: all iPads on the same home Wi-Fi.
- Control device: instructor PC on a mobile hotspot.
- Content: Al-Fatihah, approximately 60 seconds.
- Production URLs:
  - Frontend: `https://tarannum.ai`
  - Backend health: `https://tarannum-production.up.railway.app/health`
- Label devices `D01` through `D20` before testing.

## Evidence to retain

Record the exact start and end time of every phase in Malaysia time. Keep:

- Railway application logs and metrics for the test window.
- Vercel runtime/browser errors, if any.
- Device result sheet with status and elapsed time.
- Recording ID and displayed score for every successful submission.
- S3 `audio.wav` and `score.json` pair for every recording.
- Database integrity status for every new recording.

## Pass criteria

| Area | Required result |
| --- | --- |
| Home | 20/20 show useful content; no blank or indefinite loading page |
| Register | 20/20 requests complete; no HTTP 429 or 5xx |
| OTP | 20/20 verification attempts receive a definite success/error response |
| Training setup | 20/20 load Al-Fatihah and the reference graph |
| Training workspace | Fullscreen graph opens and remains responsive |
| Recording | Countdown, beep, ayah markers and auto-stop work on every device |
| Upload | Every accepted recording obtains a Recording ID |
| Scoring | Every accepted submission returns a result or a clear retryable error |
| Integrity | Database, S3 audio and S3 score are complete for every successful submission |
| Backend | No pool timeout, unhandled exception or sustained 5xx during the test |

Target frontend/API setup time is under 5 seconds per device on the test network. Scoring is measured separately because CPU work is intentionally concurrency-limited.

## Phase 0 — Preparation

1. Confirm Railway deployment is `Active` and `/health` returns HTTP 200.
2. Confirm `tarannum.ai` loads on the instructor control network.
3. Prepare 20 unique test email addresses that can receive OTP.
4. Confirm every Jabra microphone is selected and permitted in Safari.
5. Close unrelated applications and browser tabs on every iPad.
6. Start Railway log capture and note the test start time.

Do not clear or restart production services during the test unless the rollback condition is reached.

## Phase 1 — Public Home burst

1. Place all devices on the home Wi-Fi.
2. At one agreed countdown, open `https://tarannum.ai` on all 20 iPads.
3. Record time until the Home heading and navigation are usable.
4. Open the same page on the instructor PC using the mobile hotspot.

Stop and investigate if more than two devices fail, receive 429/5xx, or remain unusable after 15 seconds.

## Phase 2 — Register and OTP

1. Open Register on all devices.
2. Submit 20 unique registrations within the same 10-second window.
3. Record the response time and any displayed error for each device.
4. Enter each OTP when available and record verification time.
5. Confirm successful users can log in.

Record email delivery delay separately from API response time. A delayed email is not the same failure as a loading API request.

## Phase 3 — Training setup

1. Have all 20 users open Training together.
2. Select Al-Fatihah and the same Qari/reference.
3. Record when the reference list, graph and controls become usable.
4. Enter the lazy-loaded Training Workspace.
5. Run a short listen/practise interaction and refresh Training once.

The page must remain informative while workspace assets load.

## Phase 4 — Recording

1. Complete R1 on every device.
2. Confirm countdown and beep.
3. Confirm reference graph is visible but Qari audio is muted.
4. Confirm student pitch is stable, ayah markers change and the recording auto-stops at the reference end.
5. Confirm R1 auto-submits without playback or Retake.
6. Complete R2 and confirm Review and Retake are available.
7. Complete R3 and confirm attempt metadata is retained.

## Phase 5 — Scoring load

Run this in two controlled rounds:

1. Submit five R2/R3 recordings together and measure completion time.
2. If all five complete cleanly, submit the remaining 15 together.

This preserves diagnostic value while still producing a 20-participant session. Record `Processing`, success, retryable error and permanent error separately.

## Phase 6 — Data reconciliation

For every successful Recording ID, verify:

1. A database session and analysis result exist.
2. `audio.wav` exists in S3.
3. `score.json` exists in S3.
4. Stored size/checksum values match where available.
5. `integrity_status` is `complete`.
6. R1, R2 and R3 metadata and attempt number are correct.

## Result sheet columns

Use one row per device:

`Device | Network | Home seconds | Register status | OTP status | Login status | Training seconds | R1 ID | R1 score | R2 ID | R2 score | R3 ID | R3 score | Error time | Error message`

## Rollback condition

Stop the test if the backend becomes unhealthy, sustained 5xx exceeds one minute, or existing production data appears at risk. Do not roll back only because scoring is queued; first check whether requests are still progressing.

## Final decision

- **Pass:** all core phases meet the criteria and every successful recording reconciles.
- **Conditional pass:** no systemic failure, but isolated device/network issues are documented and repeatable.
- **Fail:** shared-IP access produces 429/5xx, widespread indefinite loading returns, or recording integrity cannot be established.
