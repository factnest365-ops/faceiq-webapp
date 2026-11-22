# FaceIQ webapp (browser)

FaceIQ Labs-style browser app: measurement-based facial analysis and scoring.
On-device, evidence-sourced. v1: front Harmony + scoring (see [spec](../docs/faceiq/faceiq-webapp-spec.md)).

## Features

- **Accurate measurements**: MediaPipe Face Landmarker (478 3D landmarks, [A] 1.2) runs on-device.
- **Capture gates**: pose, expression, blur, exposure, repeatability, occlusion (spec R-09).
- **Landmark review**: drag/nudge 478 landmarks; user-placed trichion, ears.
- **Evidence-backed scoring**: spec 6.1 (12 scored + 7 descriptor measurements), 6.2-6.5.
- **Norm sets**: versioned, validated (spec 6.6), engine version pinned with every analysis (R-35).
- **History/export**: JSON export sufficient to recompute offline (R-46/R-48).

## Run locally

Requires Postgres 19 (Homebrew, no Docker) and optional Google OAuth credentials (no account needed):

```bash
brew install postgresql && brew services start postgresql
psql -U $(whoami) -d postgres -c "CREATE ROLE faceiq LOGIN PASSWORD 'faceiq' CREATEDB;"
psql -U $(whoami) -d postgres -c "CREATE DATABASE faceiq OWNER faceiq;"
cp .env.example .env.local   # set DATABASE_URL + GOOGLE_* values (optional)
npm install
npx prisma migrate deploy
npm run dev
```

Ops endpoints (all public):

- `GET /api/health` - liveness, always `200`.
- `GET /api/ready` - readiness; `503` until a Postgres `SELECT 1` succeeds.
- `GET /api/metrics` - Prometheus text format (`faceiq_up`, `faceiq_db_ready`, `faceiq_uptime_seconds`, `faceiq_http_requests_total`).

Request logs (method/path/status/duration) are JSON lines on stdout; set `LOG_LEVEL=debug|info|warn|error` to change the level.

## Run tests

```bash
npm test               # vitest: engine + scoring + norms (AC-01..17)
npm run smoke          # engine determinism (A-04, AC-01)
npm run norms-validate # spec 6.6 norm set validation (G2)
npx tsc --noEmit       # typecheck
npx playwright test    # e2e smoke (needs dev server, optional)
```

## Docs (research trail)

- [faceiqlabs-support-checks.md](../docs/faceiq/faceiqlabs-support-checks.md) - reference product
- [attractiveness-criteria.md](../docs/faceiq/attractiveness-criteria.md) - Seeker
- [webapp-implementation.md](../docs/faceiq/webapp-implementation.md) - Architect
- [faceiq-webapp-spec.md](../docs/faceiq/faceiq-webapp-spec.md) - Spec
- [g4/](../docs/faceiq/g4/) - accuracy validation (step 1 synthetic, step 2 synthetic test-retest)

## G4 ladder

- G4 step 1: `docs/faceiq/g4/synthetic_step1.py` - engine recovers design exactly at front_zero.
- G4 step 2: `docs/faceiq/g4/synthetic_step2.py` - preliminary sigmas.
- G4 steps 3-5 (inter-rater, fairness, outcome validation) need real subjects - blocked, deferred.
- Authoritative sigmas arrive via the human test-retest (D8).
