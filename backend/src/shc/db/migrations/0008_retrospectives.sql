CREATE TABLE IF NOT EXISTS workout_retrospectives (
    workout_id  VARCHAR PRIMARY KEY REFERENCES workouts(id),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    summary      VARCHAR NOT NULL,
    progressive_overload_achieved BOOLEAN,
    rpe_vs_target VARCHAR,
    flags        VARCHAR,          -- JSON array of flag strings
    vault_insights VARCHAR         -- JSON array of research citations
);

INSERT INTO schema_version (version) VALUES (8) ON CONFLICT DO NOTHING;
