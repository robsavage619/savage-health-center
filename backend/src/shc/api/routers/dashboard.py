from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter

from shc.db.schema import get_read_conn

router = APIRouter(tags=["dashboard"])
log = logging.getLogger(__name__)


@router.get("/recovery/today")
async def recovery_today() -> dict:
    conn = get_read_conn()
    try:
        row = conn.execute(
            "SELECT date, score, hrv, rhr, skin_temp FROM recovery ORDER BY date DESC LIMIT 1"
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return {}
    return {"date": str(row[0]), "score": row[1], "hrv": row[2], "rhr": row[3], "skin_temp": row[4]}


@router.get("/recovery/trend")
async def recovery_trend(days: int = 14) -> list[dict]:
    since = (date.today() - timedelta(days=days)).isoformat()
    conn = get_read_conn()
    try:
        rows = conn.execute(
            "SELECT date, score, hrv, rhr FROM recovery WHERE date >= $since ORDER BY date",
            {"since": since},
        ).fetchall()
    finally:
        conn.close()
    return [{"date": str(r[0]), "score": r[1], "hrv": r[2], "rhr": r[3]} for r in rows]


@router.get("/hrv/trend")
async def hrv_trend(days: int = 28) -> list[dict]:
    conn = get_read_conn()
    try:
        rows = conn.execute(
            """
            SELECT date, hrv, hrv_28d_avg, hrv_28d_sd
            FROM v_hrv_baseline_28d
            ORDER BY date DESC
            LIMIT $days
            """,
            {"days": days},
        ).fetchall()
    finally:
        conn.close()
    return [{"date": str(r[0]), "hrv": r[1], "avg": r[2], "sd": r[3]} for r in reversed(rows)]


@router.get("/sleep/recent")
async def sleep_recent(days: int = 7) -> list[dict]:
    since = (date.today() - timedelta(days=days)).isoformat()
    conn = get_read_conn()
    try:
        rows = conn.execute(
            "SELECT night_date, stages_json, spo2_avg, rhr FROM sleep "
            "WHERE night_date >= $since ORDER BY night_date",
            {"since": since},
        ).fetchall()
    finally:
        conn.close()
    return [{"date": str(r[0]), "stages": r[1], "spo2": r[2], "rhr": r[3]} for r in rows]


@router.get("/readiness/today")
async def readiness_today() -> dict:
    conn = get_read_conn()
    try:
        row = conn.execute(
            "SELECT date, recovery_score, hrv, rhr, sleep_hours, "
            "energy_1_10, stress_1_10 FROM v_readiness LIMIT 1"
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return {}
    return {
        "date": str(row[0]),
        "recovery_score": row[1],
        "hrv": row[2],
        "rhr": row[3],
        "sleep_hours": row[4],
        "energy": row[5],
        "stress": row[6],
    }


@router.get("/oauth/status")
async def oauth_status() -> list[dict]:
    conn = get_read_conn()
    try:
        rows = conn.execute("SELECT source, last_sync_at, needs_reauth FROM oauth_state").fetchall()
    finally:
        conn.close()
    return [{"source": r[0], "last_sync_at": str(r[1]), "needs_reauth": r[2]} for r in rows]
