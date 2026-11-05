# Tarannum Kids API contract

## Daily access decision

`GET /api/platform/kids/daily-access`

Authenticated response:

```json
{
  "localDate": "2026-09-24",
  "creditedSeconds": 2140,
  "requiredSeconds": 3600,
  "unlockGranted": false,
  "unlockExpiresAt": null
}
```

At 3,600 credited seconds before 23:30 Asia/Kuala_Lumpur, `unlockGranted` becomes true and `unlockExpiresAt` is the current local date at 23:30 with `+08:00` offset.

## Server rules

1. Calculate the current date and 06:00–23:30 access window in `Asia/Kuala_Lumpur`.
2. Count only verified `practice_stopped` events belonging to the authenticated student and current local day.
3. Reuse duration caps in `student_activity_analytics_service.sum_practice_seconds`.
4. Never accept credited seconds or an unlock flag from the iPad.
5. Deny by default outside the access window, on authentication failure, or when data cannot be verified.
6. Return `Cache-Control: no-store` and audit every locked-to-unlocked decision.

## Follow-up endpoints

- `POST /api/platform/kids/devices/register` binds an installation key to the child profile.
- `GET /api/platform/kids/assignments/today` returns parent-assigned practice items.
- `POST /api/platform/kids/device-heartbeat` reports app health without transmitting Screen Time usage data.

Family Controls usage data must remain on the device and may only support the parental-control feature.
