"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/ui/metric";

export function PRTable() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["prs"],
    queryFn: () => api.trainingPRs(15),
    refetchInterval: 600_000,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <Eyebrow>Personal records</Eyebrow>
        <span className="text-[10.5px] text-[var(--text-dim)]">by max weight</span>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[...Array(8)].map((_, i) => <div key={i} className="h-6 shc-skeleton rounded" />)}
        </div>
      ) : (
        <div className="space-y-0.5">
          {data.map((pr, i) => (
            <div
              key={pr.exercise}
              className="flex items-center justify-between px-2 py-1.5 rounded-md"
              style={{ background: i % 2 === 0 ? "oklch(1 0 0 / 0.03)" : "transparent" }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono w-4 text-right flex-shrink-0 text-[var(--text-faint)]">{i + 1}</span>
                <span className="text-[12px] truncate text-[var(--text-muted)]">{pr.exercise}</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                <span className="text-[12px] font-mono tabular-nums text-[var(--text-primary)]">
                  {pr.pr_lbs} <span className="text-[var(--text-dim)]">lbs</span>
                </span>
                <span className="text-[10px] font-mono tabular-nums hidden sm:block text-[var(--text-faint)]">
                  {pr.last_performed.slice(0, 7)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
