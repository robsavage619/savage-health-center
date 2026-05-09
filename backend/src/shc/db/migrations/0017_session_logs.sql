-- Live session logging — captures per-set actuals during a workout, before
-- (or instead of) the canonical Hevy sync. Powers VBT and autoregulation UI.
-- Distinct from workout_sets (which is Hevy-sourced).

CREATE TABLE IF NOT EXISTS session_set_logs (
    id           VARCHAR PRIMARY KEY,            -- uuid
    session_date DATE    NOT NULL,
    block        VARCHAR,                        -- "primary", "accessory_a", etc. from plan
    exercise     VARCHAR NOT NULL,
    set_idx      INTEGER NOT NULL,               -- 1-based ordinal within exercise
    target_reps  INTEGER,
    target_weight_kg DOUBLE,
    target_rpe   DOUBLE,
    target_rir   INTEGER,
    actual_reps  INTEGER,
    actual_weight_kg DOUBLE,
    actual_rpe   DOUBLE,
    actual_rir   INTEGER,
    mcv_m_s      DOUBLE,                          -- mean concentric velocity m/s
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes        VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_session_set_logs_date
    ON session_set_logs (session_date);

CREATE INDEX IF NOT EXISTS idx_session_set_logs_exercise
    ON session_set_logs (exercise, session_date);

INSERT INTO schema_version (version) VALUES (17) ON CONFLICT DO NOTHING;
