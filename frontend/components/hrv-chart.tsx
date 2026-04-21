"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type HRVPoint } from "@/lib/api";

function buildBandData(points: HRVPoint[]) {
  return points.map((p) => ({
    date: p.date.slice(5),   // MM-DD
    hrv: p.hrv ? +p.hrv.toFixed(1) : null,
    bandLow: p.avg && p.sd ? +(p.avg - p.sd).toFixed(1) : null,
    bandHigh: p.avg && p.sd ? +(p.avg + p.sd).toFixed(1) : null,
    avg: p.avg ? +p.avg.toFixed(1) : null,
  }));
}

export function HRVChart() {
  const { data, isLoading } = useQuery({
    queryKey: ["hrv"],
    queryFn: () => api.hrvTrend(28),
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading || !data?.length) {
    return (
      <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[oklch(0.18_0_0)] p-6">
        <p className="text-xs text-[oklch(0.5_0_0)] uppercase tracking-widest mb-3">HRV · 28d</p>
        <div className="h-36 bg-[oklch(0.22_0_0)] rounded animate-pulse" />
      </div>
    );
  }

  const chartData = buildBandData(data);

  return (
    <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[oklch(0.18_0_0)] p-6 transition-all hover:border-[oklch(1_0_0/0.12)] hover:-translate-y-px">
      <div className="flex justify-between items-baseline mb-3">
        <p className="text-xs text-[oklch(0.5_0_0)] uppercase tracking-widest">HRV · 28d</p>
        {data.at(-1) && (
          <span className="text-2xl font-medium tabular-nums text-[oklch(0.96_0_0)]">
            {data.at(-1)!.hrv?.toFixed(0)}
            <span className="text-xs text-[oklch(0.5_0_0)] ml-1">ms</span>
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          {/* ±1 SD band */}
          <Area
            type="monotone"
            dataKey="bandHigh"
            fill="oklch(0.6 0.12 250 / 0.12)"
            stroke="none"
            legendType="none"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="bandLow"
            fill="oklch(0.145 0 0)"
            stroke="none"
            legendType="none"
            isAnimationActive={false}
          />
          {/* 28d avg */}
          <Line
            type="monotone"
            dataKey="avg"
            stroke="oklch(0.5 0.05 250)"
            strokeWidth={1}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          {/* HRV line */}
          <Line
            type="monotone"
            dataKey="hrv"
            stroke="oklch(0.72 0.12 250)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "oklch(0.72 0.12 250)" }}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "oklch(0.45 0 0)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "oklch(0.45 0 0)" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "oklch(0.22 0 0)",
              border: "1px solid oklch(1 0 0 / 0.08)",
              borderRadius: 8,
              fontSize: 12,
              color: "oklch(0.9 0 0)",
            }}
            cursor={{ stroke: "oklch(1 0 0 / 0.15)", strokeWidth: 1 }}
            formatter={(v: number) => [`${v} ms`]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
