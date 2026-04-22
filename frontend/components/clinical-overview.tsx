"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/ui/metric";

const MED_IMPACT: Record<string, string> = {
  "propranolol": "β-blocker — suppresses RHR response",
  "escitalopram": "SSRI — may suppress HRV",
  "fluoxetine": "SSRI — may suppress HRV",
};

function medImpact(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(MED_IMPACT)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export function ClinicalOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["clinical"],
    queryFn: api.clinicalOverview,
    refetchInterval: 3_600_000,
  });

  const activeMeds = data?.medications.filter(m => !m.name.toLowerCase().includes("discontinued")) ?? [];
  const activeConditions = data?.conditions.filter(c => c.status === "active") ?? [];
  const keyLabs = data?.key_labs.slice(0, 10) ?? [];

  const skeleton = <div className="h-32 shc-skeleton rounded" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="shc-card p-4 space-y-3">
        <Eyebrow>Active conditions</Eyebrow>
        {isLoading ? skeleton : (
          <div className="space-y-2">
            {activeConditions.map(c => (
              <div key={c.name} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-[var(--neutral)]" />
                <div>
                  <p className="text-[12px] leading-snug text-[var(--text-muted)]">{c.name}</p>
                  {c.onset && <p className="text-[10px] text-[var(--text-faint)]">{c.onset.slice(0, 7)}</p>}
                </div>
              </div>
            ))}
            {activeConditions.length === 0 && <p className="text-[11px] text-[var(--text-faint)]">None on record</p>}
          </div>
        )}
      </div>

      <div className="shc-card p-4 space-y-3">
        <Eyebrow>Current medications</Eyebrow>
        {isLoading ? skeleton : (
          <div className="space-y-2">
            {activeMeds.slice(0, 8).map(m => {
              const impact = medImpact(m.name);
              return (
                <div key={m.name + m.started} className="flex flex-col gap-0.5">
                  <p className="text-[12px] leading-snug text-[var(--text-muted)]">{m.name.split("(")[0].trim()}</p>
                  {impact && <p className="text-[10px] text-[var(--neutral)]">{impact}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shc-card p-4 space-y-3">
        <Eyebrow>Key labs</Eyebrow>
        {isLoading ? skeleton : (
          <div className="space-y-1.5">
            {keyLabs.map(l => (
              <div key={l.name + l.collected_at} className="flex items-center justify-between">
                <span className="text-[11px] truncate mr-2 text-[var(--text-dim)]">{l.name}</span>
                <span className="text-[11px] font-mono tabular-nums flex-shrink-0 text-[var(--text-primary)]">
                  {l.value} <span className="text-[var(--text-faint)]">{l.unit ?? ""}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
