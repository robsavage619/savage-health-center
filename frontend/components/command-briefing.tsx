"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type Briefing, type DailyState } from "@/lib/api";
import { reconciledVerdict, type VerdictTone } from "@/lib/readiness";
import { Eyebrow, Dot } from "@/components/ui/metric";

/**
 * Decision-first command briefing.
 *
 * A single "Today's Move" card: one verdict, one why, one CTA. The verdict
 * reconciles the readiness score with the auto-regulation gates (see
 * reconciledVerdict) so a high score can't read "Push it" on a deload day.
 * At-a-glance vitals live in the header HUD; detail lives in the WHOOP panel
 * and pillars — not duplicated here. Readiness, HRV-σ, ACWR, and the
 * β-blocker reweighting all come from the canonical /api/state/today.
 */

const CALL_COLOR: Record<string, string> = {
  Push: "var(--positive)",
  Train: "var(--positive)",
  Maintain: "var(--neutral)",
  Easy: "var(--neutral)",
  Rest: "var(--negative)",
};

function tierColor(t: VerdictTone) {
  return t === "positive" ? "var(--positive)" : t === "negative" ? "var(--negative)" : "var(--neutral)";
}

function scrollToPlan() {
  const el = document.getElementById("next-workout");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function CommandBriefing() {
  const stateQ = useQuery({
    queryKey: ["daily-state"],
    queryFn: api.dailyState,
    refetchInterval: 5 * 60 * 1000,
  });
  const briefingQ = useQuery({
    queryKey: ["briefing"],
    queryFn: api.briefing,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  if (stateQ.isLoading || !stateQ.data) {
    return (
      <div className="shc-card overflow-hidden">
        <div className="px-5 py-5">
          <div className="shc-skeleton h-[26px] w-[160px] mb-2 !rounded" />
          <div className="shc-skeleton h-[14px] w-[260px] !rounded" />
        </div>
      </div>
    );
  }

  const state: DailyState = stateQ.data;
  const r = state.readiness;
  const rec = state.recovery;
  const sleep = state.sleep;
  const load = state.training_load;
  const gates = state.gates;
  const fresh = state.freshness;
  const propranolol = state.checkin?.propranolol_taken ?? false;

  const { label: v, tone: t, gated } = reconciledVerdict(state);
  const briefing =
    briefingQ.data && "training_call" in briefingQ.data ? (briefingQ.data as Briefing) : null;

  // The "why" — structured chips, not a punctuation-delimited string.
  type Chip = { label: string; value: string; tone?: "positive" | "neutral" | "negative"; dim?: boolean };
  const whyChips: Chip[] = [];
  if (rec.hrv_sigma != null) {
    whyChips.push({
      label: "HRV",
      value: `${rec.hrv_sigma >= 0 ? "+" : ""}${rec.hrv_sigma.toFixed(1)}σ`,
      tone: propranolol ? "neutral" : rec.hrv_sigma >= 0 ? "positive" : rec.hrv_sigma < -1 ? "negative" : "neutral",
      dim: propranolol,
    });
  }
  if (rec.score != null) {
    whyChips.push({
      label: "Recovery",
      value: String(Math.round(rec.score)),
      tone: rec.score >= 67 ? "positive" : rec.score >= 34 ? "neutral" : "negative",
    });
  }
  if (load.acwr != null) {
    whyChips.push({
      label: "ACWR",
      value: load.acwr.toFixed(2),
      tone: load.acwr >= 0.8 && load.acwr <= 1.3 ? "positive" : load.acwr > 1.5 ? "negative" : "neutral",
    });
  }
  if (sleep.last_hours != null) {
    whyChips.push({
      label: "Sleep",
      value: `${sleep.last_hours.toFixed(1)}h`,
      tone: sleep.last_hours >= 7 ? "positive" : sleep.last_hours >= 6 ? "neutral" : "negative",
    });
  }

  return (
    <div className="shc-card shc-enter overflow-hidden">
      {/* Headline: verdict + why + CTA */}
      <div className="px-5 py-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-[1.4] min-w-[200px]">
          <Dot tone={t} />
          <div className="min-w-0">
            <Eyebrow>Today · Verdict</Eyebrow>
            <p
              className="mt-0.5 text-[22px] font-medium tracking-tight leading-none"
              style={{ color: tierColor(t) }}
            >
              {v}
            </p>
            {gated && (
              <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
                Capped by gates ↓
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <Eyebrow>Why</Eyebrow>
          {whyChips.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {whyChips.map((c) => (
                <WhyChip key={c.label} chip={c} />
              ))}
            </div>
          ) : (
            <p className="mt-0.5 text-[13px] text-[var(--text-muted)] leading-snug">
              Insufficient data — sync sources to populate.
            </p>
          )}
          {propranolol && (
            <div
              className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-[10.5px]"
              style={{
                background: "oklch(0.65 0.16 80 / 0.1)",
                border: "1px solid oklch(0.65 0.16 80 / 0.35)",
                color: "oklch(0.78 0.16 80)",
              }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.72 0.18 80)" }} />
              HRV pharmacologically elevated — intensity based on sleep + RHR trend
            </div>
          )}
          {!propranolol && r.beta_blocker_adjusted && (
            <span
              className="inline-flex items-center gap-1.5 mt-1.5 text-[10px] tracking-wide"
              style={{ color: "var(--text-muted)" }}
              title="HRV signal blunted by beta-blocker; readiness composite re-weighted toward sleep + RHR + subjective"
            >
              <span
                className="inline-block w-1 h-1 rounded-full"
                style={{ background: "var(--neutral)" }}
              />
              β-blocker adjusted
            </span>
          )}
        </div>

        <button type="button" onClick={scrollToPlan} className="btn btn-secondary shrink-0">
          {"Today's plan ↓"}
        </button>
      </div>

      {/* Auto-regulation gates — inline coloured strip when active */}
      {gates.reasons.length > 0 && (
        <div
          className="px-5 py-2 border-t border-[var(--hairline)] flex items-start gap-3"
          style={{
            borderLeft: `3px solid ${tierColor(t)}`,
            background: "var(--surface-1)",
          }}
        >
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mt-px shrink-0">
            Gates
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-[var(--text-primary)] leading-snug">
              Max intensity {gates.max_intensity.toUpperCase()}
              {gates.forbid_muscle_groups.length > 0 && (
                <> · skip {gates.forbid_muscle_groups.join(", ")}</>
              )}
              {gates.deload_required && <> · deload required</>}
              {gates.hr_zone_shift_bpm > 0 && <> · HR −{gates.hr_zone_shift_bpm} bpm</>}
            </p>
            <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5">
              {gates.reasons.join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Coaching note — promoted to primary text per design review */}
      {briefing && (
        <div className="px-5 py-3 border-t border-[var(--hairline)]">
          <div className="flex items-baseline gap-3 mb-1">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: CALL_COLOR[briefing.training_call] ?? "var(--text-primary)" }}
            >
              {briefing.training_call}
            </span>
            <span className="text-[11px] text-[var(--text-dim)]">{briefing.readiness_headline}</span>
            <span className="ml-auto text-[10px] text-[var(--text-faint)] tabular-nums">
              {new Date(briefing.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className="text-[13.5px] text-[var(--text-primary)] leading-relaxed">
            {briefing.coaching_note}
          </p>
          {briefing.flags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {briefing.flags.map((f, i) => (
                <span
                  key={i}
                  className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[9.5px] text-[var(--text-dim)]"
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {fresh.gaps.length > 0 && (
        <div className="px-5 py-2 border-t border-[var(--hairline)] text-[10.5px] text-[var(--negative)]">
          {fresh.gaps.join(" · ")}
        </div>
      )}
    </div>
  );
}

function WhyChip({ chip }: { chip: { label: string; value: string; tone?: "positive" | "neutral" | "negative"; dim?: boolean } }) {
  const dotColor =
    chip.dim
      ? "var(--text-faint)"
      : chip.tone === "positive"
      ? "var(--positive)"
      : chip.tone === "negative"
      ? "var(--negative)"
      : "var(--neutral)";
  return (
    <span
      className="inline-flex items-baseline gap-1.5 px-2 py-0.5 rounded-full border text-[11.5px] tabular-nums"
      style={{
        borderColor: chip.dim ? "var(--hairline)" : "var(--hairline)",
        background: "oklch(1 0 0 / 0.02)",
        opacity: chip.dim ? 0.45 : 1,
      }}
      title={chip.dim ? "HRV unreliable — propranolol active" : undefined}
    >
      <span
        className="inline-block w-1 h-1 rounded-full self-center"
        style={{ background: dotColor }}
      />
      <span className="text-[var(--text-dim)] text-[10px] uppercase tracking-wider">{chip.label}</span>
      <span className="text-[var(--text-primary)] font-medium">{chip.value}</span>
    </span>
  );
}
