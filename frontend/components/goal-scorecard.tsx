"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/ui/metric";

// Key compound movements to track for the "hold strength" goal.
// Matched case-insensitively against exercise names from Hevy.
const KEY_LIFT_KEYWORDS = [
  "squat",
  "bench press",
  "deadlift",
  "overhead press",
  "military press",
  "row",
  "lat pulldown",
  "pull-up",
  "pullup",
];

function trendMeta(trend: string | null): { color: string; arrow: string; label: string } {
  if (trend === "improving") return { color: "var(--positive)", arrow: "↑", label: "climbing" };
  if (trend === "declining") return { color: "var(--negative)", arrow: "↓", label: "declining" };
  return { color: "var(--text-muted)", arrow: "→", label: "holding" };
}

export function GoalScorecard() {
  const stateQ = useQuery({
    queryKey: ["daily-state"],
    queryFn: api.dailyState,
    refetchInterval: 5 * 60_000,
  });

  const dupr = useQuery({
    queryKey: ["pickleball-dupr"],
    queryFn: () => api.pickleballDupr(),
    refetchInterval: 60 * 60_000,
  });

  const progression = useQuery({
    queryKey: ["training-progression-all-8"],
    queryFn: () => api.trainingProgressionAll(8),
    refetchInterval: 30 * 60_000,
  });

  // ── DUPR ──────────────────────────────────────────────────────────────────
  const duprData = dupr.data;
  const current = duprData?.current?.doubles ?? null;
  const baseline = duprData?.baseline_doubles ?? null;
  const target = duprData?.target_doubles ?? 5.0;
  const snapshots = duprData?.snapshots ?? [];
  const sparkData = snapshots
    .filter((s) => s.doubles != null)
    .map((s) => ({ d: s.date.slice(5), v: s.doubles as number }));
  const gapClosed =
    current != null && baseline != null && target > baseline
      ? Math.max(0, Math.min(100, ((current - baseline) / (target - baseline)) * 100))
      : null;

  // ── Strength ──────────────────────────────────────────────────────────────
  const exercises = progression.data?.exercises ?? [];
  const keyLifts = exercises
    .filter((ex) =>
      KEY_LIFT_KEYWORDS.some((kw) => ex.exercise.toLowerCase().includes(kw)),
    )
    .slice(0, 5);

  // ── Body weight ──────────────────────────────────────────────────────────
  const state = stateQ.data;
  const bwKg = state?.checkin?.body_weight_kg ?? null;
  const bwLbs = bwKg != null ? bwKg * 2.20462 : null;
  const trendKgPerWk = state?.checkin?.body_weight_trend_4wk ?? null;
  const trendLbsPerWk = trendKgPerWk != null ? trendKgPerWk * 2.20462 : null;
  const bwStatus =
    trendLbsPerWk == null
      ? null
      : Math.abs(trendLbsPerWk) < 0.5
      ? { color: "var(--positive)", text: "Stable — concurrent training composition window open." }
      : trendLbsPerWk > 0
      ? { color: "var(--text-muted)", text: "Gaining — muscle gain is fine; monitor if unintended fat gain." }
      : { color: "var(--negative)", text: "Losing — protect muscle with adequate protein and kcal during heavy pickleball load." };

  return (
    <div className="space-y-4">
      <p className="shc-helptext">
        Three north-star metrics for 2026: DUPR doubles toward 5.0, key compound e1RMs holding or
        climbing, bodyweight stable for concurrent training.
      </p>

      {/* ── DUPR Track ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[var(--hairline)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>DUPR doubles · target 5.0</Eyebrow>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[24px] font-semibold tabular-nums text-[var(--text-primary)]">
                {current != null ? current.toFixed(3) : "—"}
              </span>
              <span className="text-[13px] text-[var(--text-faint)]">
                → {target.toFixed(1)}
              </span>
              {current != null && (
                <span className="text-[11px] text-[var(--text-dim)]">
                  {(target - current).toFixed(3)} to go
                </span>
              )}
            </div>
          </div>

          {sparkData.length > 1 && (
            <div className="h-[44px] w-[110px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={sparkData}
                  margin={{ top: 3, right: 3, left: 3, bottom: 3 }}
                >
                  <Line
                    type="monotone"
                    dataKey="v"
                    dot={false}
                    stroke="oklch(0.55 0.18 250)"
                    strokeWidth={1.75}
                    isAnimationActive={false}
                  />
                  <ReferenceLine
                    y={target}
                    stroke="var(--hairline-strong)"
                    strokeDasharray="3 3"
                  />
                  <YAxis
                    domain={[
                      (dataMin: number) => Math.max(0, dataMin - 0.05),
                      target + 0.1,
                    ]}
                    hide
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card-hover)",
                      border: "1px solid var(--hairline-strong)",
                      borderRadius: 6,
                      fontSize: 10,
                    }}
                    formatter={(v: number) => [v.toFixed(3), "DUPR"]}
                    labelFormatter={(l: string) => l}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {gapClosed != null && (
          <div>
            <div className="flex justify-between text-[9.5px] text-[var(--text-faint)] mb-1.5">
              <span>baseline {baseline?.toFixed(3)}</span>
              <span>target {target.toFixed(1)}</span>
            </div>
            <div className="h-[5px] rounded-full bg-[var(--hairline-strong)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${gapClosed}%`,
                  background: "oklch(0.55 0.18 250)",
                }}
              />
            </div>
            <div className="text-[9.5px] text-[var(--text-faint)] mt-1.5 text-right">
              {gapClosed.toFixed(1)}% of gap closed
            </div>
          </div>
        )}

        {snapshots.length === 1 && (
          <p className="text-[10px] text-[var(--text-faint)] border-t border-[var(--hairline)] pt-2">
            First snapshot captured today. Trajectory builds as daily syncs accumulate.
          </p>
        )}

        {duprData?.needs_reauth && (
          <p className="text-[10px] text-[var(--negative)] border-t border-[var(--hairline)] pt-2">
            DUPR re-auth required — run{" "}
            <code className="text-[var(--text-muted)]">POST /api/pickleball/dupr/sync</code> after
            updating credentials.
          </p>
        )}
      </div>

      {/* ── Strength Hold Track ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[var(--hairline)] p-4">
        <Eyebrow className="mb-3">Key compound e1RM · hold or climb</Eyebrow>

        {progression.isLoading ? (
          <div className="shc-skeleton h-[80px] rounded" />
        ) : keyLifts.length === 0 ? (
          <p className="text-[11px] text-[var(--text-dim)]">
            No key compound lifts in the last 8 weeks.
          </p>
        ) : (
          <div className="divide-y divide-[var(--hairline)]">
            {keyLifts.map((ex) => {
              const { color, arrow, label } = trendMeta(ex.trend);
              return (
                <div
                  key={ex.exercise}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="text-[12px] text-[var(--text-muted)] leading-tight flex-1 min-w-0 truncate pr-3">
                    {ex.exercise}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[15px] font-medium tabular-nums text-[var(--text-primary)]">
                      {ex.e1rm_lbs != null ? `${ex.e1rm_lbs} lbs` : "—"}
                    </span>
                    <span
                      className="text-[11px] tabular-nums w-16 text-right"
                      style={{ color }}
                    >
                      {arrow} {label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Body Weight Track ───────────────────────────────────────────────── */}
      {bwLbs != null && (
        <div className="rounded-lg border border-[var(--hairline)] p-4 space-y-2">
          <Eyebrow>Body weight · concurrent training target: maintain</Eyebrow>
          <div className="flex items-baseline gap-3">
            <span className="text-[24px] font-semibold tabular-nums text-[var(--text-primary)]">
              {bwLbs.toFixed(1)} lbs
            </span>
            {trendLbsPerWk != null && (
              <span
                className="text-[12px] tabular-nums"
                style={{ color: bwStatus?.color }}
              >
                {trendLbsPerWk >= 0 ? "+" : ""}
                {trendLbsPerWk.toFixed(1)} lbs/wk · 4wk trend
              </span>
            )}
          </div>
          {bwStatus && (
            <p className="text-[10.5px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
              {bwStatus.text}
            </p>
          )}
        </div>
      )}

      <p className="text-[10px] text-[var(--text-faint)] pt-1 border-t border-[var(--hairline)]">
        DUPR syncs daily at 05:30 from api.dupr.gg. Strength from Hevy post-workout sync. Body
        weight from morning check-in.
      </p>
    </div>
  );
}
