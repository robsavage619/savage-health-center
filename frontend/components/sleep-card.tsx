"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type SleepEntry } from "@/lib/api";

interface Stages {
  deep_min?: number;
  rem_min?: number;
  light_min?: number;
  awake_min?: number;
}

function parseStages(raw: string | null): Stages {
  if (!raw) return {};
  try {
    // DuckDB stores Python dict repr; try JSON first then eval-safe parse
    return JSON.parse(raw.replace(/'/g, '"'));
  } catch {
    return {};
  }
}

const STAGE_COLORS: Record<string, string> = {
  deep: "oklch(0.55 0.18 280)",
  rem: "oklch(0.65 0.15 250)",
  light: "oklch(0.45 0.06 250)",
  awake: "oklch(0.38 0 0)",
};

function SleepBar({ entry }: { entry: SleepEntry }) {
  const stages = parseStages(entry.stages);
  const total =
    (stages.deep_min ?? 0) + (stages.rem_min ?? 0) +
    (stages.light_min ?? 0) + (stages.awake_min ?? 0);

  if (!total) return null;

  const segments: { label: string; pct: number; color: string }[] = [
    { label: "deep", pct: (stages.deep_min ?? 0) / total, color: STAGE_COLORS.deep },
    { label: "rem", pct: (stages.rem_min ?? 0) / total, color: STAGE_COLORS.rem },
    { label: "light", pct: (stages.light_min ?? 0) / total, color: STAGE_COLORS.light },
    { label: "awake", pct: (stages.awake_min ?? 0) / total, color: STAGE_COLORS.awake },
  ].filter((s) => s.pct > 0);

  const totalHours = (total / 60).toFixed(1);

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] text-[oklch(0.5_0_0)]">{entry.date.slice(5)}</span>
        <span className="text-sm tabular-nums text-[oklch(0.85_0_0)]">{totalHours}h</span>
      </div>
      <div className="flex h-3 w-full rounded overflow-hidden gap-px">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="h-full transition-all"
            style={{ width: `${seg.pct * 100}%`, background: seg.color }}
            title={`${seg.label}: ${Math.round(seg.pct * total)}m`}
          />
        ))}
      </div>
    </div>
  );
}

export function SleepCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["sleep"],
    queryFn: () => api.sleepRecent(7),
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[oklch(0.18_0_0)] p-6 transition-all hover:border-[oklch(1_0_0/0.12)] hover:-translate-y-px">
      <div className="flex justify-between items-baseline mb-4">
        <p className="text-xs text-[oklch(0.5_0_0)] uppercase tracking-widest">Sleep · 7 nights</p>
        <div className="flex gap-3 text-[10px] text-[oklch(0.45_0_0)]">
          {Object.entries(STAGE_COLORS).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: c }} />
              {k}
            </span>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-5 rounded bg-[oklch(0.22_0_0)] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((entry) => (
            <SleepBar key={entry.date} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
