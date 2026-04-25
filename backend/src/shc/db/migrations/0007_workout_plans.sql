CREATE TABLE IF NOT EXISTS workout_plans (
    date DATE PRIMARY KEY,
    plan_json VARCHAR NOT NULL,
    source VARCHAR NOT NULL DEFAULT 'claude',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_version (version) VALUES (7) ON CONFLICT DO NOTHING;
