<div align="center">
<br />

```
███████╗ █████╗ ██╗   ██╗ █████╗  ██████╗ ███████╗
██╔════╝██╔══██╗██║   ██║██╔══██╗██╔════╝ ██╔════╝
███████╗███████║██║   ██║███████║██║  ███╗█████╗
╚════██║██╔══██║╚██╗ ██╔╝██╔══██║██║   ██║██╔══╝
███████║██║  ██║ ╚████╔╝ ██║  ██║╚██████╔╝███████╗
╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
```

### SAVAGE LABS

*A personal health OS — not a wellness app*

<br />

[![Python](https://img.shields.io/badge/Python-3.12-1e1e2e?style=flat-square&labelColor=1e1e2e&color=cba6f7)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-1e1e2e?style=flat-square&labelColor=1e1e2e&color=a6e3a1)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-1e1e2e?style=flat-square&labelColor=1e1e2e&color=89b4fa)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-1e1e2e?style=flat-square&labelColor=1e1e2e&color=74c7ec)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-1e1e2e?style=flat-square&labelColor=1e1e2e&color=89dceb)](https://www.typescriptlang.org/)
[![Claude](https://img.shields.io/badge/Claude-Opus_4.7-1e1e2e?style=flat-square&labelColor=1e1e2e&color=f5c2e7)](https://anthropic.com/)
[![DuckDB](https://img.shields.io/badge/DuckDB-1.1-1e1e2e?style=flat-square&labelColor=1e1e2e&color=fab387)](https://duckdb.org/)
[![License](https://img.shields.io/badge/License-MIT-1e1e2e?style=flat-square&labelColor=1e1e2e&color=a6e3a1)](LICENSE)

</div>

---

## The Problem

Consumer health tools are siloed by design — WHOOP scores your recovery but knows nothing about your medications. Apple Health collects thousands of data points that never inform your training. Workout trackers schedule sessions without knowing you slept five hours. No tool in the market fuses all three signals into a single coherent decision.

Savage Labs is the system I built to fix that for myself.

It ingests every available data stream — biometric wearables, workout logs, clinical labs, self-reported check-ins — fuses them server-side into a typed, versioned health contract, and runs that contract through a Claude Opus 4.7 reasoning layer that understands my medication history, adjusts intensity recommendations accordingly, and delivers a single daily readiness decision.

Everything is local. Everything is encrypted. Nothing leaves my machine.

---

## What Makes This Non-Trivial

This isn't a CRUD app wrapping a few API calls. The engineering decisions that matter:

**Signal fusion over raw display.** Most dashboards surface raw numbers — today's HRV, last night's sleep. Savage Labs computes *derived* signals: HRV σ-deviation relative to a 28-day medication-adjusted baseline, true Gabbett ACWR from composite load (wearable strain + strength tonnage), a weighted readiness composite that shifts its own weights based on whether a beta-blocker was taken. Raw numbers require interpretation. Derived signals make the decision.

**Clinical context in every LLM call.** The briefing and workout planner don't call Claude with a health snapshot. They call Claude with a health snapshot *plus* active medications with dosing schedules, current diagnoses, recent lab results with reference ranges, and computed gates encoding hard constraints the model must respect. This is what separates a wellness chatbot from a medically-aware advisor.

**Deterministic gates below the LLM.** Claude generates the plan. `validate_plan()` enforces it. If the model produces a high-intensity leg session when the gates say legs are under 48h of rest, the plan is rejected and the model is called again — not patched, not warned, rejected. The LLM layer is for reasoning; the gate layer is for correctness.

**One source of truth, computed once.** `DailyState` is computed server-side at request time via `compute_daily_state()` and consumed by every downstream consumer — the dashboard, the briefing system, the workout planner. No component recomputes what another already owns. Adding a metric requires one edit to one dataclass.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                            │
│  WHOOP OAuth  │  Apple Health XML  │  Hevy API  │  Check-in    │
└───────┬───────┴────────┬───────────┴──────┬─────┴──────┬───────┘
        │                │                  │            │
        ▼                ▼                  ▼            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INGESTION LAYER                              │
│   OAuth token refresh  │  CCDA/lxml XML parse  │  REST client  │
│   APScheduler jobs     │  Content-hash dedup   │  Pydantic DTOs│
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DuckDB (encrypted)                        │
│  measurements  │  workouts  │  workout_sets  │  sleep           │
│  recovery      │  cardio    │  daily_checkin │  medications     │
│  conditions    │  labs      │  working_weights│  workout_plans  │
│                                                                 │
│  Views: v_hrv_baseline_28d, v_session_load, v_daily_load       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      METRICS ENGINE                             │
│                  compute_daily_state()                          │
│                                                                 │
│  HRV σ-deviation  │  True ACWR  │  Sleep composite             │
│  Readiness score  │  Gates      │  Epley e1RM                  │
│  Push:pull ratio  │  Zone calc  │  Regression detection        │
└──────────┬────────────────────────────────┬─────────────────────┘
           │                                │
           ▼                                ▼
┌──────────────────────┐      ┌─────────────────────────────────┐
│    FastAPI REST       │      │         AI LAYER                │
│    50+ endpoints      │      │                                 │
│                       │      │  build_daily_context()          │
│  /api/state/today     │      │  build_training_context()       │
│  /api/workout/generate│      │  build_clinical_context()       │
│  /api/chat            │      │                                 │
│  /api/briefing        │      │  Claude Opus 4.7                │
│  /api/insights        │      │  → validate_plan()              │
│  /api/hevy/push       │      │  → Ollama fallback (air-gapped) │
└──────────┬────────────┘      └─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js 15 + React 19                        │
│                                                                 │
│  TanStack Query v5  │  Recharts  │  Tailwind v4 (OKLCH)        │
│  shadcn/ui          │  Motion    │  Orbitron + Geist fonts      │
│                                                                 │
│  Command Briefing  │  Four Pillars  │  Trend Intelligence       │
│  Workout Planner   │  AI Advisor    │  Clinical Overview        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Engineering Highlights

### 1. `DailyState` — The Health Contract

Every metric the system produces flows through a single typed dataclass computed once per day:

```python
@dataclass
class DailyState:
    as_of: str
    recovery: RecoveryMetrics      # WHOOP score, HRV ms, RHR, skin temp
    sleep: SleepMetrics            # duration, deep%, REM%, SpO2, debt
    training_load: TrainingLoadMetrics  # ACWR, acute/chronic, muscle group rest
    checkin: CheckinMetrics        # energy, stress, soreness, propranolol flag
    readiness: ReadinessSnapshot   # composite score, tier, component weights
    gates: AutoRegGates            # deterministic intensity constraints
    freshness: DataFreshness       # staleness flags per source
```

The frontend reads `/api/state/today`. The LLM briefing injects it as context. The workout planner extracts gates from it. One computation, N consumers, zero drift.

### 2. HRV σ-Deviation

Raw HRV in milliseconds is nearly useless for day-to-day decisions — population baselines don't account for medications, training phase, or individual physiology. The system computes a 28-day rolling mean and standard deviation via a materialized view, then expresses today's value as a σ-deviation:

```
hrv_sigma = (today_hrv_ms − 28d_mean) / 28d_stdev
subscore = clamp(50 + sigma × 25, 0, 100)
```

σ = 0 → baseline (score 50). σ = +2 → peak recovery (score 100). σ = −2 → suppressed (score 0). This makes the signal medication-invariant: SSRIs and beta-blockers shift the baseline, not the deviation. Two athletes with different HRV baselines get meaningful, comparable readiness signals.

### 3. True Gabbett ACWR

Most training load models count session count or subjective RPE. This system computes the true Gabbett acute:chronic workload ratio from a composite load that fuses WHOOP strain (cardiovascular load) with Hevy training tonnage (mechanical load):

```
composite_load_day = whoop_strain + (hevy_tonnes × 5000)

acute_7d   = mean(composite_load, last 7 days)
chronic_28d = mean(composite_load, last 28 days)
acwr        = acute_7d / chronic_28d
```

The safe zone is 0.8–1.3. ACWR > 1.3 triggers a volume reduction gate. ACWR > 1.5 mandates rest. This runs as a DuckDB view (`v_daily_load`) refreshed on every ingestion cycle.

### 4. Weighted Readiness with Beta-Blocker Adaptation

The readiness composite isn't static. It shifts its own weight vector based on whether a beta-blocker was detected:

| Signal | Default | Beta-Blocker Day |
|---|---|---|
| HRV σ | 40% | 20% — suppressed, less reliable |
| Sleep | 30% | 40% — becomes primary indicator |
| RHR | 20% | 25% — relative elevation still meaningful |
| Subjective | 10% | 15% |

Detection is dual-gated: the medications table must have an active propranolol entry *and* the morning check-in must have `propranolol_taken = true`. Both are required to shift the weights. This prevents phantom adjustments from stale medication records.

Tier thresholds: ≥67 → GREEN (full intensity), 34–66 → YELLOW (moderate), <34 → RED (rest only).

### 5. Auto-Regulation Gate Engine

`AutoRegGates` encodes 13 hard constraints derived from physiology literature and personal history. These are not LLM suggestions — they're deterministic rules that the workout planner enforces after generation:

```python
@dataclass
class AutoRegGates:
    max_intensity: Literal["high", "moderate", "low", "rest"]
    forbid_muscle_groups: list[str]       # e.g. ["legs"] if <48h rest
    deload_required: bool
    deload_reason: str | None
    hr_zone_shift_bpm: int               # propranolol: -20
    kcal_multiplier: float               # propranolol: 1.25
    e1rm_regression_4wk_pct: float | None
    reasons: list[str]                   # human-readable rule trace
```

Selected gate logic:

- **ACWR > 1.5** → `max_intensity = "rest"` (overload threshold)
- **Skin temp Δ ≥ 0.5°C** → Z2 only (possible illness or infection)
- **Muscle group < 48h** (72h for compound leg movements) → group forbidden
- **Compound soreness** (≥2 muscles at severity 2) → cap to moderate
- **e1RM regression > 3% over 4 weeks** → deload required
- **Propranolol dosed** → HR zones shift −20 bpm, caloric estimates ×1.25

If the LLM-generated plan violates any gate, `validate_plan()` rejects it and triggers a re-call with the gate violations appended to the prompt. The LLM never has unchecked authority over the training prescription.

### 6. Clinical Context Injection

Every Claude invocation (chat, briefing, workout planning) includes a structured clinical context block built from live database state:

```
MEDICATIONS (active)
• Propranolol 10mg as-needed — since 2024-06-01
• Sertraline 100mg daily — since 2023-03-15
...

CONDITIONS
• Generalized Anxiety Disorder (active, onset 2019)
• Obstructive Sleep Apnea (managed, onset 2022)
...

RECENT LABS (last 20, with ref ranges)
• Testosterone total: 612 ng/dL [ref 300–1000] — 2025-11-14
• Ferritin: 28 ng/mL [ref 12–300] — 2025-11-14
...
```

The HEALTH_SYSTEM prompt encodes drug-class interpretation rules: SSRIs suppress HRV baseline independently of fitness, beta-blockers require zone-shift for accurate cardio prescription, inhaled corticosteroids flag for metabolic context. The model doesn't need to know general pharmacology from training data — the system tells it what's relevant for this athlete today.

### 7. Epley e1RM Tracking & Regression Detection

Every strength set is stored with weight and rep count. The system computes an estimated 1RM via the Epley formula for every working set:

```
e1RM = weight_kg × (1 + reps / 30)
```

Over time, this builds a progression curve per exercise. A 4-week regression detector compares the top 50th percentile of e1RM over the most recent 56 days against the prior 56 days:

```
regression_pct = (mean(e1RM, days 0–27) − mean(e1RM, days 28–55)) / mean(e1RM, days 28–55)
```

If regression exceeds 3%, `deload_required = True` is injected into gates. The system detects accumulating fatigue before injury does.

### 8. Multi-Source Ingestion with Content-Hash Deduplication

Four independent data pipelines converge into the same DuckDB tables:

| Source | Method | Parser |
|---|---|---|
| **WHOOP** | OAuth 2.0 + APScheduler (60 min) | async HTTP client, token refresh on 401 |
| **Apple Health** | iCloud HealthAutoExport → CCDA XML | lxml + type-router to correct table |
| **Hevy** | REST API + push routine export | async client, set-level granularity |
| **Manual** | FastAPI POST endpoints | Pydantic v2 validation |

Every ingested record is fingerprinted:

```python
content_hash = hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest()
```

Upserts key on `(source, external_id, content_hash)`. Retries are idempotent. Sync is additive, never destructive.

OAuth tokens (WHOOP, Hevy) never touch disk — stored in and retrieved from macOS Keychain via `keyring`. The DuckDB file itself is encrypted at rest with a key fetched from Keychain at startup.

### 9. HR Zone Calculation with Medication Adjustment

HRmax uses the Tanaka formula (validated for trained adults 30–60, lower error than Fox 220−age):

```
HRmax = 208 − (0.7 × age)
```

Five zones are computed as percentages of HRmax and rendered in the cardio panel. On beta-blocker days, the gate engine injects a −20 bpm shift before zone calculation:

```
adjusted_HRmax = HRmax − hr_zone_shift_bpm   # hr_zone_shift_bpm = -20
```

Without this, propranolol would make every cardio session appear to be in a higher zone than it actually is. The shift ensures the caloric and physiological interpretation of the session is accurate.

---

## Data Sources

| Source | Protocol | What It Provides |
|---|---|---|
| **WHOOP 4.0** | OAuth 2.0, background sync every 60 min | Recovery 0–100, HRV (ms), RHR (bpm), strain, sleep stages, SpO2, skin temp |
| **Apple Health** | iCloud HealthAutoExport → CCDA XML | Steps, active energy, HR, HRV, sleep, blood pressure, body weight, blood glucose, temp |
| **Hevy** | REST API + routine push export | Exercises, sets, reps, weight (kg), RPE, timestamps |
| **Manual check-in** | Morning form via dashboard | Energy, stress, motivation, sleep quality (1–10), propranolol flag, body weight, muscle soreness by group |
| **Manual cardio log** | Dashboard form | Sport, duration (min), average HR, RPE |
| **Clinical data** | Dashboard forms | Active medications (name, dose, frequency, onset), diagnoses, lab results with reference ranges |

---

## Stack

### Backend

| Layer | Technology |
|---|---|
| Language | Python 3.12 |
| Framework | FastAPI 0.115 (async, OpenAPI auto-docs) |
| Database | DuckDB 1.1 (embedded, encrypted at rest, 14 migrations) |
| Background jobs | APScheduler 3.10 |
| HTTP client | httpx 0.28 (async) |
| XML parsing | lxml 5 (Apple Health CCDA) |
| Credentials | macOS Keychain via `keyring` |
| AI | Anthropic SDK 0.40 (Claude Opus 4.7) + OpenAI client (Ollama fallback) |
| Validation | Pydantic v2 |
| Packaging | uv + pyproject.toml |
| Lint / types | ruff + pyright (basic mode) |

### Frontend

| Layer | Technology |
|---|---|
| Framework | Next.js 15 + React 19 |
| Language | TypeScript 5 (strict mode) |
| Styling | Tailwind CSS v4 — OKLCH color space throughout |
| Data fetching | TanStack Query v5 |
| Charts | Recharts 2.15 with custom OKLCH tokens |
| UI primitives | shadcn/ui (Radix UI) |
| Icons | Lucide React |
| Animations | Motion 12.38 |
| Fonts | Orbitron 900 (display/KPIs), Geist Sans (body), Geist Mono (data) |

### Infrastructure

- **Process management:** Honcho (`Procfile`) — API on `:8000`, frontend on `:3000`
- **CI:** GitHub Actions — ruff lint, pyright typecheck, pytest on every push to main
- **Dev tooling:** `make install / dev / seed / reset / doctor / lint / test`

---

## Dashboard

The dashboard is a single-page React application structured around eight discrete zones:

### Command Briefing

The top-of-page decision card. Displays today's readiness tier (GREEN / YELLOW / RED) with the composite score, the three primary signals that drove the score (HRV σ, sleep quality, ACWR), and a one-paragraph Claude-generated narrative synthesizing all signals into a human-readable recommendation. This is the one card a user needs to see before deciding what to do today.

### Biometric HUD

A persistent header strip displaying live sync-status badges for WHOOP and Hevy, the current date, and real-time wearable vitals (recovery score, HRV, RHR, strain). Updates via polling; shows data age and source freshness.

### Four Pillars

**Recovery Intelligence** — WHOOP recovery ring with 7-night HRV sparkline and ±1σ band. The band is meaningful: points outside it are colored red or green to flag anomalous nights at a glance.

**Sleep Architecture** — Stacked bar chart across 7 nights (total / deep / REM), sleep debt accumulator (hours below 7.5h target over trailing 7 nights), and per-night SpO2 min. Weighted for OSA context (deep% and SpO2 weighted higher than raw duration).

**Training Load** — ACWR trend with safe-zone band (0.8–1.3), weekly volume by muscle group, and push:pull ratio with imbalance flag. Shows monotony index (day-to-day load variance) and acute load spike detector.

**Readiness Composite** — The score and its component breakdown, with visual indication of which weights are in effect (default vs beta-blocker-adjusted). Shows the five gate reasons in natural language: *"Legs under 48h rest — skipping lower body"*, *"Propranolol taken — HR zones adjusted −20 bpm"*.

### Today's Workout Plan

AI-generated training session using Claude Opus 4.7 with the full `DailyState` + clinical context injected. Plan is structured as blocks (warm-up / main / accessory) with exercises, prescribed sets × reps, target weight, RPE, and coaching notes. Cached per day; `?regen=true` forces a fresh call. Includes a "Push to Hevy" button that exports the plan as a live Hevy routine via the REST API.

### Trend Intelligence

Five-tab deep-dive panel:

| Tab | Content |
|---|---|
| **Recovery** | 90-day rolling HRV, recovery score, RHR time series with 28d moving average |
| **Body** | Weight trend with 4-week regression line, target range band, Apple Health sync indicator |
| **Patterns** | Scatter plots: sleep duration vs recovery score, HRV vs readiness — Pearson-r with confidence range per plot |
| **Insights** | Computed correlation cards (sleep→recovery, HRV→recovery, ACWR→injury risk) — unlocks after 7 days of data |
| **Clinical** | Unified event timeline of medications (start/stop), diagnoses (onset/remission), labs (flagged abnormal in red) |

### Right Rail

320px persistent sidebar: readiness orb (animated, tier-keyed color), momentum badge (7-day vs prior period Δ), and morning check-in form (energy, stress, motivation, sleep quality, propranolol flag, body weight, per-muscle soreness via an interactive anatomical body diagram).

### AI Advisor

Full Claude chat panel (Cmd+K to toggle). Every message includes the full `build_daily_context()` block — the model always knows today's DailyState, active medications, diagnoses, recent labs, training history, and current gates. Context is injected per-message, not per-session, so stale context is never an issue.

### Ambient Layer

Background hue shifts with readiness tier (deep green tint → green, neutral → yellow, deep red tint → red) via a full-page gradient component keyed to the readiness score. Subtle but immediately communicates system state without reading a number.

---

## AI Integration

### Briefing System

`shc/ai/briefing.py` builds two context blocks per call:

**`build_daily_context()`** injects: DailyState (all computed metrics), 28-day cardio composition (Z2 vs threshold vs VO2max minutes), push:pull imbalance direction, skin-temp delta from baseline, active medications with dosing and onset, active conditions, recent labs with reference ranges, training history (recent PRs, volume trend, last session per muscle group), and active gate reasons.

**`build_clinical_context()`** structures the clinical data as a dedicated markdown block — medications, conditions, labs — that appears early in the system prompt where it's most likely to influence model behavior.

**`HEALTH_SYSTEM` prompt** encodes drug-class interpretation rules that persist across all calls:
- Beta-blockers lower resting HR and suppress HRV — don't flag low HRV as alarming on dosed days; shift HR zone thresholds
- SSRIs blunt HRV independently of fitness — treat low HRV baseline as expected, focus on relative deviation
- Inhaled corticosteroids — flag for potential metabolic context

### Workout Planner

`shc/ai/workout_planner.py` calls Claude Opus 4.7 with:

```
SYSTEM: HEALTH_SYSTEM + gate enforcement rules
USER:   build_training_context() → structured JSON context
        → readiness tier + score
        → HRV σ, sleep quality, ACWR
        → volume push/pull/legs 28d
        → last session per muscle group (hours ago)
        → active medications
        → gates (max_intensity, forbid_muscle_groups, zone shifts)
        → session goals (duration target, focus areas)
```

The model returns structured JSON (blocks with exercises, sets, reps, weight, RPE, notes). `validate_plan()` checks every field against gates and either accepts or rejects + re-calls. The response is cached for 24h.

### Obsidian Vault — Retrieval-Augmented Training Intelligence

The system's third AI input (alongside live biometrics and clinical context) is a personal exercise science knowledge base built in Obsidian and stored at `~/Vault/savage_vault/wiki/`. Every workout plan and daily briefing is grounded in this vault — not in the model's general training knowledge.

**Why a personal vault over general LLM knowledge?** LLMs know exercise science in aggregate. The vault encodes *specific protocol decisions* — which exercise selection framework this athlete follows, what rest intervals are calibrated for this training phase, which meta-analyses are trusted over which guidelines. The model is told which evidence base to apply, not left to synthesize one from training data.

#### Signal-Ranked Note Retrieval

`load_vault_research()` doesn't pass all notes to every call. It selects the top 4 most-relevant notes based on today's health signals:

```python
# Signals derived from DailyState
signals = {
    "hrv_anomaly"         # HRV σ-deviation < -1.0
    "high_acwr"           # ACWR > 1.3
    "deload"              # gates.deload_required = True
    "illness"             # checkin.illness_flag = True
    "poor_sleep"          # last night < 6h
    "push_pull_imbalance" # 28d ratio > 1.2 or < 0.8
    "volume_spike"        # 4-week volume Δ > 40%
    "recomposition"       # always active (primary goal)
    "exercise_selection"  # always active
}
```

Each vault note carries YAML frontmatter tags. The retriever scores every note by matching its tags against active signals — `+2` per specific signal match, `+1` for default — then returns the top 4 by score. A note on overtraining and deload protocols doesn't compete with a rest-interval note for a normal training day; it wins automatically on a high-ACWR day.

```yaml
# Example: overtraining-and-deload.md frontmatter
---
tags: [overtraining, deload, hrv, recovery, acwr]
---
```

On a day where ACWR = 1.4 and HRV σ = −1.8, this note scores +6 (`overtraining → deload +2, hrv → hrv_anomaly +2, acwr → high_acwr +2`) and surfaces at the top of the context block.

#### Pinned Exercise Science Foundation

Six notes load unconditionally on every workout generation call, independent of signal scoring. They never compete with situational notes:

```
exercise-selection-strength.md        — movement pattern selection rules
exercise-selection-hypertrophy.md     — muscle group prioritization
exercise-order-strength.md            — compound-before-isolation ordering
schoenfeld-2010-hypertrophy-mechanisms.md — mechanical tension, metabolic stress, damage
rest-interval-hypertrophy.md          — optimal inter-set rest for hypertrophy
rest-interval-strength.md             — optimal inter-set rest for strength
```

These form a stable foundation of programming principles that every generated plan must respect, regardless of what state-driven notes were also retrieved.

#### Section Extraction — Only What the Model Needs

Raw vault notes contain literature review, citations, methodology, caveats. The retriever strips everything except sections the model can act on:

```
## Summary          → high-level principle
## Prescription     → actionable protocol
## Key Claims       → evidence anchors
## Practical Takeaways → direct application
## Exercise Selection Rules → selection logic
```

A 3,000-word note on hypertrophy mechanisms is condensed to the 400-word prescription block. This keeps the context window efficient and forces the model to reason from conclusions rather than re-deriving them from literature.

#### Vault Insights — Required Plan Artifact

Every generated workout plan must include a `vault_insights` array. The backend validates this before accepting the plan:

```python
if not plan.get("vault_insights"):
    raise ValueError("vault_insights is empty — must cite research")
```

The frontend renders these as a distinct section beneath the workout blocks, attributed with the Obsidian logo:

```
┌─ FROM YOUR VAULT ─────────────────────────────────────────┐
│  ◈  · Rest 90–120s between compound sets per              │
│       rest-interval-strength.md                           │
│     · Upper pull emphasis applied — push:pull at 1.35     │
│       per exercise-selection-hypertrophy.md               │
│     · Volume capped — ACWR at 1.38, within 10% of         │
│       deload threshold per overtraining-and-deload.md     │
└───────────────────────────────────────────────────────────┘
```

This creates an auditable chain from plan decision → vault note → evidence. The model can't silently ignore a retrieved note — it has to either apply it or explicitly not cite it.

#### Full-Text Vault Search API

Two endpoints expose the vault to the frontend:

```
GET /api/vault/search?q=<terms>&limit=10   — full-text regex search, 4-line excerpts per match
GET /api/vault/notes?subdir=<dir>          — list notes with metadata
```

The search endpoint ranks results by match density and returns up to 3 excerpts per file. This powers the AI Advisor chat — when the user asks about a specific protocol, the advisor can cite exact vault notes rather than general knowledge.

#### Architecture: Read-Only, No Sync

The vault is strictly input. No note is ever created, modified, or deleted by the system. Obsidian remains the editor; the health platform is the consumer. This separation preserves the integrity of the knowledge base — the platform can't corrupt a note by writing back to it after a workout, and the researcher's curation decisions are never overridden.

```
Obsidian (editor) → ~/Vault/savage_vault/wiki/*.md → load_vault_research() → Claude context
                                                   → /api/vault/search → AI Advisor
```

### Air-Gapped Fallback

`SHC_LLM_MODE=local_only` routes all LLM calls to a local Ollama instance (`llama3.3:70b` by default). Full clinical context injection is preserved. This allows the system to function offline with no data leaving the machine, at reduced reasoning quality.

### Cost Management

A `ANTHROPIC_DAILY_CAP_USD` environment variable (default `$2.00`) limits daily Claude API spend. All calls log token usage and cost to `data/logs/`. The `make doctor` command reports current-day spend and remaining budget.

---

## Data Model

### Core Tables

```sql
measurements        -- Apple Health time-series (metric, ts, value, unit, content_hash)
workouts            -- WHOOP + Hevy sessions (strain, HR, kcal, kind)
workout_sets        -- Strength sets (exercise, reps, weight_kg, rpe, is_warmup)
sleep               -- Multi-source (stages_json, spo2_avg, hrv, rhr, night_date)
recovery            -- WHOOP (date, score, hrv, rhr, skin_temp)
cardio_sessions     -- Manual + integrations (modality, duration, avg_hr, rpe, zones)
working_weights     -- Current e1RM per exercise (updated per session)
workout_plans       -- AI-generated plans (plan_json, source, date)
workout_retrospectives  -- Post-workout summaries (completion_pct, overload_flag, vault_insights)
plan_adherence      -- Prescription vs execution (avg_rpe_actual vs target)
daily_checkin       -- Morning survey (energy, stress, soreness, propranolol, body_weight)
medications         -- Active medications with audit trail (valid_to for history)
conditions          -- Diagnoses (status, onset, valid_to)
labs                -- Lab results (value, ref_low/high, panel, is_abnormal, collected_at)
schema_version      -- Migration tracking (14 applied)
```

### Materialized Views

```sql
v_hrv_baseline_28d      -- Rolling 28d HRV mean and SD per date (for σ-deviation)
v_session_load          -- Per-day load from WHOOP strain + Hevy volume
v_daily_load            -- Composite load — true Gabbett ACWR denominator
workout_sets_dedup      -- Deduped sets (handles Hevy sync collisions on retry)
```

---

## Design System

The frontend uses OKLCH (Oklab Lightness-Chroma-Hue) throughout — a perceptually uniform color space that guarantees consistent luminance across all hue angles. This means status green, yellow, and red at the same lightness value look equally bright to the human eye, unlike sRGB where greens appear brighter and reds appear darker at the same hex value.

**Status palette:**
```
Green  oklch(0.72 0.18 145)   — ready, push hard
Yellow oklch(0.78 0.15  85)   — moderate, proceed with caution
Red    oklch(0.65 0.22  20)   — rest, don't train
```

**Surface palette:**
```
Background  oklch(0.13 0 0)              — near-black
Card border oklch(1 0 0 / 0.10)         — hairline white
Card hover  oklch(1 0 0 / 0.025)        — subtle lift
```

**Typography:**
- `Orbitron 900` — section eyebrows, KPI numbers, readiness tier labels
- `Geist Sans` — all body copy and UI text
- `Geist Mono` — tabular data, timestamps, metric values in tables

The ambient background component shifts hue toward the readiness tier color — green tint at high readiness, red tint at low — using a full-page gradient keyed to the composite score. It's subtle enough to be ambient, visible enough to communicate system state before a number is read.

---

## Security & Privacy

- **No cloud storage.** All data stays on-device. No third-party analytics, no telemetry, no data sharing.
- **Encrypted database.** DuckDB file is encrypted at rest with a key stored in macOS Keychain. `PRAGMA key` is set at connection time; the file is unreadable without it.
- **Keychain-only credentials.** WHOOP OAuth tokens and Hevy API keys are stored in and retrieved from macOS Keychain. No plain-text secrets on disk.
- **Session-token auth.** The FastAPI backend requires a session token for all endpoints. Not exposed to the internet — localhost only.
- **Content-hash deduplication.** Ingestion is idempotent. Retrying a sync cannot double-count data.

---

## Quickstart

**Prerequisites:** Python 3.12+, Node 20+, [uv](https://github.com/astral-sh/uv), macOS (Keychain required)

```bash
git clone https://github.com/robsavage/savage-health-center
cd savage-health-center

make install          # uv sync --dev + npm install

cp env.example .env
# Fill three required values:
# ANTHROPIC_API_KEY   — from console.anthropic.com
# WHOOP_CLIENT_ID     — from developer.whoop.com
# WHOOP_CLIENT_SECRET — from developer.whoop.com

make seed             # 90 days of synthetic data, runs migrations
make dev              # FastAPI :8000 + Next.js :3000
```

### Commands

| Command | Description |
|---|---|
| `make dev` | Start API + frontend via Honcho |
| `make seed` | Seed 90 days of synthetic data |
| `make reset` | Drop and rebuild database (requires `CONFIRM=1`) |
| `make doctor` | Verify config, DuckDB health, Ollama status, daily AI spend |
| `make logs` | Tail all service logs |
| `make lint` | Run ruff |
| `make typecheck` | Run pyright |
| `make test` | Run pytest suite |

### LLM Modes

```bash
SHC_LLM_MODE=auto        # Claude Opus 4.7 with Ollama fallback (default)
SHC_LLM_MODE=local_only  # Ollama only — air-gapped, no Anthropic calls
```

---

## License

MIT. Built for personal use — see [LICENSE](LICENSE).

---

<div align="center">

*Built by Rob Savage — senior software engineer, FinOps architect, and one person who wanted a health system that understood his whole picture.*

</div>
