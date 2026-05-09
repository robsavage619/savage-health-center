-- Mesocycle tracking + per-exercise progression
--
-- mesocycles:           one row per training block (5-week accumulation + deload)
-- muscle_volume_targets: MEV/MAV/MRV landmarks per muscle group, optionally scoped to a mesocycle
-- exercise_weekly_e1rm: rolling e1RM + performance score per exercise per week

CREATE TABLE IF NOT EXISTS mesocycles (
    id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    programme_id    VARCHAR,                            -- optional link to programmes table
    started_on      DATE NOT NULL,
    ended_on        DATE,
    planned_weeks   INTEGER NOT NULL DEFAULT 5,
    deload_week     INTEGER,                            -- which calendar week the deload falls on
    status          VARCHAR NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'deloading', 'completed')),
    deload_trigger  VARCHAR,                            -- 'scheduled' | 'hrv_drop' | 'volume_cap' | 'manual'
    notes           VARCHAR,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS muscle_volume_targets (
    muscle_group    VARCHAR NOT NULL,
    mev_sets        INTEGER NOT NULL,
    mav_sets        INTEGER NOT NULL,
    mrv_sets        INTEGER NOT NULL,
    mesocycle_id    VARCHAR NOT NULL DEFAULT '',        -- '' = global defaults, UUID = scoped
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (muscle_group, mesocycle_id)
);

CREATE TABLE IF NOT EXISTS exercise_weekly_e1rm (
    exercise        VARCHAR NOT NULL,
    week_start      DATE NOT NULL,                      -- Monday of ISO week
    e1rm_kg         DOUBLE NOT NULL,
    work_sets       INTEGER,                            -- total working sets that week
    perf_score      INTEGER                             -- Israetel 1–5 (1=regression, 5=PR)
                    CHECK (perf_score BETWEEN 1 AND 5),
    trend           VARCHAR                             -- 'progressing' | 'stalled' | 'regressing'
                    CHECK (trend IN ('progressing', 'stalled', 'regressing')),
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (exercise, week_start)
);

INSERT INTO schema_version (version) VALUES (15) ON CONFLICT DO NOTHING;
