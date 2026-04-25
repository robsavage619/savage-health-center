from __future__ import annotations

"""Workout plan context builder, validator, and persistence layer.

Generation happens externally — either through the Claude chat interface
(preferred) or as a fallback via Ollama.  This module never calls an LLM
directly; it only:

  1. Loads Obsidian vault research for use in system prompts / chat context.
  2. Builds the per-request dynamic training context from the live DB.
  3. Validates plan dicts against the required schema.
  4. Saves / loads plans to / from the workout_plans table.
"""

import json
import logging
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from shc.config import settings
from shc.db.schema import get_read_conn, write_ctx

log = logging.getLogger(__name__)

# ── Vault research ────────────────────────────────────────────────────────────

_VAULT_NOTES = [
    "kiviniemi-2007-hrv-guided-endurance-training.md",
    "plews-2013-hrv-monitoring-compliance.md",
    "overreaching-detection.md",
    "fitness-fatigue-theory.md",
    "progressive-overload-strength.md",
    "training-frequency-strength.md",
]

_KEEP_HEADINGS = {
    "## Summary",
    "## Prescription",
    "## Practical Takeaways",
    "## Key Claims",
    "## Overtraining Continuum",
    "## Sequence of Impairments",
    "## Recovery Time by Muscle Group",
    "## Boundary Conditions",
}


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        parts = text.split("---", 2)
        return parts[2].strip() if len(parts) >= 3 else text
    return text


def _extract_sections(text: str) -> str:
    lines = text.split("\n")
    output: list[str] = []
    capturing = False
    for line in lines:
        stripped = line.strip()
        is_heading = stripped.startswith("## ") or stripped.startswith("# ")
        if is_heading:
            capturing = any(h in stripped for h in _KEEP_HEADINGS)
        if capturing:
            output.append(line)
    return "\n".join(output).strip()


def load_vault_research() -> str:
    """Load relevant vault notes and return them as a single formatted string."""
    wiki_dir = settings.vault_path / "wiki"
    if not wiki_dir.exists():
        log.warning("Vault wiki dir not found at %s", wiki_dir)
        return "Vault not available."

    sections: list[str] = []
    for note_name in _VAULT_NOTES:
        path = wiki_dir / note_name
        if not path.exists():
            log.warning("Vault note missing: %s", path)
            continue
        raw = path.read_text(encoding="utf-8")
        content = _strip_frontmatter(raw)
        excerpt = _extract_sections(content) or content[:1500]

        title = note_name.replace(".md", "").replace("-", " ").title()
        for line in content.split("\n"):
            if line.startswith("# "):
                title = line[2:].strip()
                break
        sections.append(f"#### {title}\n\n{excerpt}")

    return "\n\n---\n\n".join(sections)


_VAULT_RESEARCH: str = ""


def get_vault_research() -> str:
    global _VAULT_RESEARCH
    if not _VAULT_RESEARCH:
        _VAULT_RESEARCH = load_vault_research()
    return _VAULT_RESEARCH


# ── Training context builder ──────────────────────────────────────────────────

def _muscle_group(exercise: str) -> str:
    e = exercise.lower()
    _PUSH = ("press", "fly", "dip", "pushup", "push-up", "tricep", "shoulder", "overhead", "chest")
    _PULL = ("row", "pull", "curl", "lat", "deadlift", "shrug", "face pull", "rear delt")
    _LEGS = ("squat", "leg", "lunge", "hip", "glute", "hamstring", "quad", "calf", "rdl", "step-up")
    _CORE = ("plank", "crunch", "ab ", "core", "oblique", "sit-up", "rotation")
    if any(k in e for k in _PUSH):
        return "push"
    if any(k in e for k in _PULL):
        return "pull"
    if any(k in e for k in _LEGS):
        return "legs"
    if any(k in e for k in _CORE):
        return "core"
    return "other"


def build_training_context(conn) -> str:
    """Build the per-request dynamic context string from the live DB.

    Args:
        conn: An open DuckDB read connection.

    Returns:
        Multi-section text covering readiness, muscle group rest, training
        history, working weights, and volume trend.
    """
    today = date.today().isoformat()
    since_7 = (date.today() - timedelta(days=7)).isoformat()
    since_28 = (date.today() - timedelta(days=28)).isoformat()
    since_30 = (date.today() - timedelta(days=30)).isoformat()

    rec = conn.execute(
        "SELECT date, score, hrv, rhr FROM recovery ORDER BY date DESC LIMIT 1"
    ).fetchone()
    hrv_base = conn.execute(
        "SELECT hrv, hrv_28d_avg, hrv_28d_sd FROM v_hrv_baseline_28d ORDER BY date DESC LIMIT 1"
    ).fetchone()
    sleep_recent = conn.execute(
        "SELECT night_date, epoch(ts_out-ts_in)/3600.0 AS hrs FROM sleep ORDER BY night_date DESC LIMIT 7"
    ).fetchall()
    sleep_7d_avg = conn.execute(
        "SELECT AVG(epoch(ts_out-ts_in)/3600.0) FROM sleep WHERE night_date >= $s",
        {"s": since_7},
    ).fetchone()
    rhr_7d = conn.execute(
        "SELECT AVG(rhr) FROM recovery WHERE date >= $s", {"s": since_7}
    ).fetchone()
    scores_7 = conn.execute(
        "SELECT AVG(score) FROM recovery WHERE date >= $s", {"s": since_7}
    ).fetchone()
    scores_28 = conn.execute(
        "SELECT AVG(score) FROM recovery WHERE date >= $s", {"s": since_28}
    ).fetchone()
    workout_rows = conn.execute(
        """
        SELECT w.started_at::DATE AS day,
               STRING_AGG(DISTINCT ws.exercise, ', ') AS exercises,
               COUNT(*) AS sets,
               SUM(ws.weight_kg * ws.reps) AS volume_kg
        FROM workout_sets ws
        JOIN workouts w ON w.id = ws.workout_id
        WHERE ws.is_warmup = FALSE AND w.started_at::DATE >= $since
        GROUP BY day ORDER BY day DESC
        """,
        {"since": since_30},
    ).fetchall()
    ww_rows = conn.execute(
        "SELECT exercise, weight_kg, source FROM working_weights ORDER BY updated_at DESC"
    ).fetchall()
    top_exercises = conn.execute(
        """
        SELECT ws.exercise, COUNT(*) AS sets, MAX(ws.weight_kg) AS max_kg
        FROM workout_sets ws
        JOIN workouts w ON w.id = ws.workout_id
        WHERE ws.is_warmup = FALSE
          AND w.started_at::DATE >= $since
          AND ws.weight_kg IS NOT NULL
        GROUP BY ws.exercise ORDER BY sets DESC LIMIT 20
        """,
        {"since": (date.today() - timedelta(days=90)).isoformat()},
    ).fetchall()
    prefs = conn.execute(
        "SELECT exercise, status, notes FROM exercise_preferences WHERE status IN ('no', 'sub')"
    ).fetchall()
    vol_rows = conn.execute(
        """
        SELECT date_trunc('week', w.started_at)::DATE AS week,
               COUNT(*) AS sets,
               SUM(ws.weight_kg * ws.reps) AS volume_kg
        FROM workout_sets ws
        JOIN workouts w ON w.id = ws.workout_id
        WHERE ws.is_warmup = FALSE AND w.started_at::DATE >= $since
        GROUP BY week ORDER BY week
        """,
        {"since": (date.today() - timedelta(days=56)).isoformat()},
    ).fetchall()

    # Compute derived values
    rec_score = rec[1] if rec else None
    rec_date = str(rec[0]) if rec else None
    hrv_today = hrv_base[0] if hrv_base else None
    hrv_avg = hrv_base[1] if hrv_base else None
    hrv_sd = hrv_base[2] if hrv_base else None
    hrv_sigma = (
        round((hrv_today - hrv_avg) / hrv_sd, 2)
        if (hrv_today and hrv_avg and hrv_sd and hrv_sd > 0)
        else None
    )
    sleep_hrs = round(float(sleep_recent[0][1]), 1) if sleep_recent and sleep_recent[0][1] else None
    sleep_7d = round(float(sleep_7d_avg[0]), 1) if sleep_7d_avg and sleep_7d_avg[0] else None
    acwr_acute = float(scores_7[0]) if scores_7 and scores_7[0] else None
    acwr_chronic = float(scores_28[0]) if scores_28 and scores_28[0] else None
    acwr = round(acwr_acute / acwr_chronic, 2) if (acwr_acute and acwr_chronic) else None

    data_gap_days = (date.today() - date.fromisoformat(rec_date)).days if rec_date else None
    data_gap_flag = (
        f"⚠ WHOOP data is {data_gap_days}d stale — reduce reliance on recovery score"
        if data_gap_days and data_gap_days > 2
        else ""
    )

    group_last: dict[str, str] = {}
    for row in workout_rows:
        for ex in (row[1] or "").split(", "):
            g = _muscle_group(ex)
            day_str = str(row[0])
            if g not in group_last or day_str > group_last[g]:
                group_last[g] = day_str
    days_since: dict[str, int] = {
        g: (date.today() - date.fromisoformat(last)).days
        for g, last in group_last.items()
    }
    for g in ("legs", "push", "pull"):
        if g not in days_since:
            days_since[g] = 99

    vols = [float(r[2] or 0) for r in vol_rows]
    half = len(vols) // 2
    prior_vol = sum(vols[:half]) / max(half, 1) if half else 0
    recent_vol = sum(vols[half:]) / max(len(vols) - half, 1) if vols else 0
    vol_trend_pct = round((recent_vol - prior_vol) / prior_vol * 100, 1) if prior_vol > 0 else 0
    vol_trend_label = (
        f"+{vol_trend_pct}% (INCREASING — monitor ACWR)" if vol_trend_pct > 15
        else f"{vol_trend_pct}% (stable)" if -10 <= vol_trend_pct <= 15
        else f"{vol_trend_pct}% (decreasing)"
    )

    lines: list[str] = [f"TODAY: {today}\n"]

    lines.append("## READINESS SNAPSHOT")
    if rec_score is not None:
        tier = "🟢 GREEN" if rec_score >= 67 else ("🟡 YELLOW" if rec_score >= 34 else "🔴 RED")
        lines.append(f"- Recovery score: {rec_score:.0f} ({tier}) — measured {rec_date}")
    else:
        lines.append("- Recovery score: no data")
    if hrv_today and hrv_avg and hrv_sigma is not None:
        lines.append(
            f"- HRV (rMSSD): {hrv_today:.1f}ms · 28d baseline {hrv_avg:.1f}ms ± {hrv_sd:.1f}ms"
            f" · deviation {hrv_sigma:+.2f}σ"
        )
    else:
        lines.append("- HRV: no data")
    if sleep_hrs:
        lines.append(f"- Sleep last night: {sleep_hrs}h · 7d avg {sleep_7d}h")
    else:
        lines.append("- Sleep: no data")
    if acwr:
        zone = "safe" if 0.8 <= acwr <= 1.3 else ("⚠ HIGH" if acwr > 1.3 else "low")
        lines.append(f"- ACWR: {acwr} ({zone}) — acute {acwr_acute:.0f} / chronic {acwr_chronic:.0f}")
    else:
        lines.append("- ACWR: insufficient data")
    if rhr_7d and rhr_7d[0]:
        lines.append(f"- RHR 7d avg: {float(rhr_7d[0]):.0f} bpm")
    if data_gap_flag:
        lines.append(f"- {data_gap_flag}")

    lines.append("\n## MUSCLE GROUP REST STATUS")
    for g, d_val in sorted(days_since.items(), key=lambda x: -x[1]):
        flag = " ← MOST RESTED" if d_val == max(days_since.values()) else ""
        lines.append(f"- {g}: {d_val}d since last session{flag}")

    lines.append(f"\n## TRAINING HISTORY (last 30 days — {len(workout_rows)} sessions)")
    for row in workout_rows[:14]:
        vol_str = f"{row[3] / 1000:.1f} tonnes" if row[3] else "bw/machine"
        ex_preview = (row[1] or "")[:120]
        lines.append(f"- {row[0]}: {row[2]} sets | {vol_str} | {ex_preview}")

    lines.append(f"\n## WORKING WEIGHTS ({len(ww_rows)} exercises on record)")
    for ex, wkg, src in ww_rows[:40]:
        lbs = round(wkg * 2.20462, 1) if wkg else 0
        lines.append(f"- {ex}: {lbs} lbs ({wkg:.1f} kg) [{src}]")
    if len(ww_rows) > 40:
        lines.append(f"  ... and {len(ww_rows) - 40} more")

    lines.append("\n## TOP EXERCISES (last 90d by frequency)")
    for ex, sets, max_kg in top_exercises:
        lbs = round(max_kg * 2.20462, 1) if max_kg else "bw"
        lines.append(f"- {ex}: {sets} sets, max {lbs} lbs")

    lines.append(f"\n## VOLUME TREND (8-week): {vol_trend_label}")

    # ── Cardio mix (fat-loss lever) ──────────────────────────────────────
    cardio_rows = conn.execute(
        """
        SELECT modality, SUM(duration_min) AS minutes, COUNT(*) AS sessions, AVG(avg_hr) AS avg_hr
        FROM cardio_sessions
        WHERE date >= (current_date - INTERVAL '28 days')
        GROUP BY modality ORDER BY minutes DESC
        """
    ).fetchall()
    total_cardio_min = sum(int(r[1] or 0) for r in cardio_rows)
    if cardio_rows:
        lines.append("\n## CARDIO MIX (last 28 days)")
        lines.append(f"- Total minutes: {total_cardio_min} ({total_cardio_min // 4}/wk avg)")
        for mod, mins, sess, avg_hr in cardio_rows:
            hr_str = f", avg HR {int(avg_hr)}" if avg_hr else ""
            lines.append(f"- {mod}: {int(mins or 0)} min over {sess} sessions{hr_str}")
    else:
        lines.append("\n## CARDIO MIX (last 28 days): none logged — fat-loss programming should add Z2 + finisher")

    # ── Push:pull balance (last 4 weeks) ─────────────────────────────────
    bal_rows = conn.execute(
        """
        SELECT ws.exercise, COUNT(*) AS sets
        FROM workout_sets ws
        JOIN workouts w ON w.id = ws.workout_id
        WHERE ws.is_warmup = FALSE
          AND w.started_at::DATE >= (current_date - INTERVAL '28 days')
        GROUP BY ws.exercise
        """
    ).fetchall()
    bal: dict[str, int] = {"push": 0, "pull": 0, "legs": 0, "core": 0, "other": 0}
    for ex, sets in bal_rows:
        bal[_muscle_group(ex)] += int(sets or 0)
    push, pull = bal["push"], bal["pull"]
    if push and pull:
        ratio = push / pull
        if ratio > 1.4:
            balance_note = f"⚠ PUSH-DOMINANT (push:pull = {ratio:.2f}) — bias today toward pull"
        elif ratio < 0.7:
            balance_note = f"⚠ PULL-DOMINANT (push:pull = {ratio:.2f}) — bias today toward push"
        else:
            balance_note = f"balanced (push:pull = {ratio:.2f})"
        lines.append(
            f"\n## MUSCLE BALANCE (28d sets): push {push} | pull {pull} | legs {bal['legs']} | core {bal['core']}"
        )
        lines.append(f"- Status: {balance_note}")

    # ── Skin temperature (illness signal) ────────────────────────────────
    skin = conn.execute(
        """
        SELECT skin_temp,
               (SELECT AVG(skin_temp) FROM recovery WHERE skin_temp IS NOT NULL AND date >= (current_date - INTERVAL '28 days')) AS base
        FROM recovery WHERE skin_temp IS NOT NULL ORDER BY date DESC LIMIT 1
        """
    ).fetchone()
    if skin and skin[0] is not None and skin[1] is not None:
        delta = float(skin[0]) - float(skin[1])
        flag = ""
        if abs(delta) >= 0.5:
            flag = " ← ILLNESS POSSIBLE — recommend rest / Z2 only"
        elif abs(delta) >= 0.3:
            flag = " (watch)"
        lines.append(f"\n## SKIN TEMP: {skin[0]:.2f}°C, Δ {delta:+.2f}°C vs 28d baseline{flag}")

    # ── Goals reminder ───────────────────────────────────────────────────
    lines.append("\n## GOALS")
    lines.append("- Primary: get stronger (preserve/build lean mass)")
    lines.append("- Secondary: burn fat (body recomposition)")
    lines.append("- Tactic: heavy compounds for strength, density+supersets+finishers for fat loss")

    if prefs:
        lines.append("\n## EXERCISES TO AVOID/SUBSTITUTE")
        for ex, status, notes in prefs:
            lines.append(f"- {ex} ({status})" + (f": {notes}" if notes else ""))

    return "\n".join(lines)


# ── Validation ────────────────────────────────────────────────────────────────

def validate_plan(plan: dict[str, Any]) -> bool:
    """Validate a plan dict against the required schema.

    Raises:
        ValueError: on any schema violation.
    """
    if plan.get("readiness_tier") not in {"green", "yellow", "red"}:
        raise ValueError(f"Invalid readiness_tier: {plan.get('readiness_tier')!r}")
    rec = plan.get("recommendation", {})
    if rec.get("intensity") not in {"high", "moderate", "low", "rest"}:
        raise ValueError(
            f"Invalid intensity: {rec.get('intensity')!r} — must be string enum, not number"
        )
    if not rec.get("focus"):
        raise ValueError("recommendation.focus is empty")
    blocks = plan.get("blocks", [])
    if not blocks:
        raise ValueError("Plan has no blocks")
    for i, block in enumerate(blocks):
        if not block.get("exercises"):
            raise ValueError(f"Block {i} ({block.get('label')!r}) has no exercises")
    if not plan.get("clinical_notes"):
        raise ValueError("clinical_notes is empty — must include medication context")
    if not plan.get("vault_insights"):
        raise ValueError("vault_insights is empty — must cite research")
    return True


# ── Persistence ────────────────────────────────────────────────────────────────

async def save_plan(plan: dict[str, Any], source: str = "claude") -> None:
    """Persist a validated plan to workout_plans for today."""
    today = date.today().isoformat()
    async with write_ctx() as conn:
        conn.execute(
            """
            INSERT INTO workout_plans (date, plan_json, source, created_at)
            VALUES ($date, $json, $src, now())
            ON CONFLICT (date) DO UPDATE SET
                plan_json = EXCLUDED.plan_json,
                source = EXCLUDED.source,
                created_at = EXCLUDED.created_at
            """,
            {"date": today, "json": json.dumps(plan), "src": source},
        )
    log.info("Saved workout plan for %s (source=%s)", today, source)


def load_plan(target_date: str | None = None) -> dict[str, Any] | None:
    """Load the stored plan for a given date (defaults to today).

    Returns:
        Plan dict or None if no plan exists for that date.
    """
    d = target_date or date.today().isoformat()
    conn = get_read_conn()
    try:
        row = conn.execute(
            "SELECT plan_json FROM workout_plans WHERE date = $d", {"d": d}
        ).fetchone()
    finally:
        conn.close()
    return json.loads(row[0]) if row else None
