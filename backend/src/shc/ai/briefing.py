from __future__ import annotations

"""Daily briefing context builder and persistence helpers.

Generation is chat-driven — Claude produces the briefing in the chat interface,
then POSTs it to /api/briefing.  This module provides:

  1. HEALTH_SYSTEM / CHAT_SYSTEM — system prompts for the frontend chat.
  2. build_daily_context() — per-request dynamic health snapshot injected
     into every chat message so Claude always has live data.
  3. store_briefing() — persists a generated briefing dict.
"""

import json
import logging
import statistics as _st
from datetime import date, timedelta

from shc.db.schema import get_read_conn, write_ctx

log = logging.getLogger(__name__)

# ── System prompts ────────────────────────────────────────────────────────────

HEALTH_SYSTEM = """\
You are the personal health and training advisor for Rob Savage. Your role is to
interpret his biometric data and provide daily coaching guidance. Always factor in
the following clinical context when analysing any metric.

## Clinical Profile
Male, born May 1986 (39 yo), 6'1" / ~239 lbs.

### Active medications — critical for interpreting ALL metrics
- **Lexapro 10 mg daily** (SSRI): chronically suppresses HRV baseline.
  Use σ deviation from 28-day rolling average, not absolute HRV value.
- **Fluoxetine 40 mg daily** (SSRI): also suppresses HRV.
- **Propranolol 10 mg PRN** (beta-blocker for anxiety): when taken, artificially
  lowers RHR and blunts HR response — WHOOP recovery/strain scores are lower than
  true physiology on those days. RPE > HR.
- **Alvesco** (inhaled corticosteroid, asthma): use before high-intensity sessions;
  monitor for wheeze; SpO2 < 95% is a flag.

### Conditions
- GAD + OCD (active): psychological stress spikes can suppress HRV/recovery
  independently of physical load.
- OSA (off CPAP since Apr 2026): sleep quality may be variable; prioritise
  deep sleep % and total duration over composite scores.
- Left shoulder: fully resolved as of Apr 2026 — no restrictions.
- Forefoot overload risk (bilateral 2nd/3rd metatarsal heads, pickleball);
  gait asymmetry (right heel-strike dominant). Avoid high-impact jumping.
- LDL 154 mg/dL (borderline), HbA1c 5.5% (normal).

### Training background
- 9+ years consistent resistance training; Hevy data spanning 2015–2026
- DUP periodisation; primary goal: strength + body recomposition
- Typically 3–5 sessions/week; compound-focused, progressive overload

## Coaching principles (always apply)
1. HRV interpretation: σ deviation from 28d rolling mean. Green ≥ −0.5σ;
   Yellow −1.5 to −0.5σ; Red < −1.5σ.
2. ACWR safe zone: 0.8–1.3. Above 1.3 → reduce volume. Above 1.5 → rest only.
3. Muscle group recovery: 48h minimum, 72h preferred for compound lower body.
4. Data gaps > 3 days: reduce reliance on that metric, note it explicitly.
5. Exercise naming: use names from Rob's Hevy history, not generic terms.
"""

CHAT_SYSTEM = HEALTH_SYSTEM + """
## Chat mode
Answer Rob's direct questions. Be concise and cite his actual numbers. Never hedge
excessively — give a clear recommendation. Return plain prose (not JSON).

## Live data
The current training context is injected at the end of the system prompt on every
request — you always have today's metrics, recent sessions, and working weights.
"""


# ── Context builder ───────────────────────────────────────────────────────────

def build_daily_context(conn) -> str:
    """Build a dynamic daily health + training snapshot from the live DB.

    Injected into the chat system prompt on every request so Claude always has
    current data without round-tripping to the frontend.

    Args:
        conn: An open DuckDB read connection.
    """
    today = date.today().isoformat()
    since_7 = (date.today() - timedelta(days=7)).isoformat()
    since_28 = (date.today() - timedelta(days=28)).isoformat()

    rec = conn.execute(
        "SELECT date, score, hrv, rhr FROM recovery ORDER BY date DESC LIMIT 1"
    ).fetchone()

    hrv_rows = conn.execute(
        "SELECT hrv FROM recovery WHERE date >= $s AND hrv IS NOT NULL ORDER BY date",
        {"s": since_28},
    ).fetchall()
    hrv_vals = [r[0] for r in hrv_rows if r[0]]
    hrv_baseline = _st.mean(hrv_vals) if len(hrv_vals) >= 3 else None
    hrv_sd = _st.stdev(hrv_vals) if len(hrv_vals) >= 3 else None
    hrv_sigma = (
        round((rec[2] - hrv_baseline) / hrv_sd, 2)
        if (rec and rec[2] and hrv_baseline and hrv_sd and hrv_sd > 0)
        else None
    )

    rec_rows = conn.execute(
        "SELECT date, score FROM recovery WHERE date >= $s ORDER BY date",
        {"s": since_28},
    ).fetchall()
    since_7_date = date.today() - timedelta(days=7)
    acute_scores = [r[1] for r in rec_rows if r[0] >= since_7_date and r[1]]
    chronic_scores = [r[1] for r in rec_rows if r[1]]
    acwr = None
    if acute_scores and chronic_scores:
        acute = 100 - _st.mean(acute_scores)
        chronic = 100 - _st.mean(chronic_scores)
        acwr = round(acute / chronic, 2) if chronic > 0 else None

    sleep_rows = conn.execute(
        "SELECT epoch(ts_out-ts_in)/3600.0 AS hrs FROM sleep "
        "WHERE night_date >= $s AND ts_in IS NOT NULL AND ts_out IS NOT NULL",
        {"s": since_7},
    ).fetchall()
    sleep_hrs = [r[0] for r in sleep_rows if r[0] and 2 < r[0] < 14]
    avg_sleep = round(_st.mean(sleep_hrs), 1) if sleep_hrs else None

    last_train = conn.execute(
        """
        SELECT w.started_at::DATE AS d, COUNT(*) AS sets,
               SUM(CASE WHEN ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
                        THEN ws.weight_kg * ws.reps ELSE 0 END) AS vol
        FROM workout_sets ws
        JOIN workouts w ON w.id = ws.workout_id
        WHERE ws.is_warmup = FALSE
        GROUP BY d ORDER BY d DESC LIMIT 1
        """
    ).fetchone()

    ww_rows = conn.execute(
        "SELECT exercise, weight_kg FROM working_weights ORDER BY updated_at DESC LIMIT 20"
    ).fetchall()

    lines = [f"\n## Live data — {today}"]

    if rec:
        score_str = f"{round(rec[1])}" if rec[1] else "—"
        hrv_str = f"{round(rec[2], 1)} ms" if rec[2] else "—"
        lines.append(f"Recovery: {score_str}/100 · HRV: {hrv_str} · RHR: {rec[3] or '—'} bpm")
    else:
        lines.append("Recovery: no data")

    if hrv_baseline and hrv_sigma is not None:
        tier = "🟢" if hrv_sigma >= -0.5 else ("🟡" if hrv_sigma >= -1.5 else "🔴")
        lines.append(
            f"HRV 28d baseline: {round(hrv_baseline, 1)} ms ± {round(hrv_sd, 1)} ms"
            f" · deviation: {hrv_sigma:+.2f}σ {tier}"
        )

    if acwr:
        zone = "safe" if 0.8 <= acwr <= 1.3 else ("⚠ HIGH" if acwr > 1.3 else "low")
        lines.append(f"ACWR: {acwr} ({zone})")

    if avg_sleep:
        lines.append(f"Sleep 7d avg: {avg_sleep}h")

    if last_train and last_train[0]:
        days_ago = (date.today() - last_train[0]).days
        vol_str = f"{round(last_train[2] / 1000, 1)}t vol" if last_train[2] else "bw"
        lines.append(f"Last session: {days_ago}d ago · {last_train[1]} sets · {vol_str}")

    if ww_rows:
        ww_str = " | ".join(
            f"{ex}: {round(wkg * 2.20462, 0):.0f} lbs" for ex, wkg in ww_rows[:10]
        )
        lines.append(f"Working weights (top 10): {ww_str}")

    return "\n".join(lines)


# ── Persistence ────────────────────────────────────────────────────────────────

async def store_briefing(briefing: dict) -> None:
    """Persist a briefing dict generated by Claude in chat."""
    async with write_ctx() as conn:
        conn.execute(
            """
            INSERT INTO ai_briefing
                (briefing_date, generated_at, model, training_call, training_rationale,
                 readiness_headline, coaching_note, flags, priority_metric,
                 input_tokens, output_tokens, cache_read_tokens, cost_usd)
            VALUES (today(), now(), $model, $training_call, $training_rationale,
                    $readiness_headline, $coaching_note, $flags, $priority_metric,
                    0, 0, 0, 0)
            ON CONFLICT (briefing_date) DO UPDATE SET
                generated_at = excluded.generated_at,
                model = excluded.model,
                training_call = excluded.training_call,
                training_rationale = excluded.training_rationale,
                readiness_headline = excluded.readiness_headline,
                coaching_note = excluded.coaching_note,
                flags = excluded.flags,
                priority_metric = excluded.priority_metric
            """,
            {
                "model": briefing.get("model", "claude"),
                "training_call": briefing["training_call"],
                "training_rationale": briefing.get("training_rationale", ""),
                "readiness_headline": briefing.get("readiness_headline", ""),
                "coaching_note": briefing.get("coaching_note", ""),
                "flags": json.dumps(briefing.get("flags", [])),
                "priority_metric": briefing.get("priority_metric", "none"),
            },
        )
    log.info("briefing stored — call=%s", briefing["training_call"])
