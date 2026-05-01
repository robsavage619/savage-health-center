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

### HEALTH CENTER

*A personal health OS — not a wellness app*

<br />

[![Python](https://img.shields.io/badge/Python-3.12-1e1e2e?style=flat-square&labelColor=1e1e2e&color=cba6f7)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-1e1e2e?style=flat-square&labelColor=1e1e2e&color=a6e3a1)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-1e1e2e?style=flat-square&labelColor=1e1e2e&color=89b4fa)](https://nextjs.org/)
[![Claude](https://img.shields.io/badge/Claude-Opus_4.7-1e1e2e?style=flat-square&labelColor=1e1e2e&color=f38ba8)](https://anthropic.com/)
[![DuckDB](https://img.shields.io/badge/DuckDB-1.1-1e1e2e?style=flat-square&labelColor=1e1e2e&color=fab387)](https://duckdb.org/)
[![CI](https://github.com/robsavage619/savage-health-center/actions/workflows/ci.yml/badge.svg?style=flat-square)](https://github.com/robsavage619/savage-health-center/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-1e1e2e?style=flat-square&labelColor=1e1e2e&color=a6e3a1)](LICENSE)

<br />

<!-- TODO: drop demo.gif here after recording — see images/ -->
<!-- ![Demo](images/demo.gif) -->

</div>

---

Every morning there is one question: **can I push today?**

WHOOP gives you a score. Apple Health gives you data. Your training log gives you history. None of them know your medications. None of them talk to each other. None of them tell you *why*.

SHC does. It pulls from every source, computes the metrics that actually matter — HRV deviation in σ, ACWR, composite readiness, volume progression — and hands off to Claude Opus 4.7, which knows your full clinical context, to write today's training call.

**Everything runs locally. Your data never leaves your machine.**

<br />

---

## Why it's different

<table>
<tr>
<td width="50%">

**The problem with existing tools**

- WHOOP scores your recovery but doesn't know you're on propranolol — so the HRV signal is meaningless without context
- Apple Health has everything but surfaces nothing
- Training apps don't talk to sleep data
- No tool knows all three simultaneously

</td>
<td width="50%">

**What SHC does instead**

- Single encrypted database fed by every source simultaneously
- Server-side signal fusion into one `DailyState` contract
- Clinical context (medications, labs, conditions) injected into every AI call
- One screen. One decision. Done.

</td>
</tr>
</table>

<br />

---

## Engineering highlights

| | |
|:---|:---|
| **Agentic AI** | Claude Opus 4.7 generates workout plans and readiness briefings from a multi-signal clinical context (HRV σ, ACWR, medication state, volume history). Ollama fallback for air-gapped operation with model-tier selection at runtime. |
| **Engineered signals** | HRV σ-deviation from 28d baseline, ACWR safe-zone tracking, weighted readiness composite (HRV 40% + Sleep 30% + RHR 20% + Subjective 10%, rebalanced on beta-blocker days) — all computed server-side in a single `DailyState` contract. The frontend never re-derives health logic. |
| **Local-first, encrypted** | Single embedded DuckDB file encrypted at rest. OAuth tokens and the DB encryption key live in macOS Keychain — nothing sensitive touches disk. No telemetry. No cloud. |
| **Full-stack ownership** | Python 3.12 + FastAPI backend (uv, pyright, ruff), Next.js 15 + React 19 + TypeScript frontend (Tailwind v4, TanStack Query v5, Recharts), migrations, CI, multi-source OAuth — one repo, one person. |
| **Documentation discipline** | Architecture decisions log, changelog, contributor guide, and v2 handoff doc committed alongside the code. The repo tells the story of every major choice. |

<br />

---

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

| KPI | What it shows | Threshold |
|:---|:---|:---|
| **Recovery** | WHOOP score (0–100) | ≥ 67 = green-light intensity |
| **Strain · 7d** | Cardio min ÷ 4, annualized | Target 150+ min/wk |
| **Sleep** | Last sleep duration | ≥ 7.5h green · ≥ 6.5h yellow · < 6.5h red |
| **HRV σ** | Std deviations from 28d baseline | Trend matters more than absolute |

Beta-blocker days are annotated `β-adj` on the HRV tile. A live sync-status chip flags when OAuth needs refreshing.

<br />

### Today's Plan

AI-generated by Claude Opus 4.7 with full context at inference time:

```
context sent to claude ─────────────────────────────────────────────
  readiness_tier:     green                    (computed, not raw)
  hrv_sigma_28d:      +0.6σ
  sleep_debt_7d:      -0.4h vs baseline
  volume_push_7d:     3,840 lbs               (sets × reps × weight)
  volume_pull_7d:     2,100 lbs               (imbalance flagged)
  medications:        propranolol 40mg         (shifts HR zone targets)
  last_pull_session:  2026-04-28, deadlift PR  (408 lbs)
─────────────────────────────────────────────────────────────────────
response ──────────────────────────────────────────────────────────
  Block A — Vertical Pull
    Pull-Up  4×5  @ RPE 8   ↑ +5 lbs vs last session
    Cable Row  3×8  @ RPE 7
  Block B — Bicep Accessory
    Curl  3×10  @ RPE 6
  [Push to Hevy as saved routine]
────────────────────────────────────────────────────────────────────
```

Cached per day. `?regen=true` forces a fresh call.

<br />

### Four Pillars

<table>
<tr>
<td width="25%" valign="top">

**Recovery Intelligence**

WHOOP recovery ring, 7-night HRV sparkline with ±1σ band, sigma deviation from 28d baseline. Flags multiday HRV dips and resting HR trend anomalies.

</td>
<td width="25%" valign="top">

**Sleep Architecture**

7-night stacked bar chart (total, deep, REM). Target bands: ≥ 7.5h total, 15–20% deep, 20–25% REM. Footer row shows 7d sleep debt.

</td>
<td width="25%" valign="top">

**Training Load**

ACWR (7d ÷ 28d recovery ratio) with safe-zone annotation (0.8–1.3). Weekly volume progression, monotony index, Z2 cardio minutes.

</td>
<td width="25%" valign="top">

**Readiness Composite**

Weighted fusion: HRV 40% + Sleep 30% + RHR 20% + Subjective 10%. Weights shift on beta-blocker days. Trend vs prior week.

</td>
</tr>
</table>

<br />

### Trend Intelligence

Five tabs. 90 days of context. None of it synthetic.

| Tab | What you see |
|:---|:---|
| **Recovery** | 90-day recovery + HRV time series with ±1σ band. Reference lines at 67 and 34. Monthly averages. |
| **Body** | Weight trend with 7d moving average. Recomposition signal: strength gain vs weight change ratio. |
| **Patterns** | Sleep vs recovery scatter. HRV vs recovery scatter. Visual correlation between lifestyle and next-day readiness. |
| **Insights** | Correlation cards: which factors statistically predict *your* recovery. Pearson-r with confidence ranges. Unlocks after sufficient data. |
| **Clinical** | Unified timeline: conditions, medications, lab results in a single descending-date lane. Medical context alongside training context. |

<br />

### AI Advisor `⌘K`

Full Claude chat with persistent clinical context. Knows your readiness, last 12 weeks of training, sleep debt, active medications, lab history, and goals.

```
> should I do HIIT today?
> why is my HRV trending down this week?
> write a deload week given my current load metrics
> how has my sleep quality changed since I started propranolol?
```

<br />

---

## Screenshots

<!-- Capture from running app: open dashboard → save to images/ -->
![Dashboard overview](images/dashboard-overview.png)

![Today's plan — AI-generated workout](images/today-plan.png)

![Trend intelligence — 90-day view](images/trend-intelligence.png)

<br />

---

## How it works

```
Data Sources                     Core                              Output
────────────────                 ──────────────────────────────    ──────────────────
WHOOP API ──────────┐
Apple Health XML ───┼──► ingest ──► DuckDB (encrypted) ──► FastAPI
Hevy REST API ──────┤                      │
Manual checkin ─────┘                      │
Manual cardio log                          ▼
                                   Claude Opus 4.7
                                   ├── /api/workout/generate    ──► structured session
                                   ├── /api/workout/next        ──► cached daily plan
                                   └── /api/briefing            ──► readiness narrative
                                            │
                                   Hevy API ◄── push saved routine
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

| Metric | Formula | Why |
|:---|:---|:---|
| **HRV deviation σ** | `(today − 28d avg) ÷ 28d SD` | Normalized to *your* baseline, not a population average |
| **ACWR** | `7d avg ÷ 28d avg recovery` | Safe zone 0.8–1.3; outside = injury risk signal |
| **Sleep consistency** | σ of 7-night duration | Irregular sleep is as damaging as short sleep |
| **Readiness composite** | `HRV×0.4 + Sleep×0.3 + RHR×0.2 + Subj×0.1` | Shifts weights on beta-blocker days |
| **Volume progression** | Recent 8w vs prior 8w sets/muscle | Are you actually overloading? |
| **HRmax (Tanaka)** | `208 − 0.7 × age` | Not 220 − age — Tanaka is validated for trained adults |

<br />

---

## Data sources

| Source | Integration | Status |
|:---|:---|:---|
| WHOOP | OAuth 2.0 → background sync | ✓ live |
| Apple Health | iCloud HealthAutoExport → CCDA XML | ✓ live |
| Hevy | REST API — sync in + push routines out | ✓ live |
| Manual checkin | `POST /api/checkin` | ✓ live |
| Manual cardio | `POST /api/cardio/log` | ✓ live |
| Fitbod | CSV import | P2 |

<br />

---

## Stack

```
Backend      Python 3.12 · FastAPI 0.115 · DuckDB 1.1 (embedded, encrypted)
AI           Claude Opus 4.7 · Ollama fallback (llama3.3:70b) · APScheduler
Frontend     Next.js 15 · React 19 · TypeScript · Tailwind CSS v4
UI           shadcn/ui · Recharts · TanStack Query v5 · OKLCH color space
Fonts        Orbitron (display/KPIs) · Geist Mono (data labels)
Secrets      macOS Keychain — nothing sensitive touches disk
Tooling      uv · ruff · pyright · honcho · pytest
```

<br />

### Design system

| Element | Treatment |
|:---|:---|
| **Color space** | OKLCH — perceptually uniform, no sRGB gamut clipping on wide-gamut displays |
| **Background** | `oklch(0.13 0 0)` near-black with subtle hue-shifted gradients per section |
| **Status green** | `oklch(0.72 0.18 145)` · yellow `oklch(0.78 0.15 85)` · red `oklch(0.65 0.22 20)` |
| **Cards** | Hairline borders `oklch(1 0 0 / 0.10)`, hover lift `oklch(1 0 0 / 0.025)` |
| **Charts** | Recharts with custom OKLCH tokens — no Chart.js |

<br />

---

## Quickstart

**Requires:** macOS · Python 3.12+ · Node 20+ · [`uv`](https://github.com/astral-sh/uv)

```bash
git clone https://github.com/robsavage619/savage-health-center
cd savage-health-center
make install && cp env.example .env
```

Fill in three keys:

```bash
ANTHROPIC_API_KEY=        # Claude API — workout generation + daily briefings
WHOOP_CLIENT_ID=          # WHOOP developer portal
WHOOP_CLIENT_SECRET=
```

```bash
make seed   # 90 days of synthetic data
make dev    # API :8000 · Web :3000
```

<br />

### Commands

```bash
make dev          # start everything via honcho
make seed         # populate 90d synthetic data
make reset        # nuke + reseed  (CONFIRM=1)
make doctor       # verify config, DuckDB, Ollama
make logs         # tail all log files
make lint         # ruff check + format
make typecheck    # pyright
make test         # pytest
```

<br />

### LLM modes

```bash
SHC_LLM_MODE=auto         # Claude API with Ollama fallback (default)
SHC_LLM_MODE=local_only   # air-gapped — never calls Anthropic
```

Every call is logged with token counts, cache hit/miss, and cost in USD. Daily spend capped at `ANTHROPIC_DAILY_CAP_USD`.

<br />

---

## Security & Privacy

All data is local. No telemetry. No analytics. No cloud sync.

Outbound calls: WHOOP OAuth sync, Claude API (when `SHC_LLM_MODE=auto`) — nothing else.

- DuckDB encrypted at rest (`shc auth set-db-key`)
- OAuth tokens and DB key stored in macOS Keychain, not on disk
- Session-token layer gates the dashboard against casual PHI exposure on shared machines

<br />

---

<div align="center">

[API Reference](docs/API.md) · [Changelog](CHANGELOG.md) · [Architecture Decisions](DECISIONS.md)

<br />

*Built and maintained by [Rob Savage](https://github.com/robsavage619)*

</div>
