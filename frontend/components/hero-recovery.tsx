"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type ReadinessToday } from "@/lib/api";

function recoveryColor(score: number): string {
  if (score >= 67) return "oklch(0.72 0.18 145)";   // green
  if (score >= 34) return "oklch(0.75 0.18 75)";    // amber
  return "oklch(0.65 0.22 25)";                      // red
}

function recoveryVerdict(readiness: ReadinessToday): string {
  const s = readiness.recovery_score ?? 0;
  if (s >= 67) return "Train Hard";
  if (s >= 34) return "Moderate Effort";
  return "Rest & Recover";
}

function RecoveryArc({ score }: { score: number }) {
  const size = 180;
  const r = 72;
  const cx = size / 2;
  const cy = size / 2 + 16;
  const startAngle = -220;
  const sweepAngle = 260;
  const pct = Math.min(100, Math.max(0, score)) / 100;
  const color = recoveryColor(score);

  function arc(angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const start = arc(startAngle);
  const trackEnd = arc(startAngle + sweepAngle);
  const fillEnd = arc(startAngle + sweepAngle * pct);
  const largeArc = sweepAngle > 180 ? 1 : 0;
  const fillLargeArc = sweepAngle * pct > 180 ? 1 : 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {/* track */}
      <path
        d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${trackEnd.x} ${trackEnd.y}`}
        fill="none"
        stroke="oklch(1 0 0 / 0.08)"
        strokeWidth={10}
        strokeLinecap="round"
      />
      {/* fill */}
      {pct > 0 && (
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${fillLargeArc} 1 ${fillEnd.x} ${fillEnd.y}`}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      )}
      {/* score */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={42}
        fontWeight={500}
        fill="oklch(0.96 0 0)"
        fontFamily="var(--font-geist-mono, monospace)"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {score}
      </text>
      <text
        x={cx}
        y={cy + 26}
        textAnchor="middle"
        fontSize={11}
        fill="oklch(0.6 0 0)"
        fontFamily="var(--font-geist-sans, sans-serif)"
        letterSpacing="0.05em"
      >
        RECOVERY
      </text>
    </svg>
  );
}

function SkeletonArc() {
  return (
    <div className="mx-auto w-[180px] h-[180px] rounded-full bg-[oklch(0.22_0_0)] animate-pulse" />
  );
}

export function HeroRecovery() {
  const { data, isLoading } = useQuery({
    queryKey: ["readiness"],
    queryFn: api.readinessToday,
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[oklch(0.18_0_0)] p-6 flex flex-col items-center gap-4 transition-all hover:border-[oklch(1_0_0/0.12)] hover:-translate-y-px">
      {isLoading || !data ? (
        <>
          <SkeletonArc />
          <div className="h-5 w-32 rounded bg-[oklch(0.22_0_0)] animate-pulse" />
        </>
      ) : (
        <>
          <RecoveryArc score={data.recovery_score ?? 0} />
          <div className="text-center space-y-1">
            <p
              className="text-lg font-medium tracking-tight"
              style={{ color: recoveryColor(data.recovery_score ?? 0) }}
            >
              {recoveryVerdict(data)}
            </p>
            <div className="flex gap-4 text-xs text-[oklch(0.55_0_0)] tabular-nums">
              {data.hrv && <span>HRV {data.hrv.toFixed(0)} ms</span>}
              {data.rhr && <span>RHR {data.rhr} bpm</span>}
              {data.sleep_hours && <span>{data.sleep_hours.toFixed(1)}h sleep</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
