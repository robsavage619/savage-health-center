"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CardioSession } from "@/lib/api";
import { Eyebrow } from "@/components/ui/metric";

const MODALITY_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  tennis: "Tennis",
  walk: "Walk",
  run: "Run",
  bike: "Bike",
  hike: "Hike",
  swim: "Swim",
  yoga: "Yoga",
  other: "Other",
};

const MODALITY_ICON: Record<string, string> = {
  pickleball: "🏓",
  tennis: "🎾",
  walk: "🚶",
  run: "🏃",
  bike: "🚴",
  hike: "🥾",
  swim: "🏊",
  yoga: "🧘",
  other: "•",
};

function modalityKey(kind: string): string {
  const k = kind.toLowerCase();
  for (const m of Object.keys(MODALITY_LABEL)) {
    if (k.includes(m)) return m;
  }
  return "other";
}

function rpeColor(rpe: number | null | undefined): string {
  if (rpe == null) return "var(--text-faint)";
  if (rpe >= 8) return "var(--negative)";
  if (rpe >= 6) return "var(--neutral)";
  return "var(--positive)";
}

// HR zones based on age 39 max ≈ 181. Could be personalized later.
function hrZone(hr: number | null | undefined): string {
  if (hr == null) return "—";
  const max = 181;
  const pct = hr / max;
  if (pct < 0.6) return "Z1";
  if (pct < 0.7) return "Z2";
  if (pct < 0.8) return "Z3";
  if (pct < 0.9) return "Z4";
  return "Z5";
}

function LogForm({ onLogged }: { onLogged: () => void }) {
  const [modality, setModality] = useState("pickleball");
  const [duration, setDuration] = useState("60");
  const [avgHr, setAvgHr] = useState("");
  const [rpe, setRpe] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.cardioLog({
        modality,
        duration_min: parseInt(duration, 10),
        avg_hr: avgHr ? parseInt(avgHr, 10) : null,
        rpe: rpe ? parseFloat(rpe) : null,
      });
      setDuration("60");
      setAvgHr("");
      setRpe("");
      onLogged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "log failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 px-3 py-2.5 rounded-[var(--r-md)]"
      style={{ background: "oklch(1 0 0 / 0.025)", border: "1px solid var(--hairline)" }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-[9.5px] text-[var(--text-faint)] uppercase tracking-wider">Sport</span>
        <select
          value={modality}
          onChange={(e) => setModality(e.target.value)}
          className="text-[12px] bg-transparent border border-[var(--hairline)] rounded-sm px-2 py-1 text-[var(--text-primary)]"
        >
          {Object.entries(MODALITY_LABEL).map(([k, v]) => (
            <option key={k} value={k} style={{ background: "var(--card)" }}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[9.5px] text-[var(--text-faint)] uppercase tracking-wider">Min</span>
        <input
          type="number"
          inputMode="numeric"
          required
          min={1}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="w-16 text-[12px] tabular-nums bg-transparent border border-[var(--hairline)] rounded-sm px-2 py-1 text-[var(--text-primary)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[9.5px] text-[var(--text-faint)] uppercase tracking-wider">Avg HR</span>
        <input
          type="number"
          inputMode="numeric"
          value={avgHr}
          onChange={(e) => setAvgHr(e.target.value)}
          placeholder="—"
          className="w-16 text-[12px] tabular-nums bg-transparent border border-[var(--hairline)] rounded-sm px-2 py-1 text-[var(--text-primary)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[9.5px] text-[var(--text-faint)] uppercase tracking-wider">RPE</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          min={1}
          max={10}
          value={rpe}
          onChange={(e) => setRpe(e.target.value)}
          placeholder="—"
          className="w-16 text-[12px] tabular-nums bg-transparent border border-[var(--hairline)] rounded-sm px-2 py-1 text-[var(--text-primary)]"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="text-[11px] font-semibold px-3 py-1.5 rounded-sm transition-colors disabled:opacity-40"
        style={{
          background: "oklch(0.72 0.12 250 / 0.12)",
          border: "1px solid oklch(0.72 0.12 250 / 0.3)",
          color: "var(--chart-line)",
        }}
      >
        {busy ? "Saving…" : "+ Log"}
      </button>
      {err && <span className="text-[11px] text-[var(--negative)]">{err}</span>}
    </form>
  );
}

// Keytel formula (male): kcal/min = (-55.0969 + 0.6309×HR + 0.1988×kg + 0.2017×age) / 4.184
// Rob: 108.8 kg, age 39
function estimateKcal(avgHr: number, durationMin: number): number {
  const kcalPerMin = (-55.0969 + 0.6309 * avgHr + 0.1988 * 108.8 + 0.2017 * 39) / 4.184;
  return Math.round(Math.max(0, kcalPerMin) * durationMin);
}

const HIDDEN_KEY = "shc:cardio:hidden";
function loadHidden(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]")); } catch { return new Set(); }
}
function saveHidden(s: Set<string>) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s]));
}

function SessionRow({
  s,
  onDelete,
  onHide,
}: {
  s: CardioSession;
  onDelete: (id: string) => void;
  onHide: (id: string) => void;
}) {
  const m = modalityKey(s.kind);
  const days = Math.floor((Date.now() - new Date(s.date + "T00:00:00").getTime()) / 86_400_000);
  const ago = days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
  return (
    <tr className="hover:bg-[var(--card-hover)] transition-colors group">
      <td className="px-3 py-2 text-[var(--text-muted)] tabular-nums whitespace-nowrap">
        <span className="text-[var(--text-faint)] text-[10px] mr-1">{ago}</span>
      </td>
      <td className="px-3 py-2 text-[var(--text-primary)] font-medium">
        <span className="mr-1.5">{MODALITY_ICON[m]}</span>
        {MODALITY_LABEL[m]}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
        {s.duration_min ?? "—"}
        <span className="text-[var(--text-faint)] text-[10px] ml-0.5">min</span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {s.avg_hr != null ? (
          <span>
            <span className="text-[var(--text-primary)]">{s.avg_hr}</span>
            <span className="text-[var(--text-faint)] text-[9.5px] ml-1">{hrZone(s.avg_hr)}</span>
          </span>
        ) : (
          <span className="text-[var(--text-faint)]">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span style={{ color: rpeColor(s.rpe) }}>{s.rpe != null ? s.rpe.toFixed(1) : "—"}</span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
        {s.kcal != null ? (
          s.kcal
        ) : s.avg_hr && s.duration_min ? (
          <span title="Estimated from avg HR (Keytel formula)">
            ~{estimateKcal(s.avg_hr, s.duration_min)}
            <span className="text-[9px] text-[var(--text-faint)] ml-0.5">est</span>
          </span>
        ) : "—"}
      </td>
      <td className="px-1 py-2 text-right">
        <button
          onClick={() => s.source === "manual" ? onDelete(s.id) : onHide(s.id)}
          className="text-[var(--text-faint)] hover:text-[var(--negative)] opacity-0 group-hover:opacity-100 transition-opacity text-[12px] px-1"
          title={s.source === "manual" ? "Delete" : "Hide (WHOOP false positive)"}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

export function CardioPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["cardio-recent"],
    queryFn: () => api.cardioRecent(60),
    refetchInterval: 600_000,
  });
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden());

  function handleHide(id: string) {
    setHidden(prev => {
      const next = new Set(prev).add(id);
      saveHidden(next);
      return next;
    });
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["cardio-recent"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this session?")) return;
    await api.cardioDelete(id);
    refresh();
  }

  const sessions = (data?.sessions ?? []).filter(s => !hidden.has(s.id));
  const summary = data?.summary_28d ?? [];
  const total28d = useMemo(
    () => summary.reduce((acc, s) => ({ minutes: acc.minutes + s.minutes, sessions: acc.sessions + s.sessions, kcal: acc.kcal + s.kcal }), { minutes: 0, sessions: 0, kcal: 0 }),
    [summary],
  );

  return (
    <div className="shc-card shc-enter p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-[var(--text-primary)] tracking-tight">Cardio &amp; Sports</h2>
        <span className="text-[10.5px] text-[var(--text-faint)]">last 60 days · manual + WHOOP</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-[var(--hairline)]">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-0.5">28d sessions</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-light tabular-nums leading-none text-[var(--text-primary)]">{total28d.sessions}</span>
            <span className="text-[11px] text-[var(--text-faint)]">{summary.length} sports</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-0.5">28d minutes</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-light tabular-nums leading-none text-[var(--text-primary)]">{total28d.minutes}</span>
            <span className="text-[11px] text-[var(--text-faint)]">{(total28d.minutes / 4).toFixed(0)}/wk</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-0.5">Top sport</p>
          {summary[0] ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[16px] font-medium leading-none text-[var(--text-primary)]">
                {MODALITY_ICON[modalityKey(summary[0].kind)] ?? "•"} {MODALITY_LABEL[modalityKey(summary[0].kind)] ?? summary[0].kind}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-[var(--text-faint)]">—</span>
          )}
          {summary[0] && (
            <p className="text-[10px] text-[var(--text-faint)] mt-1 tabular-nums">
              {summary[0].minutes} min · {summary[0].sessions} sessions
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-0.5">Mix</p>
          <div className="flex h-3 rounded-sm overflow-hidden mt-1.5 bg-[oklch(1_0_0/0.04)]">
            {summary.map((s, i) => {
              const pct = total28d.minutes > 0 ? (s.minutes / total28d.minutes) * 100 : 0;
              if (pct < 1) return null;
              const colors = ["var(--chart-line)", "var(--positive)", "var(--neutral)", "var(--negative)", "oklch(0.55 0.05 230)"];
              return (
                <div
                  key={s.kind}
                  style={{ width: `${pct}%`, background: colors[i % colors.length] }}
                  title={`${MODALITY_LABEL[modalityKey(s.kind)] ?? s.kind} · ${s.minutes} min`}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-[var(--text-faint)] mt-1 tabular-nums">
            {summary.slice(0, 3).map((s) => MODALITY_LABEL[modalityKey(s.kind)] ?? s.kind).join(" · ")}
          </p>
        </div>
      </div>

      <LogForm onLogged={refresh} />

      <div className="rounded-[var(--r-md)] overflow-hidden" style={{ border: "1px solid var(--hairline)" }}>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider" style={{ borderBottom: "1px solid var(--hairline)" }}>
              <th className="px-3 py-2 text-left font-normal w-24">Date</th>
              <th className="px-3 py-2 text-left font-normal">Sport</th>
              <th className="px-3 py-2 text-right font-normal w-16">Time</th>
              <th className="px-3 py-2 text-right font-normal w-20">Avg HR</th>
              <th className="px-3 py-2 text-right font-normal w-12">RPE</th>
              <th className="px-3 py-2 text-right font-normal w-16">kcal</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-3 py-2"><div className="h-5 shc-skeleton rounded" /></td>
                </tr>
              ))
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[11px] text-[var(--text-faint)]">
                  No sessions yet. Log your first one above — pickleball, walks, biking, anything.
                </td>
              </tr>
            ) : (
              sessions.map((s) => <SessionRow key={s.id} s={s} onDelete={handleDelete} onHide={handleHide} />)
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--text-faint)] leading-snug">
        HR zones use 220 − age (≈ 181 max). Z2 (60–70%) builds aerobic base, Z3
        (70–80%) is tempo, Z4–5 are threshold/VO2.
      </p>
      <p className="text-[10px] leading-snug" style={{ color: "var(--neutral)" }}>
        β-blocker (propranolol PRN): on days taken, WHOOP kcal and zone labels underestimate true exertion — HR is suppressed ~15–20 bpm. Use RPE as the ground truth on those days.
      </p>
    </div>
  );
}
