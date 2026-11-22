-- FaceIQ webapp: initial schema + row-level security (spec 7.3, spec 8).
-- Postgres RLS: every table carries app_user_id; lib/db.ts sets
-- current_setting('app.user_id') per request and policies filter rows.

CREATE TABLE IF NOT EXISTS app_users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  age_attested_at TIMESTAMPTZ,
  terms_accepted_at TIMESTAMPTZ,
  consent_record  JSONB,
  analytics_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  session_token   TEXT UNIQUE,
  session_expires TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id      TEXT PRIMARY KEY,
  sex_at_birth TEXT NOT NULL DEFAULT 'prefer_not_to_say',
  ancestry     TEXT NOT NULL DEFAULT 'pooled',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES app_users(id)
);
CREATE TABLE IF NOT EXISTS scans (
  id                      TEXT PRIMARY KEY,
  app_user_id             TEXT NOT NULL REFERENCES app_users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  capture_mode            TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'draft',
  engine_version          TEXT NOT NULL,
  norm_version            TEXT NOT NULL,
  norm_hash               TEXT NOT NULL,
  landmark_mapping_version TEXT NOT NULL,
  profile_snapshot        JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
  id          TEXT PRIMARY KEY,
  app_user_id TEXT NOT NULL REFERENCES app_users(id),
  scan_id     TEXT NOT NULL REFERENCES scans(id),
  storage_key TEXT,
  sha256      TEXT NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  retained    BOOLEAN NOT NULL
);
CREATE TABLE IF NOT EXISTS landmark_sets (
  id           TEXT PRIMARY KEY,
  app_user_id  TEXT NOT NULL REFERENCES app_users(id),
  scan_id      TEXT NOT NULL REFERENCES scans(id),
  version      INTEGER NOT NULL DEFAULT 1,
  source       TEXT NOT NULL,
  points       JSONB NOT NULL,
  frames_fused INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  image_width  INTEGER,
  image_height INTEGER
);
CREATE TABLE IF NOT EXISTS analyses (
  id              TEXT PRIMARY KEY,
  app_user_id     TEXT NOT NULL REFERENCES app_users(id),
  scan_id         TEXT NOT NULL REFERENCES scans(id),
  landmark_set_id TEXT NOT NULL REFERENCES landmark_sets(id),
  engine_version  TEXT NOT NULL,
  norm_version    TEXT NOT NULL,
  harmony         DOUBLE PRECISION NOT NULL,
  overall         DOUBLE PRECISION NOT NULL,
  band            TEXT NOT NULL,
  confidence      DOUBLE PRECISION NOT NULL,
  limitations     JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_hash TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS measurements (
  id               TEXT PRIMARY KEY,
  app_user_id      TEXT NOT NULL REFERENCES app_users(id),
  scan_id          TEXT NOT NULL REFERENCES scans(id),
  landmark_set_id  TEXT NOT NULL REFERENCES landmark_sets(id),
  analysis_id      TEXT REFERENCES analyses(id) ON DELETE SET NULL,
  key              TEXT NOT NULL,
  value            DOUBLE PRECISION,
  unit             TEXT NOT NULL,
  region           TEXT NOT NULL,
  tier             TEXT NOT NULL,
  status           TEXT NOT NULL,
  score            DOUBLE PRECISION,
  confidence       DOUBLE PRECISION NOT NULL,
  ideal_lo         DOUBLE PRECISION,
  ideal_hi         DOUBLE PRECISION,
  w_lo             DOUBLE PRECISION,
  w_hi             DOUBLE PRECISION,
  sigma_measurement DOUBLE PRECISION,
  weight           DOUBLE PRECISION NOT NULL,
  source           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT measurements_unique_scan_key UNIQUE (scan_id, key, landmark_set_id)
);

-- Postgres RLS (spec 8: row-level security per user).
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE landmark_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_users_own ON app_users
  USING (id = current_setting('app.user_id', true));
CREATE POLICY profiles_own ON profiles
  USING (user_id = current_setting('app.user_id', true));
CREATE POLICY scans_own ON scans
  USING (app_user_id = current_setting('app.user_id', true));
CREATE POLICY photos_own ON photos
  USING (app_user_id = current_setting('app.user_id', true));
CREATE POLICY landmark_sets_own ON landmark_sets
  USING (app_user_id = current_setting('app.user_id', true));
CREATE POLICY measurements_own ON measurements
  USING (app_user_id = current_setting('app.user_id', true));
CREATE POLICY analyses_own ON analyses
  USING (app_user_id = current_setting('app.user_id', true));

-- Application role (created manually or via psql; see README.md).
CREATE ROLE faceiq_app NOLOGIN;
GRANT CONNECT ON DATABASE faceiq TO faceiq_app;
GRANT USAGE ON SCHEMA public TO faceiq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO faceiq_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO faceiq_app;
