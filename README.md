<div align="center">

# SAVAGE HEALTH CENTER

**A personal health OS. Not a wellness app.**

Recovery · Sleep · Training · Clinical — unified, AI-coached, fully local.

</div>

---

Every morning you get one question: *can I push today?* WHOOP gives you a score. Apple Health gives you data. Your training log gives you history. None of them talk to each other, and none of them know your medications.

This does.

SHC pulls from every data source you have, computes derived metrics that matter (HRV deviation in σ, ACWR, sleep consistency, composite readiness), and hands off to Claude Sonnet 4.6 — which knows your full clinical context — to generate today's training call. Everything runs locally. Your data never leaves your machine except to sync with the APIs you already use.

---

## What it looks like

Five zones, one screen:

| Zone | What you see |
|---|---|
| **Command Briefing** | Recovery score · HRV vs 28d avg · sleep · readiness verdict |
| **Four Pillars** | Recovery Intelligence · Sleep Architecture · Training Load · Readiness Composite |
| **Trend Intelligence** | 90-day recovery, training heatmap, body metrics, correlation insights, clinical |
| **Right Rail** | Streaks · personal bests · week summary · goals |
| **AI Advisor** | `⌘K` — chat with a coach that knows your HRV, your meds, and your last 12 weeks |

---

## Stack

| | |
|---|---|
| **Backend** | Python 3.12 · FastAPI · DuckDB 1.1 (embedded, encrypted) |
| **AI** | Claude Sonnet 4.6 · Ollama fallback · APScheduler background sync |
| **Frontend** | Next.js 15 · React 19 · TypeScript |
| **UI** | Tailwind CSS v4 · OKLCH tokens · shadcn/ui · Recharts · TanStack Query v5 |
| **Secrets** | macOS Keychain — nothing sensitive touches disk |

---

## Getting started

**Prerequisites:** macOS · Python 3.12+ · Node 20+ · [`uv`](https://github.com/astral-sh/uv)

```bash
git clone <repo-url> savage-health-center
cd savage-health-center
make install
cp env.example .env
```

Open `.env` and fill in three things:

```bash
ANTHROPIC_API_KEY=          # Claude API — powers next-workout and briefings
WHOOP_CLIENT_ID=            # From your WHOOP developer app
WHOOP_CLIENT_SECRET=
```

Then:

```bash
make seed    # 90 days of synthetic data so the dashboard isn't empty
make dev     # API → :8000  ·  Web → :3000
```

Open `http://localhost:3000`. That's it.

---

## Commands

```
make dev         Start everything (honcho: API + frontend)
make seed        Populate DuckDB with 90 days synthetic data
make reset       Nuke DB and reseed            (requires CONFIRM=1)
make doctor      Check config, DuckDB, Ollama
make logs        Tail all log files
make lint        ruff check + format
make typecheck   pyright
make test        pytest
```

---

## How it works

```
WHOOP API ──────────────┐
Apple Health (iCloud) ──┼──► ingest ──► DuckDB ──► FastAPI ──► Next.js
Manual checkins ────────┘                    │
                                             └──► Claude Sonnet 4.6
                                                   ├── /api/workout/next
                                                   └── /api/briefing
```

The database is a single encrypted DuckDB file at `$DATA_DIR/shc.duckdb`. Migrations run automatically on startup. No separate database server, no Docker.

### Computed metrics

These aren't raw scores — they're derived signals:

| Metric | Formula |
|---|---|
| **HRV deviation** | `(today − 28d avg) / 28d SD` — how many σ off baseline |
| **ACWR** | 7d avg recovery ÷ 28d avg — acute:chronic ratio (safe zone 0.8–1.3) |
| **Sleep consistency** | stddev of sleep hours across 7 nights |
| **Readiness** | HRV 40% + sleep 30% + RHR 20% + subjective 10% |
| **Volume progression** | last 8 weeks vs prior 8 weeks |

### AI coaching

`GET /api/workout/next` sends Claude your readiness tier, 28-day HRV trend, recent training volume, and active medications. It returns a structured session — warmup, blocks with RPE targets, cooldown, clinical notes — cached per day. Pass `?regen=true` to force a fresh call.

`GET /api/briefing` generates the daily training call and readiness headline, also cached per day.

LLM mode is configurable:

```bash
SHC_LLM_MODE=auto        # Claude API with Ollama fallback (default)
SHC_LLM_MODE=local_only  # never call Anthropic
```

Every API call is logged with token counts, cache hit/miss, and USD cost. Spend is capped at `ANTHROPIC_DAILY_CAP_USD`.

---

## Data sources

| Source | Integration | Status |
|---|---|---|
| WHOOP | OAuth 2.0 → background sync | Live |
| Apple Health | iCloud HealthAutoExport → CCDA XML parser | Live |
| Manual checkin | `POST /api/checkin` | Live |
| Fitbod | CSV import | P2 |
| Hevy | API key | P2 |

---

## Environment variables

```bash
DATA_DIR=data                            # DuckDB + logs root

ANTHROPIC_API_KEY=
ANTHROPIC_DAILY_CAP_USD=2.00

WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=
WHOOP_REDIRECT_URI=http://127.0.0.1:8000/auth/whoop/callback

SHC_LLM_MODE=auto                        # auto | local_only
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.3:70b

HOST=127.0.0.1
PORT=8000
FRONTEND_ORIGIN=http://localhost:3000
```

OAuth tokens, the DB encryption key, and the Hevy API key live in macOS Keychain — not in `.env`.

---

## Security

All data stays local. No telemetry. The only outbound calls are to APIs you explicitly connect (WHOOP sync, Claude API, Anthropic). DuckDB is encrypted at rest via `shc auth set-db-key`. A session-token layer gates dashboard access on shared machines.

---

## Docs

- [API reference](docs/API.md) — all endpoints with request/response shapes
- [Contributing](CONTRIBUTING.md) — code style, git conventions, how to add a data source
- [Changelog](CHANGELOG.md)
