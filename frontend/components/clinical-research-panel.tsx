"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { Eyebrow, Metric } from "@/components/ui/metric";

function tone(value: number | null, good: number, bad: number, dir: "high" | "low" = "high"): "positive" | "neutral" | "negative" {
  if (value == null) return "neutral";
  if (dir === "high") {
    if (value >= good) return "positive";
    if (value <= bad) return "negative";
    return "neutral";
  }
  if (value <= good) return "positive";
  if (value >= bad) return "negative";
  return "neutral";
}

function toneColor(t: "positive" | "neutral" | "negative"): string {
  return t === "positive" ? "var(--positive)" : t === "negative" ? "var(--negative)" : "var(--text-primary)";
}

export function ClinicalResearchPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["clinical-research"],
    queryFn: api.clinicalResearch,
    refetchInterval: 5 * 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="shc-card shc-enter p-5">
        <Eyebrow>Clinical research signals</Eyebrow>
        <div className="shc-skeleton h-[180px] mt-3" />
      </div>
    );
  }

  const sri = data.sleep_regularity_index.value;
  const sriTone = tone(sri, 80, 60, "high");
  const ln = data.ln_rmssd;
  const lnTone = tone(ln.delta, 0.05, -0.05, "high");
  const streak = data.recovery_deficit_streak.consecutive_red_days;
  const al = data.allostatic_load.score_0_10;
  const alTone = tone(al, 3, 6, "low");
  const drugs = data.hrv_drug_adjusted;

  return (
    <div className="shc-card shc-enter p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <Eyebrow>Clinical research signals</Eyebrow>
        <span className="text-[10.5px] text-[var(--text-dim)] uppercase tracking-wider">
          peer-reviewed
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* Sleep Regularity Index */}
        <div title={data.sleep_regularity_index.ref}>
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider">SRI · Phillips '17</p>
          <Metric
            value={sri != null ? sri.toFixed(0) : "—"}
            unit={sri != null ? "/100" : undefined}
            size="lg"
            tone={sriTone}
          />
          <p className="text-[10.5px] text-[var(--text-muted)] capitalize">
            {data.sleep_regularity_index.interpretation ?? "—"}
          </p>
        </div>

        {/* lnRMSSD */}
        <div title={data.ln_rmssd.ref}>
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider">lnRMSSD · Buchheit '14</p>
          <Metric
            value={ln.today != null ? ln.today.toFixed(2) : "—"}
            size="lg"
            tone={lnTone}
          />
          {ln.delta != null && ln.avg_4w != null && (
            <p className="text-[10.5px] tabular-nums" style={{ color: toneColor(lnTone) }}>
              {ln.delta > 0 ? "+" : ""}{ln.delta.toFixed(2)} vs 4w avg
            </p>
          )}
          {ln.cv_pct_7d != null && (
            <p className="text-[10px] text-[var(--text-faint)] tabular-nums">CV {ln.cv_pct_7d.toFixed(1)}%</p>
          )}
        </div>

        {/* Recovery deficit streak */}
        <div title={data.recovery_deficit_streak.ref}>
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider">Red-streak · WHOOP '22</p>
          <Metric
            value={streak.toString()}
            unit={streak === 1 ? "day" : "days"}
            size="lg"
            tone={streak >= 3 ? "negative" : streak >= 1 ? "neutral" : "positive"}
          />
          <p className="text-[10.5px]" style={{ color: streak >= 3 ? "var(--negative)" : "var(--text-muted)" }}>
            {streak >= 3 ? "ALARM — injury-risk window" : streak >= 1 ? "watch" : "no streak"}
          </p>
        </div>

        {/* Allostatic load */}
        <div title={data.allostatic_load.ref}>
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider">Allostatic load · Seeman '01</p>
          <Metric
            value={al != null ? al.toFixed(1) : "—"}
            unit={al != null ? "/10" : undefined}
            size="lg"
            tone={alTone}
          />
          <p className="text-[10.5px] text-[var(--text-muted)] capitalize">
            {data.allostatic_load.interpretation ?? "—"}
            <span className="text-[10px] text-[var(--text-faint)] ml-1">
              ({data.allostatic_load.n_markers} markers)
            </span>
          </p>
        </div>

        {/* Drug-adjusted HRV */}
        <div title={drugs.ref}>
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider">Adj. HRV · Kemp '10</p>
          {drugs.adjusted != null ? (
            <>
              <Metric value={drugs.adjusted.toFixed(0)} unit="ms" size="lg" />
              {drugs.raw != null && drugs.factor !== 1 && (
                <p className="text-[10.5px] text-[var(--text-muted)] tabular-nums">
                  raw {drugs.raw.toFixed(0)}ms · ×{drugs.factor.toFixed(2)}
                </p>
              )}
              {drugs.active_drugs.length > 0 && (
                <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">
                  {drugs.active_drugs.join(" · ")}
                </p>
              )}
            </>
          ) : (
            <p className="text-[12px] text-[var(--text-dim)]">—</p>
          )}
        </div>

        {/* Z2 HR drift */}
        <div title={data.z2_hr_consistency.ref}>
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider">Z2 HR drift · Maffetone</p>
          <Metric
            value={data.z2_hr_consistency.cv_pct != null ? data.z2_hr_consistency.cv_pct.toFixed(1) : "—"}
            unit={data.z2_hr_consistency.cv_pct != null ? "%CV" : undefined}
            size="lg"
            tone={tone(data.z2_hr_consistency.cv_pct, 4, 7, "low")}
          />
          <p className="text-[10.5px] text-[var(--text-muted)] capitalize">
            {data.z2_hr_consistency.interpretation ?? "—"}
          </p>
        </div>
      </div>

      <p className="mt-4 pt-3 text-[10.5px] text-[var(--text-dim)] leading-snug border-t border-[var(--hairline)]">
        <span className="text-[var(--text-muted)]">How to read this. </span>
        Six signals layered on top of your standard insights, each anchored to a peer-reviewed
        threshold. Hover any tile for its primary citation. SRI ≥80 = tight circadian; lnRMSSD
        moves with autonomic adaptation; 3+ red days doubles soft-tissue injury risk; allostatic
        load &lt;3 is low cumulative wear; drug-adjusted HRV strips the propranolol/SSRI shadow;
        Z2 CV &lt;5% = stable aerobic base.
      </p>
    </div>
  );
}
