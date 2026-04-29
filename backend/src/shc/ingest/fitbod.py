from __future__ import annotations

import csv
import hashlib
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)


def _content_hash(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def ingest_fitbod(csv_path: Path | None = None) -> dict[str, int]:
    """Parse WorkoutExport.csv and upsert into workouts + workout_sets + working_weights."""
    from shc.config import settings
    from shc.db.schema import get_read_conn

    if csv_path is None:
        csv_path = settings.fitbod_csv_path

    if not csv_path.exists():
        raise FileNotFoundError(f"Fitbod CSV not found at {csv_path}")

    log.info("Parsing Fitbod CSV: %s", csv_path)

    # Group rows by session (same Date = same workout)
    sessions: dict[str, list[dict]] = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = row["Date"].strip()
            sessions.setdefault(key, []).append(row)

    log.info("Found %d sessions, %d total sets", len(sessions), sum(len(v) for v in sessions.values()))

    conn = get_read_conn()
    workouts_inserted = 0
    sets_inserted = 0
    skipped = 0

    for date_str, rows in sessions.items():
        try:
            started_at = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S %z")
        except ValueError:
            try:
                started_at = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
                started_at = started_at.replace(tzinfo=timezone.utc)
            except ValueError:
                log.warning("Unparseable date: %s — skipping session", date_str)
                skipped += 1
                continue

        workout_hash = _content_hash("fitbod", date_str)
        workout_id = f"fitbod_{workout_hash}"

        existing = conn.execute(
            "SELECT id FROM workouts WHERE id = ?", [workout_id]
        ).fetchone()

        if not existing:
            conn.execute(
                """
                INSERT INTO workouts (id, source, started_at, kind, content_hash)
                VALUES (?, 'fitbod', ?, 'strength', ?)
                """,
                [workout_id, started_at, workout_hash],
            )
            workouts_inserted += 1

        for idx, row in enumerate(rows):
            try:
                weight_kg = float(row.get("Weight(kg)", 0) or 0)
                # Fitbod's `multiplier` is 2.0 for bilateral dumbbell exercises
                # (Weight(kg) is stored per-hand). Multiply to get total bilateral
                # weight, matching the Hevy storage convention.
                multiplier = float(row.get("multiplier", 1) or 1)
                if multiplier and multiplier != 1.0:
                    weight_kg = weight_kg * multiplier
                reps = int(float(row.get("Reps", 0) or 0))
                is_warmup = row.get("isWarmup", "false").strip().lower() == "true"
                exercise = row.get("Exercise", "").strip()
                if not exercise:
                    continue

                set_hash = _content_hash("fitbod", date_str, exercise, str(idx))
                set_id = f"fitbod_set_{set_hash}"

                conn.execute(
                    """
                    INSERT INTO workout_sets
                        (id, workout_id, exercise, set_idx, reps, weight_kg, is_warmup, content_hash)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET
                        weight_kg = EXCLUDED.weight_kg,
                        reps = EXCLUDED.reps,
                        is_warmup = EXCLUDED.is_warmup,
                        content_hash = EXCLUDED.content_hash
                    """,
                    [set_id, workout_id, exercise, idx, reps,
                     weight_kg if weight_kg > 0 else None,
                     is_warmup, set_hash],
                )
                sets_inserted += 1
            except Exception as e:
                log.debug("Skipping row in %s: %s", date_str, e)

    # Rebuild working_weights using P80 of working sets at RPE 6–9 over the
    # last 90d, ≥3 sets across ≥2 sessions — same logic as the Hevy path so
    # both sources produce consistent prescriptions.
    log.info("Rebuilding working_weights...")
    conn.execute("""
        WITH ex_stats AS (
            SELECT ws.exercise,
                   quantile_cont(ws.weight_kg, 0.8) FILTER (
                       WHERE ws.rpe IS NULL OR ws.rpe BETWEEN 6 AND 9
                   ) AS p80_kg,
                   MAX(w.started_at) AS last_at,
                   COUNT(*) AS n_sets,
                   COUNT(DISTINCT w.started_at::DATE) AS n_sessions
            FROM workout_sets ws
            JOIN workouts w ON w.id = ws.workout_id
            WHERE ws.is_warmup = FALSE
              AND ws.weight_kg IS NOT NULL
              AND ws.weight_kg > 0
              AND w.source = 'fitbod'
              AND w.started_at::DATE >= (current_date - INTERVAL 90 DAY)
            GROUP BY ws.exercise
        )
        INSERT INTO working_weights (exercise, weight_kg, updated_at, source)
        SELECT exercise, p80_kg, last_at, 'fitbod'
        FROM ex_stats
        WHERE n_sets >= 3 AND n_sessions >= 2 AND p80_kg IS NOT NULL
        ON CONFLICT (exercise) DO UPDATE SET
            weight_kg = EXCLUDED.weight_kg,
            updated_at = EXCLUDED.updated_at,
            source = EXCLUDED.source
    """)

    conn.close()

    result = {
        "sessions": len(sessions),
        "workouts_inserted": workouts_inserted,
        "sets_inserted": sets_inserted,
        "skipped": skipped,
    }
    log.info("Fitbod ingest complete: %s", result)
    return result
