from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
import urllib.parse
from datetime import UTC, datetime

import httpx

from shc.auth.keychain import load_token, store_token
from shc.config import settings
from shc.db.schema import write_ctx


class WHOOPAuthError(RuntimeError):
    """Raised when WHOOP tokens are invalid/expired and re-authorization is required."""


def _client_id() -> str:
    return load_token("whoop", "client_id") or settings.whoop_client_id or ""


def _client_secret() -> str:
    return load_token("whoop", "client_secret") or settings.whoop_client_secret or ""

log = logging.getLogger(__name__)
_refresh_lock = asyncio.Lock()

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
    """Refresh the access token. Serialised via _refresh_lock to prevent rotating-token races."""
    async with _refresh_lock:
        refresh = load_token("whoop", "refresh_token")
        if not refresh:
            raise WHOOPAuthError("No WHOOP refresh token — run OAuth flow first")
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
        if resp.status_code in (400, 401):
            raise WHOOPAuthError(f"WHOOP refresh rejected ({resp.status_code}) — re-authorization required")
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
                "spo2": score.get("spo2_percentage"),
                "content_hash": _hash(r),
            }
            conn.execute(
                """
                INSERT INTO recovery (id, source, date, score, hrv, rhr, skin_temp, spo2, content_hash)
                VALUES ($id, $source, $date, $score, $hrv, $rhr, $skin_temp, $spo2, $content_hash)
                ON CONFLICT (id) DO UPDATE SET
                    score = EXCLUDED.score, hrv = EXCLUDED.hrv, rhr = EXCLUDED.rhr,
                    skin_temp = EXCLUDED.skin_temp, spo2 = EXCLUDED.spo2,
                    content_hash = EXCLUDED.content_hash
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
            ss = score.get("stage_summary") or {}
            needed = score.get("sleep_needed") or {}
            external_id = str(r["id"])

            def _ms_to_min(ms: int | None) -> float | None:
                return round(ms / 60_000, 1) if ms else None

            row = {
                "id": external_id,
                "source": "whoop",
                "night_date": r.get("start", "")[:10],
                "ts_in": r.get("start"),
                "ts_out": r.get("end"),
                "stages_json": str(ss),
                "spo2_avg": None,
                "rhr": score.get("respiratory_rate"),
                "hrv": None,
                "is_nap": bool(r.get("nap")),
                "sleep_performance_pct": score.get("sleep_performance_percentage"),
                "sleep_efficiency_pct": score.get("sleep_efficiency_percentage"),
                "sleep_consistency_pct": score.get("sleep_consistency_percentage"),
                "disturbance_count": ss.get("disturbance_count"),
                "sleep_needed_min": _ms_to_min(
                    (needed.get("baseline_milli") or 0) + (needed.get("need_from_sleep_debt_milli") or 0) + (needed.get("need_from_recent_strain_milli") or 0)
                ),
                "sws_min": _ms_to_min(ss.get("total_slow_wave_sleep_time_milli")),
                "rem_min": _ms_to_min(ss.get("total_rem_sleep_time_milli")),
                "light_min": _ms_to_min(ss.get("total_light_sleep_time_milli")),
                "awake_min": _ms_to_min(ss.get("total_awake_time_milli")),
                "content_hash": _hash(r),
            }
            conn.execute(
                """
                INSERT INTO sleep (id, source, night_date, ts_in, ts_out, stages_json,
                                   spo2_avg, rhr, hrv,
                                   is_nap, sleep_performance_pct, sleep_efficiency_pct,
                                   sleep_consistency_pct, disturbance_count, sleep_needed_min,
                                   sws_min, rem_min, light_min, awake_min,
                                   content_hash)
                VALUES ($id, $source, $night_date, $ts_in, $ts_out, $stages_json,
                        $spo2_avg, $rhr, $hrv,
                        $is_nap, $sleep_performance_pct, $sleep_efficiency_pct,
                        $sleep_consistency_pct, $disturbance_count, $sleep_needed_min,
                        $sws_min, $rem_min, $light_min, $awake_min,
                        $content_hash)
                ON CONFLICT (id) DO UPDATE SET
                    stages_json = EXCLUDED.stages_json,
                    is_nap = EXCLUDED.is_nap,
                    sleep_performance_pct = EXCLUDED.sleep_performance_pct,
                    sleep_efficiency_pct = EXCLUDED.sleep_efficiency_pct,
                    sleep_consistency_pct = EXCLUDED.sleep_consistency_pct,
                    disturbance_count = EXCLUDED.disturbance_count,
                    sleep_needed_min = EXCLUDED.sleep_needed_min,
                    sws_min = EXCLUDED.sws_min,
                    rem_min = EXCLUDED.rem_min,
                    light_min = EXCLUDED.light_min,
                    awake_min = EXCLUDED.awake_min,
                    content_hash = EXCLUDED.content_hash
                WHERE EXCLUDED.content_hash != sleep.content_hash
                """,
                row,
            )
    log.info("synced %d WHOOP sleep records", len(records))
    return len(records)


# Strength modalities already tracked by Hevy — skip mirroring to cardio_sessions.
_STRENGTH_KINDS: frozenset[str] = frozenset({"powerlifting", "weightlifting"})

_SPORT_NAMES: dict[int, str] = {
    -1: "activity",
    0: "running",
    1: "cycling",
    16: "baseball",
    17: "basketball",
    18: "rowing",
    19: "fencing",
    20: "field hockey",
    21: "football",
    22: "golf",
    24: "ice hockey",
    25: "lacrosse",
    27: "martial arts",
    28: "mountain biking",
    29: "obstacle course racing",
    30: "powerlifting",
    31: "rock climbing",
    32: "rowing",
    33: "rugby",
    34: "skiing",
    35: "snowboarding",
    36: "soccer",
    37: "softball",
    38: "squash",
    39: "swimming",
    40: "tennis",
    41: "track & field",
    42: "volleyball",
    43: "water polo",
    44: "wrestling",
    45: "yoga",
    47: "weightlifting",
    48: "cross country skiing",
    49: "functional fitness",
    50: "duathlon",
    51: "gymnastics",
    52: "hiking/rucking",
    53: "horseback riding",
    55: "triathlon",
    56: "walking",
    57: "surfing",
    58: "elliptical",
    59: "stairmaster",
    63: "meditation",
    64: "other",
    65: "pickleball",
    66: "padel",
    67: "boxing",
    68: "dance",
    69: "pilates",
    70: "kickboxing",
    71: "pickleball",
    101: "pickleball",
    126: "pickleball",
}


def _duration_min(start: str | None, end: str | None) -> int | None:
    if not start or not end:
        return None
    try:
        t0 = datetime.fromisoformat(start.replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(end.replace("Z", "+00:00"))
        return max(1, round((t1 - t0).total_seconds() / 60))
    except ValueError:
        return None


async def sync_workout() -> int:
    """Fetch WHOOP workout activities and upsert into the workouts and cardio_sessions tables."""
    records = await _paginate("/v2/activity/workout")
    async with write_ctx() as conn:
        for r in records:
            score = r.get("score") or {}
            sport_id = r.get("sport_id", -1)
            kind = _SPORT_NAMES.get(sport_id, f"sport_{sport_id}")
            kcal_kj = score.get("kilojoule")
            kcal = round(kcal_kj / 4.184, 1) if kcal_kj else None
            wid = f"whoop_w_{r['id']}"
            chash = _hash(r)
            row = {
                "id": wid,
                "source": "whoop",
                "started_at": r.get("start"),
                "ended_at": r.get("end"),
                "kind": kind,
                "strain": score.get("strain"),
                "avg_hr": score.get("average_heart_rate"),
                "max_hr": score.get("max_heart_rate"),
                "kcal": kcal,
                "notes": None,
                "content_hash": chash,
            }
            conn.execute(
                """
                INSERT INTO workouts (id, source, started_at, ended_at, kind, strain,
                                      avg_hr, max_hr, kcal, notes, content_hash)
                VALUES ($id, $source, $started_at, $ended_at, $kind, $strain,
                        $avg_hr, $max_hr, $kcal, $notes, $content_hash)
                ON CONFLICT (id) DO UPDATE SET
                    kind = EXCLUDED.kind, strain = EXCLUDED.strain,
                    avg_hr = EXCLUDED.avg_hr, max_hr = EXCLUDED.max_hr,
                    kcal = EXCLUDED.kcal, content_hash = EXCLUDED.content_hash
                """,
                row,
            )
            # Mirror into cardio_sessions so cardio_age_days / cardio_min_28d stay fresh.
            # Skip pure strength modalities already tracked by Hevy.
            if kind not in _STRENGTH_KINDS:
                conn.execute(
                    """
                    INSERT INTO cardio_sessions
                        (id, date, modality, duration_min, avg_hr, rpe,
                         zone_distribution_json, content_hash)
                    VALUES ($id, $date, $modality, $duration_min, $avg_hr,
                            NULL, NULL, $content_hash)
                    ON CONFLICT (id) DO UPDATE SET
                        modality    = EXCLUDED.modality,
                        duration_min = EXCLUDED.duration_min,
                        avg_hr      = EXCLUDED.avg_hr,
                        content_hash = EXCLUDED.content_hash
                    WHERE EXCLUDED.content_hash != cardio_sessions.content_hash
                    """,
                    {
                        "id": wid,
                        "date": (r.get("start") or "")[:10],
                        "modality": kind,
                        "duration_min": _duration_min(r.get("start"), r.get("end")),
                        "avg_hr": score.get("average_heart_rate"),
                        "content_hash": chash,
                    },
                )
    log.info("synced %d WHOOP workout records", len(records))
    return len(records)


async def sync_cycle() -> int:
    """Fetch daily cycle records (strain, kcal, avg/max HR) and upsert into daily_cycle."""
    records = await _paginate("/v2/cycle")
    async with write_ctx() as conn:
        for r in records:
            score = r.get("score") or {}
            if r.get("score_state") not in ("SCORED", "PENDING_SCORE"):
                continue
            row = {
                "id": str(r["id"]),
                "date": r.get("start", "")[:10],
                "strain": score.get("strain"),
                "kilojoule": score.get("kilojoule"),
                "avg_hr": score.get("average_heart_rate"),
                "max_hr": score.get("max_heart_rate"),
                "content_hash": _hash(r),
            }
            conn.execute(
                """
                INSERT INTO daily_cycle (id, date, strain, kilojoule, avg_hr, max_hr, content_hash)
                VALUES ($id, $date, $strain, $kilojoule, $avg_hr, $max_hr, $content_hash)
                ON CONFLICT (id) DO UPDATE SET
                    strain = EXCLUDED.strain, kilojoule = EXCLUDED.kilojoule,
                    avg_hr = EXCLUDED.avg_hr, max_hr = EXCLUDED.max_hr,
                    content_hash = EXCLUDED.content_hash
                WHERE EXCLUDED.content_hash != daily_cycle.content_hash
                """,
                row,
            )
    log.info("synced %d WHOOP cycle records", len(records))
    return len(records)


async def sync_all() -> dict[str, int]:
    """Full sync — called by APScheduler 2x/day.

    Only sets needs_reauth on WHOOPAuthError. Transient failures (429, network
    errors, etc.) are logged but do not trigger the reauth banner.
    """
    try:
        recovery_n = await sync_recovery()
        sleep_n = await sync_sleep()
        workout_n = await sync_workout()
        cycle_n = await sync_cycle()
        async with write_ctx() as conn:
            conn.execute(
                "INSERT INTO oauth_state (source, last_sync_at, needs_reauth) "
                "VALUES ('whoop', $ts, FALSE) ON CONFLICT (source) DO UPDATE "
                "SET last_sync_at = EXCLUDED.last_sync_at, needs_reauth = FALSE",
                {"ts": datetime.now(UTC).isoformat()},
            )
        return {"recovery": recovery_n, "sleep": sleep_n, "workout": workout_n, "cycle": cycle_n}
    except WHOOPAuthError:
        log.exception("WHOOP auth error — marking needs_reauth")
        async with write_ctx() as conn:
            conn.execute(
                "INSERT INTO oauth_state (source, needs_reauth) VALUES ('whoop', TRUE) "
                "ON CONFLICT (source) DO UPDATE SET needs_reauth = TRUE"
            )
        raise
    except Exception:
        log.exception("WHOOP sync failed (transient) — not marking needs_reauth")
        raise
