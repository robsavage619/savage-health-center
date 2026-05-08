-- Expand WHOOP data coverage:
--   1. SpO2 on recovery (was available in API, never stored)
--   2. Full sleep quality columns (performance, efficiency, consistency, stages, nap flag)
--   3. Daily cycle table (strain, kcal, avg/max HR)

ALTER TABLE recovery ADD COLUMN IF NOT EXISTS spo2            DOUBLE;

ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS is_nap               BOOLEAN DEFAULT FALSE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS sleep_performance_pct DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS sleep_efficiency_pct  DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS sleep_consistency_pct DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS disturbance_count     INTEGER;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS sleep_needed_min      INTEGER;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS sws_min               DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS rem_min               DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS light_min             DOUBLE;
ALTER TABLE sleep    ADD COLUMN IF NOT EXISTS awake_min             DOUBLE;

CREATE TABLE IF NOT EXISTS daily_cycle (
    id           VARCHAR PRIMARY KEY,
    date         DATE NOT NULL,
    strain       DOUBLE,
    kilojoule    DOUBLE,
    avg_hr       INTEGER,
    max_hr       INTEGER,
    content_hash VARCHAR NOT NULL
);

INSERT INTO schema_version (version) VALUES (14) ON CONFLICT DO NOTHING;
