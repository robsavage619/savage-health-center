-- Deduplicated view over workout_sets.
--
-- Workouts can be logged to both Fitbod and Hevy on the same day; without
-- dedupe, set counts and volume aggregates double. This view keeps one
-- source per (day, canonical exercise): Hevy if present (live API), else
-- Fitbod (historical CSV), else whatever exists.
--
-- The "canonical exercise" strips trailing equipment suffixes like
-- " (Machine)" or " (Barbell)" so Hevy's "Leg Press (Machine)" and
-- Fitbod's "Leg Press" map to the same lift.
--
-- Schema mirrors workout_sets plus three derived columns:
--   source          — 'hevy' | 'fitbod' | seed | etc. (from workouts.source)
--   started_at      — workout start timestamp (joined from workouts)
--   day_d           — DATE form of started_at, used for daily aggregation
--   canon_exercise  — equipment-suffix stripped name

CREATE OR REPLACE VIEW workout_sets_dedup AS
WITH labeled AS (
    SELECT
        ws.id,
        ws.workout_id,
        ws.exercise,
        ws.set_idx,
        ws.reps,
        ws.weight_kg,
        ws.rpe,
        ws.is_warmup,
        ws.content_hash,
        w.source,
        w.started_at,
        w.started_at::DATE AS day_d,
        trim(regexp_replace(ws.exercise, '\s*\([^)]*\)\s*$', '')) AS canon_exercise
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
),
best_source AS (
    SELECT
        day_d,
        canon_exercise,
        CASE
            WHEN COUNT(*) FILTER (WHERE source = 'hevy') > 0 THEN 'hevy'
            WHEN COUNT(*) FILTER (WHERE source = 'fitbod') > 0 THEN 'fitbod'
            ELSE MIN(source)
        END AS chosen_source
    FROM labeled
    GROUP BY day_d, canon_exercise
)
SELECT l.*
FROM labeled l
JOIN best_source b
  ON b.day_d = l.day_d
 AND b.canon_exercise = l.canon_exercise
 AND b.chosen_source = l.source;
