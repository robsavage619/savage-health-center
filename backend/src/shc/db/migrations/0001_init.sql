-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version   INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Health / fitness ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS measurements (
    source       VARCHAR NOT NULL,
    metric       VARCHAR NOT NULL,
    ts           TIMESTAMPTZ NOT NULL,
    value_num    DOUBLE,
    value_text   VARCHAR,
    unit         VARCHAR,
    external_id  VARCHAR NOT NULL,   -- synthetic fallback: {source}:{metric}:{epoch}
    content_hash VARCHAR NOT NULL,
    ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source, metric, ts, external_id)
);

CREATE TABLE IF NOT EXISTS workouts (
    id          VARCHAR PRIMARY KEY,
    source      VARCHAR NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL,
    ended_at    TIMESTAMPTZ,
    kind        VARCHAR,
    strain      DOUBLE,
    avg_hr      INTEGER,
    max_hr      INTEGER,
    kcal        DOUBLE,
    notes       VARCHAR,
    content_hash VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_sets (
    id          VARCHAR PRIMARY KEY,
    workout_id  VARCHAR NOT NULL REFERENCES workouts(id),
    exercise    VARCHAR NOT NULL,
    set_idx     INTEGER NOT NULL,
    reps        INTEGER,
    weight_kg   DOUBLE,
    rpe         DOUBLE,
    is_warmup   BOOLEAN DEFAULT FALSE,
    content_hash VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS sleep (
    id          VARCHAR PRIMARY KEY,
    source      VARCHAR NOT NULL,
    night_date  DATE NOT NULL,
    ts_in       TIMESTAMPTZ,
    ts_out      TIMESTAMPTZ,
    stages_json VARCHAR,  -- JSON blob: {deep_min, rem_min, light_min, awake_min}
    spo2_avg    DOUBLE,
    rhr         INTEGER,
    hrv         DOUBLE,
    content_hash VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery (
    id          VARCHAR PRIMARY KEY,
    source      VARCHAR NOT NULL,
    date        DATE NOT NULL,
    score       DOUBLE,
    hrv         DOUBLE,
    rhr         INTEGER,
    skin_temp   DOUBLE,
    content_hash VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS working_weights (
    exercise    VARCHAR PRIMARY KEY,
    weight_kg   DOUBLE NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    source      VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS cardio_sessions (
    id                   VARCHAR PRIMARY KEY,
    date                 DATE NOT NULL,
    modality             VARCHAR,
    duration_min         INTEGER,
    avg_hr               INTEGER,
    rpe                  DOUBLE,
    zone_distribution_json VARCHAR,
    content_hash         VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_checkin (
    date                     DATE PRIMARY KEY,
    soreness_by_region_json  VARCHAR,
    joint_pain_by_region_json VARCHAR,
    energy_1_10              INTEGER CHECK (energy_1_10 BETWEEN 1 AND 10),
    stress_1_10              INTEGER CHECK (stress_1_10 BETWEEN 1 AND 10),
    motivation_1_10          INTEGER CHECK (motivation_1_10 BETWEEN 1 AND 10),
    sleep_quality_1_10       INTEGER CHECK (sleep_quality_1_10 BETWEEN 1 AND 10),
    notes                    VARCHAR,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Clinical (bitemporal) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_docs (
    id            VARCHAR PRIMARY KEY,
    document_id   VARCHAR NOT NULL,   -- logical doc ID (e.g. ClinicalDocument.id)
    version       INTEGER NOT NULL DEFAULT 1,
    source        VARCHAR NOT NULL,
    path          VARCHAR NOT NULL,
    imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    sha256        VARCHAR NOT NULL,
    superseded_by VARCHAR REFERENCES source_docs(id)
);

CREATE TABLE IF NOT EXISTS medications (
    id            VARCHAR PRIMARY KEY,
    rxnorm        VARCHAR,
    name          VARCHAR NOT NULL,
    dose          VARCHAR,
    frequency     VARCHAR,
    started       DATE,
    stopped       DATE,
    source_doc_id VARCHAR REFERENCES source_docs(id),
    valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS conditions (
    id            VARCHAR PRIMARY KEY,
    icd10         VARCHAR,
    name          VARCHAR NOT NULL,
    onset         DATE,
    status        VARCHAR,
    source_doc_id VARCHAR REFERENCES source_docs(id),
    valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS labs (
    id            VARCHAR PRIMARY KEY,
    loinc         VARCHAR,
    name          VARCHAR NOT NULL,
    value         DOUBLE,
    unit          VARCHAR,
    ref_low       DOUBLE,
    ref_high      DOUBLE,
    collected_at  TIMESTAMPTZ,
    source_doc_id VARCHAR REFERENCES source_docs(id)
);

CREATE TABLE IF NOT EXISTS immunizations (
    id            VARCHAR PRIMARY KEY,
    cvx           VARCHAR,
    name          VARCHAR NOT NULL,
    given_at      DATE,
    source_doc_id VARCHAR REFERENCES source_docs(id)
);

-- ── Profile & coaching state ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS athlete_profile (
    key   VARCHAR PRIMARY KEY,
    value VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS exercise_preferences (
    exercise VARCHAR PRIMARY KEY,
    status   VARCHAR NOT NULL CHECK (status IN ('yes', 'sub', 'no')),
    notes    VARCHAR
);

CREATE TABLE IF NOT EXISTS programmes (
    id                  VARCHAR PRIMARY KEY,
    name                VARCHAR NOT NULL,
    started_at          DATE,
    ended_at            DATE,
    periodization_model VARCHAR NOT NULL CHECK (periodization_model IN ('dup', 'block', 'conjugate')),
    block_structure_json VARCHAR,
    status              VARCHAR NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived'))
);

CREATE TABLE IF NOT EXISTS oauth_state (
    source        VARCHAR PRIMARY KEY,
    last_sync_at  TIMESTAMPTZ,
    cursor        VARCHAR,
    needs_reauth  BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── Observability ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_calls (
    ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_id   VARCHAR NOT NULL,
    model        VARCHAR NOT NULL,
    route_reason VARCHAR,
    input_tok    INTEGER,
    output_tok   INTEGER,
    cached_tok   INTEGER DEFAULT 0,
    cost_usd     DOUBLE,
    cache_hit    BOOLEAN DEFAULT FALSE,
    latency_ms   INTEGER
);

-- ── Views ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_daily_metrics AS
SELECT
    ts::DATE AS date,
    source,
    metric,
    AVG(value_num) AS value_avg,
    MAX(value_num) AS value_max,
    MIN(value_num) AS value_min
FROM measurements
GROUP BY ts::DATE, source, metric;

CREATE OR REPLACE VIEW v_hrv_baseline_28d AS
SELECT
    date,
    hrv,
    AVG(hrv) OVER (ORDER BY date ROWS BETWEEN 27 PRECEDING AND CURRENT ROW) AS hrv_28d_avg,
    STDDEV(hrv) OVER (ORDER BY date ROWS BETWEEN 27 PRECEDING AND CURRENT ROW) AS hrv_28d_sd
FROM recovery
WHERE hrv IS NOT NULL
ORDER BY date;

CREATE OR REPLACE VIEW v_weekly_training_load AS
SELECT
    date_trunc('week', started_at)::DATE AS week_start,
    source,
    COUNT(*) AS sessions,
    SUM(strain) AS total_strain,
    SUM(kcal) AS total_kcal,
    AVG(avg_hr) AS avg_hr
FROM workouts
GROUP BY week_start, source;

CREATE OR REPLACE VIEW v_readiness AS
SELECT
    r.date,
    r.score AS recovery_score,
    r.hrv,
    r.rhr,
    s.stages_json,
    epoch(ts_out - ts_in) / 3600.0 AS sleep_hours,
    dc.energy_1_10,
    dc.stress_1_10,
    dc.joint_pain_by_region_json
FROM recovery r
LEFT JOIN sleep s ON s.night_date = r.date AND s.source = r.source
LEFT JOIN daily_checkin dc ON dc.date = r.date
ORDER BY r.date DESC;

INSERT INTO schema_version (version) VALUES (1) ON CONFLICT DO NOTHING;
