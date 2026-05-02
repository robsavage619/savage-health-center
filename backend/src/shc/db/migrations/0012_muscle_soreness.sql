-- Per-muscle soreness from the body-diagram check-in.
-- Stored as JSON: {muscle_key: severity_int} where severity ∈ {1,2,3}
-- (1 mild, 2 moderate, 3 acute). Absent keys = no soreness reported.
ALTER TABLE daily_checkin ADD COLUMN IF NOT EXISTS muscle_soreness JSON;
