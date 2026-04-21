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

INSERT INTO schema_version (version) VALUES (2) ON CONFLICT DO NOTHING;
