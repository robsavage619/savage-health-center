"use client";

import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, ReferenceLine, Tooltip } from "recharts";
import { api } from "@/lib/api";
import { Eyebrow, Metric, DeltaPill } from "@/components/ui/metric";
import { computeReadiness, readinessTone, weightLabel } from "@/lib/readiness";

export function PillarReadiness() {
  const readiness = useQuery({ queryKey: ["readiness"], queryFn: api.readinessToday });
  const stats = useQuery({ queryKey: ["stats-summary"], queryFn: api.statsSummary });
  const trend = useQuery({ queryKey: ["recovery-trend-14"], queryFn: () => api.recoveryTrend(14) });
  const clinical = useQuery({ queryKey: ["clinical-overview"], queryFn: api.clinicalOverview });

  const result = computeReadiness(readiness.data, stats.data, clinical.data);
  const current = result.score;
  const t = readinessTone(current);

  const points =
    trend.data?.map((p, i) => ({
      date: p.date.slice(5),
      score: p.score,
      readiness: p.score,
      idx: i,
    })) ?? [];

  const weekAgo = points.slice(-14, -7);
  const thisWeek = points.slice(-7);
  const weekAvg = weekAgo.length
    ? weekAgo.reduce((a, p) => a + (p.score ?? 0), 0) / weekAgo.length
    : 0;
  const thisAvg = thisWeek.length
    ? thisWeek.reduce((a, p) => a + (p.score ?? 0), 0) / thisWeek.length
    : 0;
  const wow = thisAvg - weekAvg;

  const slope = stats.data?.recovery_trend_slope_7d ?? 0;
  const projection = current != null ? Array.from({ length: 4 }, (_, i) => Math.max(0, Math.min(100, current + slope * i))) : [];
  const projectionTone =
    slope < -0.8 ? "negative" : slope > 0.8 ? "positive" : "neutral";

  return (
    <div className="shc-card shc-enter p-5 min-h-[320px] flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Eyebrow>Readiness · composite</Eyebrow>
          {result.betaBlocker && (
            <span
              className="text-[8.5px] font-medium uppercase tracking-wider px-1.5 py-px rounded-sm"
              style={{
                color: "var(--neutral)",
                background: "var(--neutral-soft)",
                border: "1px solid oklch(0.75 0.18 75 / 0.25)",
              }}
              title="HRV signal blunted by beta-blocker; weights re-balanced"
            >
              β-adj
            </span>
          )}
        </div>
        <span className="text-[10.5px] text-[var(--text-dim)] tabular-nums">{weightLabel(result.weights)}</span>
      </div>

      <div className="flex items-baseline gap-3 mt-3">
        <Metric value={current != null ? Math.round(current) : "—"} size="xl" tone={t} />
        <DeltaPill value={wow} polarity={wow > 0 ? "positive" : wow < 0 ? "negative" : "neutral"} />
        <span className="text-[11px] text-[var(--text-dim)]">wk/wk</span>
      </div>

      <div className="mt-3 h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <ReferenceLine y={67} stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <ReferenceLine y={34} stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <Line
              dataKey="readiness"
              stroke="var(--chart-line)"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card-hover)",
                border: "1px solid var(--hairline-strong)",
                borderRadius: 8,
                fontSize: 11,
                color: "var(--text-primary)",
              }}
              cursor={{ stroke: "var(--hairline-strong)" }}
              formatter={(v: number) => [`${v.toFixed(0)}`]}
              labelStyle={{ color: "var(--text-dim)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-auto pt-3">
        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-1.5">Next 3 days · projected</p>
        <div className="flex items-end gap-1.5 h-[36px]">
          {projection.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${(v / 100) * 100}%`,
                  background:
                    projectionTone === "positive"
                      ? "var(--positive-soft)"
                      : projectionTone === "negative"
                      ? "var(--negative-soft)"
                      : "var(--neutral-soft)",
                  border: "1px solid",
                  borderColor:
                    projectionTone === "positive"
                      ? "var(--positive)"
                      : projectionTone === "negative"
                      ? "var(--negative)"
                      : "var(--neutral)",
                }}
              />
              <span className="text-[9.5px] text-[var(--text-faint)] tabular-nums">+{i}d</span>
            </div>
          ))}
        </div>
        {slope < -1 && (
          <p className="text-[11px] text-[var(--negative)] mt-2">Trend negative — consider dropping load.</p>
        )}
        {slope > 1 && (
          <p className="text-[11px] text-[var(--positive)] mt-2">Trend positive — room to push.</p>
        )}
      </div>
    </div>
  );
}
