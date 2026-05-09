from __future__ import annotations

"""Training / mesocycle API endpoints.

GET  /api/training/mesocycle          → current mesocycle state + volume summary
GET  /api/training/progression        → per-exercise scores for recent exercises
POST /api/training/mesocycle/advance  → transition active → deloading → completed + new
POST /api/training/scores/recompute   → recompute all exercise scores for this week
"""

import logging
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from shc.db.schema import get_read_conn, get_write_conn, write_ctx
from shc.training.mesocycle import (
    advance_mesocycle,
    compute_all_scores,
    ensure_active_mesocycle,
    mesocycle_context_block,
    score_exercise,
    volume_targets,
    weekly_e1rm,
)

router = APIRouter(tags=["training"])
log = logging.getLogger(__name__)


class AdvanceRequest(BaseModel):
    trigger: str = "manual"  # 'scheduled' | 'hrv_drop' | 'volume_cap' | 'manual'


@router.get("/training/mesocycle")
async def get_mesocycle() -> dict[str, Any]:
    conn = get_read_conn()
    try:
        state = ensure_active_mesocycle(conn)
        targets = volume_targets(conn, state.id)
        return {
            "id": state.id,
            "started_on": state.started_on.isoformat(),
            "planned_weeks": state.planned_weeks,
            "status": state.status,
            "week_number": state.week_number,
            "weeks_remaining": state.weeks_remaining,
            "is_deload_week": state.is_deload_week,
            "deload_trigger": state.deload_trigger,
            "notes": state.notes,
            "volume_targets": {
                mg: {"mev": t.mev, "mav": t.mav, "mrv": t.mrv}
                for mg, t in targets.items()
            },
        }
    finally:
        conn.close()


@router.get("/training/progression")
async def get_progression(weeks: int = 4) -> dict[str, Any]:
    conn = get_read_conn()
    try:
        cutoff = date.today() - timedelta(weeks=weeks)
        exercises = [
            r[0]
            for r in conn.execute(
                """
                SELECT DISTINCT exercise_name
                FROM workout_sets_dedup
                WHERE started_at::DATE >= ?
                  AND weight_kg > 0 AND reps > 0
                ORDER BY exercise_name
                """,
                [cutoff],
            ).fetchall()
        ]

        results: list[dict[str, Any]] = []
        for ex in exercises:
            ps = score_exercise(conn, ex)
            if ps is None:
                history = weekly_e1rm(conn, ex, n_weeks=weeks)
                if history:
                    latest = history[-1]
                    results.append({
                        "exercise": ex,
                        "e1rm_lbs": round(latest.e1rm_kg * 2.20462),
                        "work_sets": latest.work_sets,
                        "perf_score": None,
                        "trend": None,
                        "recommendation": "insufficient history",
                    })
            else:
                results.append({
                    "exercise": ps.exercise,
                    "e1rm_lbs": round(ps.e1rm_lbs),
                    "work_sets": ps.work_sets,
                    "perf_score": ps.perf_score,
                    "trend": ps.trend,
                    "recommendation": ps.recommendation,
                })

        return {"exercises": results, "as_of": date.today().isoformat()}
    finally:
        conn.close()


@router.post("/training/mesocycle/advance")
async def post_advance(req: AdvanceRequest) -> dict[str, Any]:
    async with write_ctx() as conn:
        new_state = advance_mesocycle(conn, trigger=req.trigger)
    return {
        "status": new_state.status,
        "id": new_state.id,
        "started_on": new_state.started_on.isoformat(),
        "week_number": new_state.week_number,
    }


@router.post("/training/scores/recompute")
async def post_recompute() -> dict[str, Any]:
    async with write_ctx() as conn:
        compute_all_scores(conn)
    return {"ok": True, "message": "Scores recomputed for current week"}


@router.get("/training/context")
async def get_training_context() -> dict[str, str]:
    """Return the mesocycle context block that gets injected into workout planner prompts."""
    conn = get_read_conn()
    try:
        block = mesocycle_context_block(conn)
        return {"context": block}
    finally:
        conn.close()
