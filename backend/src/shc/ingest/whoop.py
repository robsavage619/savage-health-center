from __future__ import annotations

import hashlib
import logging
import secrets
import urllib.parse
from datetime import UTC, datetime

import httpx

from shc.auth.keychain import load_token, store_token
from shc.config import settings
from shc.db.schema import write_ctx


def _client_id() -> str:
    return load_token("whoop", "client_id") or settings.whoop_client_id or ""


def _client_secret() -> str:
    return load_token("whoop", "client_secret") or settings.whoop_client_secret or ""

log = logging.getLogger(__name__)

WHOOP_BASE = "https://api.prod.whoop.com/developer"
AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"  # noqa: S105
SCOPES = "offline read:recovery read:sleep read:workout read:cycles read:body_measurement"

_oauth_state: dict[str, str] = {}


def get_auth_url() -> str:
    state = secrets.token_urlsafe(16)
    _oauth_state["pending"] = state
    params = {
        "client_id": _client_id(),
        "redirect_uri": settings.whoop_redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
    }
    return AUTH_URL + "?" + urllib.parse.urlencode(params)


async def exchange_code(code: str, state: str) -> None:
    if state != _oauth_state.get("pending"):
        raise ValueError("OAuth state mismatch")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.whoop_redirect_uri,
                "client_id": _client_id(),
                "client_secret": _client_secret(),
            },
        )
        resp.raise_for_status()
    tokens = resp.json()
    store_token("whoop", "access_token", tokens["access_token"])
    store_token("whoop", "refresh_token", tokens["refresh_token"])
    log.info("WHOOP tokens stored")


async def _refresh() -> str:
    refresh = load_token("whoop", "refresh_token")
    if not refresh:
        raise RuntimeError("No WHOOP refresh token — run OAuth flow first")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "client_id": _client_id(),
                "client_secret": _client_secret(),
            },
        )
        resp.raise_for_status()
    tokens = resp.json()
    store_token("whoop", "access_token", tokens["access_token"])
    store_token("whoop", "refresh_token", tokens["refresh_token"])
    log.info("WHOOP tokens refreshed")
    return tokens["access_token"]


async def _get(path: str, params: dict | None = None) -> dict:
    token = load_token("whoop", "access_token")
    if not token:
        token = await _refresh()

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{WHOOP_BASE}{path}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code == 401:
            token = await _refresh()
            resp = await client.get(
                f"{WHOOP_BASE}{path}",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
        resp.raise_for_status()
    return resp.json()


def _hash(data: dict) -> str:
    return hashlib.sha256(str(sorted(data.items())).encode()).hexdigest()[:16]


async def _paginate(path: str) -> list[dict]:
    """Fetch all pages from a v2 WHOOP endpoint using next_token pagination."""
    records: list[dict] = []
    params: dict = {"limit": 25}
    while True:
        page = await _get(path, params)
        records.extend(page.get("records", []))
        next_token = page.get("next_token")
        if not next_token:
            break
        params = {"limit": 25, "nextToken": next_token}
    return records


async def sync_recovery() -> int:
    """Fetch recent recovery records and upsert into DuckDB."""
    records = await _paginate("/v2/recovery")
    async with write_ctx() as conn:
        for r in records:
            score = r.get("score") or {}
            external_id = str(r["cycle_id"])
            rec_date = r.get("created_at", "")[:10]
            row = {
                "id": external_id,
                "source": "whoop",
                "date": rec_date,
                "score": score.get("recovery_score"),
                "hrv": score.get("hrv_rmssd_milli"),
                "rhr": score.get("resting_heart_rate"),
                "skin_temp": score.get("skin_temp_celsius"),
                "content_hash": _hash(r),
            }
            conn.execute(
                """
                INSERT INTO recovery (id, source, date, score, hrv, rhr, skin_temp, content_hash)
                VALUES ($id, $source, $date, $score, $hrv, $rhr, $skin_temp, $content_hash)
                ON CONFLICT (id) DO UPDATE SET
                    score = EXCLUDED.score, hrv = EXCLUDED.hrv, rhr = EXCLUDED.rhr,
                    skin_temp = EXCLUDED.skin_temp, content_hash = EXCLUDED.content_hash
                WHERE EXCLUDED.content_hash != recovery.content_hash
                """,
                row,
            )
    log.info("synced %d WHOOP recovery records", len(records))
    return len(records)


async def sync_sleep() -> int:
    records = await _paginate("/v2/activity/sleep")
    async with write_ctx() as conn:
        for r in records:
            score = r.get("score") or {}
            stage_summary = score.get("stage_summary", {})
            external_id = str(r["id"])
            row = {
                "id": external_id,
                "source": "whoop",
                "night_date": r.get("start", "")[:10],
                "ts_in": r.get("start"),
                "ts_out": r.get("end"),
                "stages_json": str(stage_summary),
                "spo2_avg": None,  # not in v2 sleep; available in recovery score
                "rhr": score.get("respiratory_rate"),
                "hrv": None,
                "content_hash": _hash(r),
            }
            conn.execute(
                """
                INSERT INTO sleep (id, source, night_date, ts_in, ts_out, stages_json,
                                   spo2_avg, rhr, hrv, content_hash)
                VALUES ($id, $source, $night_date, $ts_in, $ts_out, $stages_json,
                        $spo2_avg, $rhr, $hrv, $content_hash)
                ON CONFLICT (id) DO UPDATE SET
                    stages_json = EXCLUDED.stages_json, spo2_avg = EXCLUDED.spo2_avg,
                    content_hash = EXCLUDED.content_hash
                WHERE EXCLUDED.content_hash != sleep.content_hash
                """,
                row,
            )
    log.info("synced %d WHOOP sleep records", len(records))
    return len(records)


async def sync_all() -> None:
    """Full sync — called by APScheduler every 30 min."""
    try:
        await sync_recovery()
        await sync_sleep()
        async with write_ctx() as conn:
            conn.execute(
                "INSERT INTO oauth_state (source, last_sync_at, needs_reauth) "
                "VALUES ('whoop', $ts, FALSE) ON CONFLICT (source) DO UPDATE "
                "SET last_sync_at = EXCLUDED.last_sync_at, needs_reauth = FALSE",
                {"ts": datetime.now(UTC).isoformat()},
            )
    except Exception:
        log.exception("WHOOP sync failed")
        async with write_ctx() as conn:
            conn.execute(
                "INSERT INTO oauth_state (source, needs_reauth) VALUES ('whoop', TRUE) "
                "ON CONFLICT (source) DO UPDATE SET needs_reauth = TRUE"
            )
        raise
