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


@router.get("/training/load-curve")
async def get_load_curve(days: int = 90) -> dict[str, Any]:
    """Banister fitness-fatigue model over the last N days.

    Returns per-day composite_load + CTL (42d EWMA, fitness), ATL (7d EWMA,
    fatigue), and TSB = CTL - ATL (form). Positive TSB = fresh, negative TSB
    = fatigued. Window of -10 to +5 is typical race-ready zone.
    """
    import math

    days = max(28, min(days, 365))
    conn = get_read_conn()
    try:
        # Pull a 60d warm-up so EWMAs at the start of the visible window are
        # initialised against real history, not zero.
        start = date.today() - timedelta(days=days + 60)
        rows = conn.execute(
            "SELECT date, COALESCE(composite_load, 0) "
            "FROM v_daily_load WHERE date >= ? ORDER BY date",
            [start.isoformat()],
        ).fetchall()
        if not rows:
            return {"as_of": date.today().isoformat(), "points": []}

        # Fill missing dates with 0 load so EWMAs decay correctly on rest days.
        by_date = {str(r[0]): float(r[1] or 0) for r in rows}
        first_date = date.fromisoformat(min(by_date.keys()))
        last_date = date.today()
        full: list[tuple[date, float]] = []
        d = first_date
        while d <= last_date:
            full.append((d, by_date.get(d.isoformat(), 0.0)))
            d = d + timedelta(days=1)

        # Banister EWMA: x_t = x_{t-1} * exp(-1/tau) + load_t * (1 - exp(-1/tau))
        ctl_tau, atl_tau = 42.0, 7.0
        ctl_decay = math.exp(-1.0 / ctl_tau)
        atl_decay = math.exp(-1.0 / atl_tau)
        ctl, atl = 0.0, 0.0
        points: list[dict[str, Any]] = []
        cutoff = last_date - timedelta(days=days)
        for d, load in full:
            ctl = ctl * ctl_decay + load * (1 - ctl_decay)
            atl = atl * atl_decay + load * (1 - atl_decay)
            if d >= cutoff:
                points.append({
                    "date": d.isoformat(),
                    "load": round(load, 2),
                    "ctl": round(ctl, 2),
                    "atl": round(atl, 2),
                    "tsb": round(ctl - atl, 2),
                })

        latest = points[-1] if points else None
        return {
            "as_of": last_date.isoformat(),
            "points": points,
            "today": latest,
            "tau": {"ctl_days": int(ctl_tau), "atl_days": int(atl_tau)},
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
