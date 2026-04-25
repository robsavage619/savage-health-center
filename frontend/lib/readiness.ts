import type { ReadinessToday, StatsSummary, ClinicalOverview } from "@/lib/api";

export interface ReadinessWeights {
  hrv: number;
  sleep: number;
  rhr: number;
  subj: number;
}

export interface ReadinessResult {
  score: number | null;
  weights: ReadinessWeights;
  betaBlocker: boolean;
  components: {
    hrv: number | null;
    sleep: number | null;
    rhr: number | null;
    subj: number | null;
  };
}

const DEFAULT_WEIGHTS: ReadinessWeights = { hrv: 0.4, sleep: 0.3, rhr: 0.2, subj: 0.1 };
// Beta blockers (propranolol etc.) blunt HRV and depress RHR variability.
// Down-weight HRV, up-weight sleep + RHR-trend + subjective.
const BETA_BLOCKER_WEIGHTS: ReadinessWeights = { hrv: 0.2, sleep: 0.4, rhr: 0.25, subj: 0.15 };

const BETA_BLOCKER_NAMES = ["propranolol", "metoprolol", "atenolol", "bisoprolol", "carvedilol", "nebivolol"];

/** Detect a beta-blocker in the user's medication list (case-insensitive prefix match). */
export function hasBetaBlocker(med: ClinicalOverview | undefined): boolean {
  if (!med?.medications) return false;
  return med.medications.some((m) =>
    BETA_BLOCKER_NAMES.some((bb) => m.name.toLowerCase().includes(bb)),
  );
}

/**
 * Sigma-based HRV score: anchored at 50 with ±2σ → ±50.
 * Replaces the previous `(delta/base) * 300` saturation hack and uses the
 * already-computed personal rolling deviation when available.
 */
function hrvSubscore(s: StatsSummary | undefined, today: number | null | undefined): number | null {
  const sigma = s?.hrv.deviation_sigma;
  if (sigma != null) {
    return Math.max(0, Math.min(100, 50 + sigma * 25));
  }
  const base = s?.hrv.baseline_28d;
  if (today != null && base) {
    return Math.max(0, Math.min(100, 50 + ((today - base) / base) * 300));
  }
  return null;
}

function sleepSubscore(hours: number | null | undefined): number | null {
  if (hours == null) return null;
  if (hours >= 7.5) return 100;
  if (hours >= 6.5) return 75;
  if (hours >= 5.5) return 50;
  if (hours >= 4) return 25;
  return 10;
}

function rhrSubscore(s: StatsSummary | undefined, today: number | null | undefined): number | null {
  const base = s?.rhr.baseline_28d;
  if (today == null || !base) return null;
  // Lower RHR vs baseline = better. Each 5% deviation moves 25 points.
  const pct = (today - base) / base;
  return Math.max(0, Math.min(100, 50 - pct * 500));
}

function subjSubscore(energy: number | null | undefined): number | null {
  if (energy == null) return null;
  return Math.max(0, Math.min(100, energy * 10));
}

export function computeReadiness(
  r: ReadinessToday | undefined,
  s: StatsSummary | undefined,
  med?: ClinicalOverview,
): ReadinessResult {
  const betaBlocker = hasBetaBlocker(med);
  const weights = betaBlocker ? BETA_BLOCKER_WEIGHTS : DEFAULT_WEIGHTS;
  const components = {
    hrv: hrvSubscore(s, r?.hrv ?? s?.hrv.today ?? null),
    sleep: sleepSubscore(r?.sleep_hours),
    rhr: rhrSubscore(s, r?.rhr ?? null),
    subj: subjSubscore(r?.energy),
  };

  // Re-normalize weights over only the components we actually have data for.
  const present = (Object.entries(components) as [keyof typeof components, number | null][])
    .filter(([, v]) => v != null) as [keyof typeof components, number][];
  if (present.length === 0) {
    return { score: null, weights, betaBlocker, components };
  }
  const wsum = present.reduce((a, [k]) => a + weights[k], 0);
  const score = present.reduce((a, [k, v]) => a + (weights[k] / wsum) * v, 0);

  return { score, weights, betaBlocker, components };
}

export function readinessTone(score: number | null): "positive" | "neutral" | "negative" {
  if (score == null) return "neutral";
  if (score >= 67) return "positive";
  if (score >= 34) return "neutral";
  return "negative";
}

export function weightLabel(w: ReadinessWeights): string {
  return `HRV ${Math.round(w.hrv * 100)} · Sleep ${Math.round(w.sleep * 100)} · RHR ${Math.round(w.rhr * 100)} · Subj ${Math.round(w.subj * 100)}`;
}
