CREATE TABLE IF NOT EXISTS whoop_journal (
    id           VARCHAR PRIMARY KEY,
    cycle_start  TIMESTAMPTZ NOT NULL,
    cycle_end    TIMESTAMPTZ,
    date         DATE NOT NULL,
    question     VARCHAR NOT NULL,
    answered_yes BOOLEAN NOT NULL,
    notes        VARCHAR,
    content_hash VARCHAR NOT NULL
);

INSERT INTO schema_version (version) VALUES (3) ON CONFLICT DO NOTHING;
