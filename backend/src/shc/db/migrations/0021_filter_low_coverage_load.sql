-- Filter low-coverage WHOOP sessions out of the load calculation.
--
-- A session with `percent_recorded < 50` represents a workout where the
-- strap was off for more than half the time. Counting its strain as if it
-- were fully measured biases ACWR upward on accidental autodetect events
-- and downward on real sessions where the strap died mid-workout.
--
-- NULL is treated as fully recorded so older rows (pre-migration 0020)
-- aren't silently excluded.

CREATE OR REPLACE VIEW v_session_load AS
SELECT
    started_at::DATE AS date,
    COALESCE(SUM(w.strain), 0) AS whoop_strain,
    COUNT(DISTINCT w.id) AS sessions
FROM workouts w
WHERE COALESCE(w.percent_recorded, 100) >= 50
GROUP BY started_at::DATE;

INSERT INTO schema_version (version) VALUES (21) ON CONFLICT DO NOTHING;
