# Changelog

All notable changes to this project. Dates are commit dates (Pacific time).

---

## 2026-04-29

### Added

- **WhoopVitals card** — Premium dark-gradient card (linear-gradient with subtle oklch blue shift) anchored to the official WHOOP wordmark SVG. Four-up KPI strip in Orbitron: Recovery score/100 with σ-colored glow, Strain as cardio min/wk, Sleep hours color-coded (≥7.5h green, ≥6.5h yellow, <6.5h red), and HRV σ deviation from 28d baseline. Live sync-status chip flags last sync time or OAuth reauth. Beta-blocker days annotated `β-adj` on HRV tile. "How to read this" footer covers all four metrics.

- **Orbitron typography system** — Consistent application of Orbitron across the entire UI: all section eyebrows (`.eyebrow`), section titles (`.shc-section-title`), metric numerals (`.metric-xl/lg/md`), tab switchers, and KPI labels. Adds `SectionTitle` and `HowToRead` components to `ui/metric.tsx`.

- **Clinical timeline** — Replaced the three-card clinical overview (conditions list, medications list, labs list) with a unified descending-date event lane. Color-coded dots by event type (medication = chart-line blue, condition = neutral, lab = positive green). Merges all event types into a single scannable clinical narrative.

- **Cardio trend KPIs** — `TrendKpi` sub-component: Orbitron number + directional delta badge comparing last 14 days vs prior 14 days. Four KPIs above the session log: cardio min/wk, avg HR, avg RPE, kcal/wk. Directional arrows and colors (positive/neutral/negative) match the same threshold system as recovery metrics.

- **Cardio table truncation** — Session log defaults to 8 most-recent rows; "Show all" toggle reveals the full history. Keeps the log form accessible without infinite scroll.

- **PulseCard in right rail** — Replaces the empty space at the top of the 320px right column with a readiness orb (Orbitron score, radial oklch glow, tier-colored), plain-language tier interpretation, and a 2-col sync-age footer for WHOOP and Hevy. Fills dead space with signal-rich content.

- **Sleep panel improvements** — Per-night rows now show `wk md` date format (e.g. "Fri 4/25"). Footer row adds 7d sleep debt in hours alongside best-night date and deep%. Interpretation copy covers target bands (7.5h, 15–20% deep, 20–25% REM, consistency < 1.0σ, debt > 5h flag).

- **Patterns pane helptext** — Added interpretation paragraph before scatter charts explaining how to read sleep-vs-recovery and HRV-vs-recovery correlations.

- **Correlation cards empty state** — Richer empty state: shows days collected, days remaining to unlock, and three actionable tips (check-in regularly, maintain consistent sleep, log cardio). When data is present, adds helptext on how to interpret Pearson-r and confidence ranges.

- **Trend Intelligence tab redesign** — Section header upgraded from `Eyebrow` to `shc-section-title`. Tab switcher replaced with a pill-style framed container (`oklch(1 0 0 / 0.025)` background, hairline border); each tab uses Orbitron uppercase with `tracking-[0.16em]`.

- **Analysis persistence and WHOOP sync counts** — Vault analysis results persist across app restarts; WHOOP background sync now logs ingested record counts per run.

- **Vault signal coverage** — New vault signals for body recomposition (strength gain vs weight delta), push/pull imbalance, and 4-week volume spikes.

### Fixed

- **Cooldown object array crash** — Workout renderer no longer crashes when the cooldown field is an object instead of an array.

- **Block label undefined crash** — Guard for undefined block labels in workout plan renderer; validates block/exercise field names before rendering.

- **DuckDB WAL path mismatch** — Prevents startup crash when WAL file path doesn't match the DB path after a directory move.

---

## 2026-04-24

### Added

- **Hevy integration — full push/pull** — Sync workouts from Hevy into DuckDB (`GET /api/hevy/sync`), refresh exercise template cache (`GET /api/hevy/sync-templates`), push AI plan as a Hevy routine (`POST /api/hevy/push-routine`). Hevy API key stored in macOS Keychain with env fallback.

- **Cardio & Sports panel** — 28-day summary card: session count, total minutes, top sport, zone-mix bar. Manual log form (sport, duration, avg HR, RPE) with hover-to-delete. Supports pickleball, cycling, rowing, ski-erg, walking, elliptical, and swimming.

- **Workout plan redesign** — Replaced flat table with `ExerciseBlock` card grid. Cards show sets×reps + weight, RPE badge, last-session history stamp with delta. Block section headers with colored accent bars. Auto-detected superset pills. Source badge (Claude Code / Claude / fallback). "Generate via Claude" and "Copy CC prompt" buttons.

- **Progression drawer** — Slide-in panel per exercise: Epley 1RM chart (est vs max lbs) over 30 sessions, full session table (date, top set, volume, RPE, est 1RM). Opens from PR rows, top-exercise rows, and plan exercise cards.

- **Beta-blocker-aware readiness** (`lib/readiness.ts`) — Single source of truth for composite readiness. Detects propranolol/metoprolol/etc. from medications list and shifts weights: HRV 20% / Sleep 40% / RHR 25% / Subj 15% vs default 40/30/20/10. Sigma-based HRV scoring replaces old saturation hack.

- **Workout AI endpoints** — `POST /api/workout/generate` (Claude Opus 4.7 with full clinical context), `DELETE /api/workout/plan`, `GET /api/training/muscle-balance`, `GET /api/training/exercise-last`, `GET /api/cardio/recent`, `POST /api/cardio/log`, `DELETE /api/cardio/log/{id}`.

- **`shc-workout` Claude Code skill** — Mode A (generate): pulls context, applies GREEN/YELLOW/RED intensity matrix, picks real exercises, POSTs validated JSON plan. Mode B (analyze): read-only prose with cited numbers. Includes skin-temp veto, sleep veto, push:pull bias, no-plyometrics rule.

- **Training context enrichment** — `build_training_context()` now includes 28d cardio mix, push:pull balance, skin temp delta, and goals block.

### Fixed

- **Hevy weight round-trip** — `lbs → kg` conversion now uses 4 decimal places instead of 2. Prevents `85 lbs → 38.56 kg → 85.01 lbs` display artifact in the Hevy mobile app.

- **Hevy `rpe` rejection** — Hevy's `POST /routines` schema rejects `rpe` on set objects. RPE is now folded into exercise notes (`"RPE 7 · Superset with previous"`).

- **Hevy `folder_id` on PUT** — `PUT /routines/{id}` rejects `folder_id`; it is now only sent on the initial `POST`.

- **Hevy list-wrapped response** — `_extract_routine_id()` now handles `{"routine": [{"id": "..."}]}` list-wrapped shape in addition to flat dict and top-level list.

- **Hevy API key from Keychain** — Key is loaded via `keyring` with `HEVY_API_KEY` env var as fallback.

- **Migration version conflict** — Renamed `0002_hevy.sql` → `0006_hevy.sql` to avoid collision with existing WHOOP migration.

---

## 2026-04-22

### Fixed

- **StrengthPanel null guards** (`41b91da`) — Guard `volume_kg` and `total_sets` fields against null before rendering; prevents chart crash when no training data is present for the selected window.

### Added

- **V2 dashboard + AI next-workout coach** (`01ad062`) — Full V2 dashboard layout with all five zones wired: Command Briefing strip, four Pillars (Recovery, Sleep, Training Load, Readiness), Trend Intelligence tabs, Right Rail, and AI Advisor chat sheet (Cmd+K). Next-workout endpoint calls Claude Sonnet 4.6 with clinical context and caches the response.

- **AI-powered next workout tab** (`94cce6b`) — Initial `next-workout.tsx` component with readiness-tier display (green/yellow/red), exercise blocks, RPE targets, warmup/cooldown sections, and clinical disclaimer notes.

---

## 2026-04-21

### Added

- **Real training, insights, and clinical data** (`9f23a8e`) — Wired production data into the dashboard: training heatmap, weekly volume, PRs, overload signal, correlation insights, clinical overview (meds, conditions, labs), and body-weight trend. All backed by live DuckDB queries.

- **Session-token auth layer** (`010bc73`) — Local PHI protection: dashboard requires a session token issued at startup. Prevents casual access to health data on shared machines.

- **P1 baseline snapshot** (`b858655`) — Committed working P1 state as the v2 baseline. Three-card layout: recovery ring, HRV trend, sleep stacked bars.

- **P1 skeleton** (`13d31b9`) — Initial project scaffold: FastAPI backend, DuckDB schema (migrations 0001–0005), WHOOP OAuth client, Apple Health CCDA XML ingest, Next.js 15 frontend with shadcn/ui, TanStack Query, Recharts, and synthetic data seeder (90 days).

---

## 2026-04-21 (project start)

- **Initial commit** (`a2f1eed`) — Repository initialised.

---

_Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are date-based (no semver) since this is a single-user tool with no public API contract._
