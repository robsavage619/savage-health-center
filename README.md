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

### SAVAGE HEALTH CENTER

*A personal health OS — not a wellness app*

<br />

![Python](https://img.shields.io/badge/Python-3.12-1e1e2e?style=flat-square&labelColor=1e1e2e&color=cba6f7)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-1e1e2e?style=flat-square&labelColor=1e1e2e&color=a6e3a1)
![Next.js](https://img.shields.io/badge/Next.js-15-1e1e2e?style=flat-square&labelColor=1e1e2e&color=89b4fa)
![Claude](https://img.shields.io/badge/Claude-Opus_4.7-1e1e2e?style=flat-square&labelColor=1e1e2e&color=f38ba8)
![DuckDB](https://img.shields.io/badge/DuckDB-1.1-1e1e2e?style=flat-square&labelColor=1e1e2e&color=fab387)

<br />
</div>

---

Every morning there is one question: **can I push today?**

WHOOP gives you a score. Apple Health gives you data. Your training log gives you history. None of them know your medications. None of them talk to each other. None of them tell you *why*.

SHC does. It pulls from every source, computes the metrics that actually matter — HRV deviation in σ, ACWR, composite readiness, volume progression — and hands off to Claude Opus 4.7, which knows your full clinical context, to write today's training call.

Everything runs locally. Your data never leaves your machine.

<br />

## The Dashboard

Eight zones, one screen, zero fluff.

```
┌──────────────────────────────────────────────────────────────────┐
│  ████ POWERED BY WHOOP  Recovery 74 · Strain 48min/wk           │
│        HRV +0.6σ vs baseline · Sleep 7.4h                       │
├──────────────────────────────────────────────────────────────────┤
│  COMMAND BRIEFING                                                 │
│  Recovery 74 · HRV +0.6σ · Sleep 7.4h   [ TRAIN — green ]       │
├──────────────────────────────────────────────────────────────────┤
│  TODAY'S PLAN  Green · Upper Pull · ~55 min                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                  │
│  │ Pull-Up    │  │ Cable Row  │  │ Curl       │  [Push → Hevy]   │
│  │ 4×5 185#   │  │ 3×8 135#   │  │ 3×10 45#   │  [Generate]     │
│  └────────────┘  └────────────┘  └────────────┘                  │
├────────────┬─────────────┬──────────────┬───────────────────────┤
│  RECOVERY  │  SLEEP      │  LOAD        │  READINESS            │
│  74 ██░░   │  7-night    │  ACWR 1.02   │  71 ██░░              │
│  HRV +0.6σ │  stack bars │  safe zone ✓ │  Δ+4 vs last week     │
├────────────┴─────────────┴──────────────┴───────────────────────┤
│  TREND INTELLIGENCE                                               │
│  [ Recovery ] [ Body ] [ Patterns ] [ Insights ] [ Clinical ]    │
│    90d chart   weight    sleep/rec   correlations   timeline      │
├───────────────────────────────────────┬──────────────────────────┤
│  STRENGTH  heatmap · PRs · volume     │  PULSE CARD  74 readiness│
│  CARDIO  28d mix · trend KPIs · log   │  CHECK-IN    morning feel │
└───────────────────────────────────────┤  MOMENTUM    7d vs prior  │
                    ⌘K  AI ADVISOR      └──────────────────────────┘
```

<br />

### WHOOP Signal Card

The top card is built around the official WHOOP branding and shows the four metrics that govern daily training decisions:

| KPI | What it shows |
|:---|:---|
| **Recovery** | Today's WHOOP score (0–100). ≥67 = green-light intensity. |
| **Strain · 7d** | Cardio minutes ÷ 4, annualized as min/week. Target 150+ for aerobic base. |
| **Sleep** | Last sleep duration in hours. Color-coded: ≥7.5h green, ≥6.5h yellow, <6.5h red. |
| **HRV σ** | Standard deviations from your 28d HRV baseline. Trend matters more than absolute. |

A live sync-status chip shows last sync time and flags when OAuth needs refreshing. Beta-blocker days are annotated `β-adj` on the HRV tile.

<br />

### Command Briefing

One-line verdict at the top: recovery score, HRV deviation, sleep hours, and a **TRAIN / MODERATE / REST** call. Renders in Orbitron with color-coded readiness tier so the decision is visible at a glance.

<br />

### Today's Plan

AI-generated workout built by Claude Opus 4.7 with access to:

- Current readiness tier (green / yellow / red)
- 28d HRV trend and sleep debt
- Recent volume per muscle group (push:pull balance, quad:posterior ratio)
- Active medications (propranolol detection shifts intensity targets)
- Last session per exercise (date, top set, volume)

Output: exercise blocks as cards (sets × reps × weight, RPE badge, history delta arrow), grouped into named sections (e.g. "Block A — Vertical Pull"). Supersets are auto-detected and labeled. One click pushes the routine to Hevy as a saved routine.

<br />

### Four Pillars

```
Recovery Intelligence · Sleep Architecture · Training Load · Readiness Composite
```

**Recovery Intelligence** — WHOOP recovery ring, 7-night HRV sparkline with ±1σ band, sigma deviation from 28d baseline. Annotates resting HR trend and flags multiday HRV dips.

**Sleep Architecture** — 7-night stacked bar chart (total, deep, REM). Per-night rows show date, duration, deep%, REM minutes. Footer row shows best sleep + 7d debt. Target bands: ≥7.5h total, 15–20% deep, 20–25% REM.

**Training Load** — ACWR (7d÷28d recovery ratio) with safe-zone annotation (0.8–1.3). Weekly volume progression chart. Monotony index. Z2 cardio minutes this week.

**Readiness Composite** — Weighted signal fusion: HRV 40% + Sleep 30% + RHR 20% + Subjective 10% (shifts to 20/40/25/15 on beta-blocker days). Trend vs prior week.

<br />

### Trend Intelligence (5 tabs)

**Recovery tab** — 90-day recovery score and HRV time series with ±1σ band. Reference lines at 67 and 34. Monthly average table (recovery avg, HRV avg). Helps identify structural trends rather than daily noise.

**Body tab** — Weight trend with 7d moving average, body composition metrics, and recomposition signal (strength gain vs weight change ratio).

**Patterns tab** — Sleep hours vs recovery scatter, HRV vs recovery scatter. Visual correlation between lifestyle variables and next-day readiness.

**Insights tab** — Correlation cards: which factors statistically predict your recovery. Unlocks after enough data (minimum days shown in empty state). Pearson-r with confidence ranges.

**Clinical tab** — Unified timeline merging conditions, medications, and lab results in a single descending-date lane. Color-coded by event type. Puts medical context alongside training context.

<br />

### Strength

Training heatmap (muscle group × week, volume intensity shading). Personal records table per exercise. Volume progression (recent 8w vs prior 8w). Per-exercise progression drawer: Epley 1RM chart over last 30 sessions, full session history.

<br />

### Cardio & Sports

28-day session summary: count, total minutes, top sport, zone-mix bar (Z1–Z4). Trend KPI strip comparing last 14 days vs prior 14 days: cardio min/wk, avg HR, avg RPE, kcal/wk. Manual log form for sports without auto-sync (pickleball, bike, row, ski-erg, swim, walk).

<br />

### Right Rail

**Pulse Card** — Readiness score in an Orbitron orb with radial glow, plain-language interpretation (prime for intensity / moderate / easy day only), WHOOP and Hevy sync ages in a 2-column footer.

**Check-In** — Quick morning feel (subjective score, notes). Feeds into readiness composite.

**Momentum** — Recovery avg, sleep avg, sessions: this week vs last week, with directional deltas.

<br />

### AI Advisor (`⌘K`)

Full Claude chat sheet with persistent context. Knows your readiness, last 12 weeks of training, sleep debt, active medications, lab history, and goals. Ask anything: "should I do HIIT today?", "why is my HRV trending down?", "write a deload week."

<br />

## Design System

The dashboard runs a dark, data-dense aesthetic inspired by sports science platforms and professional analytics tools.

| Element | Treatment |
|:---|:---|
| **Color space** | OKLCH — perceptually uniform, no sRGB gamut clipping |
| **Display font** | [Orbitron](https://fonts.google.com/specimen/Orbitron) — all KPI numerals, section eyebrows, tab labels |
| **Body font** | Geist Mono — tabular numerals, data labels |
| **Background** | `oklch(0.13 0 0)` near-black with subtle hue-shifted gradients |
| **Status colors** | Green `oklch(0.72 0.18 145)` · Yellow `oklch(0.78 0.15 85)` · Red `oklch(0.65 0.22 20)` |
| **Cards** | Hairline borders `oklch(1 0 0 / 0.10)`, hover lift `oklch(1 0 0 / 0.025)` |
| **Charts** | Recharts with custom OKLCH chart tokens, no chart.js |

<br />

## Stack

```
Backend     Python 3.12 · FastAPI · DuckDB 1.1 (embedded, encrypted)
AI          Claude Opus 4.7 · Ollama fallback · APScheduler
Frontend    Next.js 15 · React 19 · TypeScript
UI          Tailwind CSS v4 · OKLCH · shadcn/ui · Recharts · TanStack Query v5
Secrets     macOS Keychain — nothing sensitive touches disk
```

<br />

## Quickstart

**Requires:** macOS · Python 3.12+ · Node 20+ · [`uv`](https://github.com/astral-sh/uv)

```bash
git clone <repo-url> savage-health-center
cd savage-health-center
make install && cp env.example .env
```

Three keys to fill in:

```bash
ANTHROPIC_API_KEY=        # Claude API — next-workout + daily briefings
WHOOP_CLIENT_ID=          # From your WHOOP developer portal
WHOOP_CLIENT_SECRET=
```

```bash
make seed   # populate with 90 days of synthetic data
make dev    # API :8000 · Web :3000
```

<br />

## Commands

```bash
make dev          # start everything via honcho
make seed         # 90d synthetic data
make reset        # nuke + reseed  (CONFIRM=1)
make doctor       # check config, DuckDB, Ollama
make logs         # tail all log files
make lint         # ruff check + format
make typecheck    # pyright
make test         # pytest
```

<br />

## How it works

```
WHOOP API ──────────────┐
Apple Health (iCloud) ──┼──► ingest ──► DuckDB (encrypted) ──► FastAPI ──► Next.js
Hevy API (workouts) ────┤                      │
Manual checkins ────────┘                      │
Manual cardio log                              │
                                               ▼
                                       Claude Opus 4.7
                                       ├── /api/workout/generate  (full clinical context)
                                       ├── /api/workout/next      (cached daily)
                                       └── /api/briefing          (readiness narrative)
                                                │
                                       Hevy API ◄── push routine ──┘
```

Single encrypted DuckDB file. Migrations run at startup. No database server. No Docker.

<br />

### DailyState — single source of truth

Every component reads `/api/state/today`. Nothing is recomputed client-side.

```typescript
DailyState {
  recovery:      { score, hrv_ms, hrv_sigma, hrv_baseline_28d, rhr, hrv_deviation }
  sleep:         { last_hours, deep_pct_last, rem_min_last, consistency_sigma }
  training_load: { acwr, cardio_min_28d, cardio_z2_min_7d, weekly_volume_delta }
  readiness:     { score, tier, beta_blocker_adjusted }
  as_of:         ISO timestamp
}
```

<br />

### Computed metrics

Raw scores are noise. These are signals:

| Metric | Definition |
|:---|:---|
| **HRV deviation (σ)** | `(today − 28d avg) ÷ 28d SD` — standard deviations from your own baseline |
| **ACWR** | 7d avg ÷ 28d avg recovery — acute:chronic ratio, safe zone 0.8–1.3 |
| **Sleep consistency** | σ of sleep hours across 7 nights — lower is better |
| **Readiness composite** | HRV 40% + Sleep 30% + RHR 20% + Subjective 10% (shifts on beta-blocker) |
| **Volume progression** | Recent 8w vs prior 8w sets per muscle group — are you actually overloading? |
| **HRmax (Tanaka)** | `208 − 0.7 × age` — not the generic 220 − age |

<br />

### AI coaching

`/api/workout/next` sends Claude your readiness tier, 28d HRV trend, recent training volume per muscle group, push:pull balance, and active medications. Back comes a structured session: warmup → blocks with RPE targets → cooldown → clinical notes. Cached per day; `?regen=true` forces a fresh call.

`/api/briefing` does the same for your daily training call and readiness headline.

```bash
SHC_LLM_MODE=auto         # Claude API with Ollama fallback (default)
SHC_LLM_MODE=local_only   # air-gapped — never calls Anthropic
```

Every call is logged with token counts, cache hit/miss, and cost in USD. Daily spend is capped at `ANTHROPIC_DAILY_CAP_USD`.

<br />

## Data sources

| Source | Method | |
|:---|:---|:---|
| WHOOP | OAuth 2.0 → background sync | ✓ live |
| Apple Health | iCloud HealthAutoExport → CCDA XML | ✓ live |
| Hevy | REST API (sync in + push routines out) | ✓ live |
| Manual checkin | `POST /api/checkin` | ✓ live |
| Manual cardio log | `POST /api/cardio/log` | ✓ live |
| Fitbod | CSV import | — P2 |

<br />

## Configuration

```bash
# Storage
DATA_DIR=data

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_DAILY_CAP_USD=2.00

# WHOOP
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=
WHOOP_REDIRECT_URI=http://127.0.0.1:8000/auth/whoop/callback

# LLM
SHC_LLM_MODE=auto
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.3:70b

# Server
HOST=127.0.0.1
PORT=8000
FRONTEND_ORIGIN=http://localhost:3000
```

> OAuth tokens, DB encryption key, and Hevy API key live in macOS Keychain — not here.

<br />

## Security

All data is local. No telemetry. Outbound calls: WHOOP sync, Claude API — nothing else. DuckDB is encrypted at rest (`shc auth set-db-key`). A session-token layer gates the dashboard against casual PHI exposure on shared machines.

<br />

---

<div align="center">

[API Reference](docs/API.md) · [Changelog](CHANGELOG.md)

</div>
