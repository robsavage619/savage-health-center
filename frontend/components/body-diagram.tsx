"use client";

import { useState } from "react";

/**
 * Per-muscle soreness body diagram.
 *
 * Click cycles: 0 (none) → 1 (mild) → 2 (moderate) → 3 (acute) → 0.
 * Muscle keys must match `MUSCLE_TO_GROUP` in backend `metrics.py`.
 * Severity feeds the auto-regulation gates (acute → forbid muscle group;
 * 2+ moderate in a group → cap intensity moderate).
 */

export type Soreness = Record<string, number>;

const SEV_FILL = ["transparent", "rgba(245,200,80,0.45)", "rgba(240,140,60,0.65)", "rgba(220,80,80,0.85)"];
const SEV_STROKE = ["var(--hairline-strong)", "rgba(245,200,80,0.9)", "rgba(240,140,60,1)", "rgba(220,80,80,1)"];
const SEV_LABEL = ["", "mild", "moderate", "acute"];

type Region = {
  key: string;
  label: string;
  d: string;       // SVG path for the muscle area (mirrored automatically when paired)
  paired?: boolean; // if true, render mirrored copy on right side
};

// Front view regions (left side; paired regions render mirrored on right).
// Coordinate system: 200 wide × 500 tall.
const FRONT: Region[] = [
  { key: "front_delts", label: "Front delts", d: "M72,80 q-10,4 -12,18 q4,10 14,8 q4,-10 4,-22 z", paired: true },
  { key: "side_delts",  label: "Side delts",  d: "M58,92 q-7,8 -4,20 q5,4 10,-2 q1,-12 -2,-20 z", paired: true },
  { key: "chest",       label: "Chest",       d: "M75,100 q-2,18 5,38 q12,5 18,-2 q2,-22 -2,-36 q-12,-4 -21,0 z", paired: true },
  { key: "biceps",      label: "Biceps",      d: "M52,118 q-6,18 -2,36 q8,4 12,-2 q2,-18 -2,-34 z", paired: true },
  { key: "abs",         label: "Abs",         d: "M88,148 q12,-2 24,0 q2,30 0,62 q-12,4 -24,0 q-2,-30 0,-62 z" },
  { key: "quads",       label: "Quads",       d: "M82,228 q-4,50 4,108 q10,4 14,-2 q4,-54 -2,-104 q-8,-4 -16,-2 z", paired: true },
  { key: "adductors",   label: "Adductors",   d: "M92,234 q8,-2 16,0 q2,40 -2,72 q-6,2 -12,0 q-4,-32 -2,-72 z" },
  { key: "calves",      label: "Calves",      d: "M82,378 q-2,40 4,76 q8,2 12,-2 q4,-38 -2,-72 q-6,-4 -14,-2 z", paired: true },
];

// Back view regions.
const BACK: Region[] = [
  { key: "traps",       label: "Traps",       d: "M80,72 q20,-6 40,0 q-2,16 -20,22 q-18,-6 -20,-22 z" },
  { key: "rear_delts",  label: "Rear delts",  d: "M60,92 q-4,12 0,22 q8,4 12,-2 q-2,-12 -6,-22 z", paired: true },
  { key: "traps_mid",   label: "Mid traps",   d: "M86,98 q14,-2 28,0 q-2,16 -4,22 q-10,2 -20,0 q-2,-12 -4,-22 z" },
  { key: "lats",        label: "Lats",        d: "M68,116 q-6,28 0,52 q12,4 18,-2 q-2,-26 -4,-50 q-8,-4 -14,0 z", paired: true },
  { key: "mid_back",    label: "Mid back",    d: "M90,124 q10,-2 20,0 q4,28 0,50 q-10,2 -20,0 q-4,-22 0,-50 z" },
  { key: "triceps",     label: "Triceps",     d: "M52,120 q-6,18 -2,36 q8,4 12,-2 q2,-18 -2,-34 z", paired: true },
  { key: "lower_back",  label: "Lower back",  d: "M88,178 q12,-2 24,0 q2,18 0,32 q-12,2 -24,0 q-2,-14 0,-32 z" },
  { key: "glutes",      label: "Glutes",      d: "M78,212 q22,-6 44,0 q4,28 -4,46 q-18,4 -36,0 q-8,-18 -4,-46 z" },
  { key: "hamstrings",  label: "Hamstrings",  d: "M82,260 q-4,46 4,98 q10,4 14,-2 q4,-50 -2,-94 q-8,-4 -16,-2 z", paired: true },
  { key: "calves",      label: "Calves",      d: "M82,366 q-2,42 4,80 q8,2 12,-2 q4,-40 -2,-76 q-6,-4 -14,-2 z", paired: true },
];

// `traps_mid` doesn't exist on the backend taxonomy — fold it into `traps`.
const KEY_REMAP: Record<string, string> = { traps_mid: "traps" };

export function BodyDiagram({
  value,
  onChange,
}: {
  value: Soreness;
  onChange: (next: Soreness) => void;
}) {
  const [view, setView] = useState<"front" | "back">("front");

  function bump(rawKey: string) {
    const key = KEY_REMAP[rawKey] ?? rawKey;
    const cur = value[key] ?? 0;
    const next = (cur + 1) % 4;
    const out = { ...value };
    if (next === 0) delete out[key];
    else out[key] = next;
    onChange(out);
  }

  const regions = view === "front" ? FRONT : BACK;
  const sev = (rawKey: string): number => value[KEY_REMAP[rawKey] ?? rawKey] ?? 0;

  const flagged = Object.entries(value).filter(([, s]) => s > 0).length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] text-[var(--text-muted)]">Muscle soreness</span>
        <div className="flex items-center gap-2">
          {flagged > 0 && (
            <span className="text-[10px] text-[var(--text-faint)] tabular-nums">
              {flagged} flagged
            </span>
          )}
          <div className="inline-flex rounded-full border border-[var(--hairline-strong)] overflow-hidden">
            {(["front", "back"] as const).map((v) => {
              const active = view === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className="px-2.5 py-0.5 text-[10.5px] font-medium transition-colors capitalize"
                  style={{
                    background: active ? "var(--text-primary)" : "transparent",
                    color: active ? "var(--bg)" : "var(--text-muted)",
                  }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <svg
          viewBox="0 0 200 500"
          className="block w-[140px] h-auto select-none"
          aria-label={`${view} body diagram`}
        >
          {/* Body silhouette */}
          <BodySilhouette view={view} />
          {regions.map((r) => {
            const s = sev(r.key);
            return (
              <g key={r.key}>
                <path
                  d={r.d}
                  fill={SEV_FILL[s]}
                  stroke={SEV_STROKE[s]}
                  strokeWidth={s > 0 ? 1.5 : 1}
                  className="cursor-pointer transition-colors"
                  onClick={() => bump(r.key)}
                >
                  <title>{`${r.label}${s ? ` — ${SEV_LABEL[s]}` : ""}`}</title>
                </path>
                {r.paired && (
                  <path
                    d={r.d}
                    transform="translate(200,0) scale(-1,1)"
                    fill={SEV_FILL[s]}
                    stroke={SEV_STROKE[s]}
                    strokeWidth={s > 0 ? 1.5 : 1}
                    className="cursor-pointer transition-colors"
                    onClick={() => bump(r.key)}
                  >
                    <title>{`${r.label}${s ? ` — ${SEV_LABEL[s]}` : ""}`}</title>
                  </path>
                )}
              </g>
            );
          })}
        </svg>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="text-[10px] text-[var(--text-faint)] leading-relaxed">
            Tap a muscle to cycle: <span className="text-[var(--text-muted)]">none → mild → moderate → acute</span>.
            Acute soreness will forbid that muscle group in tomorrow's plan.
          </div>
          <div className="space-y-1">
            {Object.entries(value)
              .filter(([, s]) => s > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([k, s]) => (
                <div
                  key={k}
                  className="flex items-center justify-between text-[11px] tabular-nums"
                >
                  <span className="text-[var(--text-muted)] capitalize">
                    {k.replace(/_/g, " ")}
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded-sm text-[10px]"
                    style={{
                      background: SEV_FILL[s],
                      color: SEV_STROKE[s],
                      border: `1px solid ${SEV_STROKE[s]}`,
                    }}
                  >
                    {SEV_LABEL[s]}
                  </span>
                </div>
              ))}
            {flagged === 0 && (
              <div className="text-[10.5px] text-[var(--text-faint)] italic">
                No soreness flagged.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BodySilhouette({ view }: { view: "front" | "back" }) {
  // Stylised silhouette outline; identical for front and back at this fidelity.
  void view;
  return (
    <g
      fill="none"
      stroke="var(--hairline)"
      strokeWidth={1}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* head */}
      <ellipse cx={100} cy={40} rx={20} ry={26} />
      {/* neck */}
      <path d="M92,62 q8,6 16,0 v8 h-16 z" />
      {/* torso */}
      <path d="M58,80 q42,-14 84,0 q4,40 -4,108 q-12,16 -38,16 q-26,0 -38,-16 q-8,-68 -4,-108 z" />
      {/* hips */}
      <path d="M70,210 q30,-6 60,0 q4,18 -2,36 q-28,8 -56,0 q-6,-18 -2,-36 z" />
      {/* legs */}
      <path d="M76,250 q-2,80 6,138 q-2,40 4,80 q14,4 18,-2 q4,-40 -2,-78 q4,-58 4,-138 z" />
      <path d="M124,250 q2,80 -6,138 q2,40 -4,80 q-14,4 -18,-2 q-4,-40 2,-78 q-4,-58 -4,-138 z" />
      {/* arms */}
      <path d="M58,82 q-8,16 -10,40 q-2,30 6,52 q4,4 8,2 q4,-22 4,-50 q-2,-26 -8,-44 z" />
      <path d="M142,82 q8,16 10,40 q2,30 -6,52 q-4,4 -8,2 q-4,-22 -4,-50 q2,-26 8,-44 z" />
    </g>
  );
}
