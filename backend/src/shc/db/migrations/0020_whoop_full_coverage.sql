-- Full WHOOP v2 API coverage.
--
-- Closes the gap between what WHOOP exposes and what we store. Every field
-- in the v2 schema for Recovery, Sleep, Workout, Cycle, Body Measurement,
-- and User Profile now has a destination column.
--
-- Renames sleep.rhr (which actually held respiratory_rate) to respiratory_rate
-- to fix the misnamed column flagged in the audit.

-- ── recovery ────────────────────────────────────────────────────────────────
ALTER TABLE recovery ADD COLUMN IF NOT EXISTS user_calibrating BOOLEAN;
ALTER TABLE recovery ADD COLUMN IF NOT EXISTS sleep_id         VARCHAR;

-- ── sleep ───────────────────────────────────────────────────────────────────
-- Add the correctly named column first, then backfill, then drop the misnamed one.
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS respiratory_rate DOUBLE;
UPDATE sleep SET respiratory_rate = rhr
WHERE respiratory_rate IS NULL AND rhr IS NOT NULL;
ALTER TABLE sleep    DROP COLUMN IF EXISTS rhr;

-- New stage / cycle architecture columns.
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS in_bed_min       DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS no_data_min      DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS sleep_cycle_count INTEGER;

-- Split the lumped sleep_needed_min into its components for granular
-- attribution. The old column stays for backwards compat (sum of components).
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS sleep_need_baseline_min DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS sleep_need_debt_min     DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS sleep_need_strain_min   DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS sleep_need_nap_min      DOUBLE;

-- ── workouts ────────────────────────────────────────────────────────────────
-- Sport identity (WHOOP returns numeric id; capture the friendly name once
-- so cardio reports don't need to re-resolve it).
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS sport_id            INTEGER;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS sport_name          VARCHAR;

-- Coverage / movement.
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS percent_recorded    DOUBLE;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS distance_meter      DOUBLE;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS altitude_gain_meter DOUBLE;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS altitude_change_meter DOUBLE;

-- HR zone durations (minutes spent in each zone).
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS zone_zero_min  DOUBLE;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS zone_one_min   DOUBLE;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS zone_two_min   DOUBLE;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS zone_three_min DOUBLE;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS zone_four_min  DOUBLE;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS zone_five_min  DOUBLE;

-- ── daily_cycle ─────────────────────────────────────────────────────────────
ALTER TABLE daily_cycle ADD COLUMN IF NOT EXISTS score_state      VARCHAR;
ALTER TABLE daily_cycle ADD COLUMN IF NOT EXISTS percent_recorded DOUBLE;
ALTER TABLE daily_cycle ADD COLUMN IF NOT EXISTS start_ts         TIMESTAMPTZ;
ALTER TABLE daily_cycle ADD COLUMN IF NOT EXISTS end_ts           TIMESTAMPTZ;

-- ── body_measurement (NEW) ──────────────────────────────────────────────────
-- One snapshot per sync; max HR drives auto-calibrated training zones.
CREATE TABLE IF NOT EXISTS body_measurement (
    source         VARCHAR NOT NULL,
    measured_at    TIMESTAMPTZ NOT NULL,
    height_meter   DOUBLE,
    weight_kg      DOUBLE,
    max_heart_rate INTEGER,
    content_hash   VARCHAR NOT NULL,
    PRIMARY KEY (source, measured_at)
);

-- ── whoop_user_profile (NEW) ────────────────────────────────────────────────
-- Audit trail for WHOOP identity. Single row keyed by user_id.
CREATE TABLE IF NOT EXISTS whoop_user_profile (
    user_id        BIGINT PRIMARY KEY,
    email          VARCHAR,
    first_name     VARCHAR,
    last_name      VARCHAR,
    last_synced_at TIMESTAMPTZ NOT NULL
);

INSERT INTO schema_version (version) VALUES (20) ON CONFLICT DO NOTHING;
