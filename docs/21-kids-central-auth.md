# Tarannum Kids: Central Account Authentication

Tarannum Kids uses the production Tarannum.ai account service as its single
source of truth for email, password, role and account status. A closed Kids
staging API still owns its own learning packages, attempts and agent decisions.

## Login flow

1. The iPad sends email and password directly to `KidsAuthBaseURL`.
2. Tarannum.ai returns a central access token after normal account checks.
3. The iPad sends that token to `POST /api/kids/auth/exchange` on the Kids API.
4. The Kids API verifies the token with `/api/auth/me`, creates or updates a
   passwordless local student shadow, and returns a Kids-scoped token.
5. All training requests use the Kids-scoped token and staging learning data.

The staging database never receives or stores the student's password.

## Required staging configuration

Set this variable on the closed Kids backend environment:

```text
KIDS_CENTRAL_AUTH_BASE_URL=https://tarannum-production.up.railway.app
```

The TestFlight workflow embeds the same production URL as `KidsAuthBaseURL`
while continuing to embed the supplied closed staging URL as `KidsAPIBaseURL`.

## Safety constraints

- Only active, approved `student` accounts can be exchanged.
- A central student can create only a passwordless local shadow account.
- An existing staging Admin or Qari account is never overwritten or demoted.
- Missing or unavailable central auth fails closed with HTTP 503.
