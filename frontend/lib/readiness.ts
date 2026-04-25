import type { ClinicalOverview } from "@/lib/api";

const BETA_BLOCKER_NAMES = ["propranolol", "metoprolol", "atenolol", "bisoprolol", "carvedilol", "nebivolol"];

/** Detect a beta-blocker in the user's medication list (case-insensitive prefix match). */
export function hasBetaBlocker(med: ClinicalOverview | undefined): boolean {
  if (!med?.medications) return false;
  return med.medications.some((m) =>
    BETA_BLOCKER_NAMES.some((bb) => m.name.toLowerCase().includes(bb)),
  );
}
