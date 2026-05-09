"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * LIVE indicator with a heartbeat that breathes faster when sync is fresh and
 * slower as data ages out. Hue also walks from green → amber → red as recency
 * crosses the 6h / 24h thresholds.
 */
export function LiveBadge() {
  const { data } = useQuery({
    queryKey: ["oauth-status"],
    queryFn: api.oauthStatus,
    refetchInterval: 60_000,
  });

  let mostRecent: number | null = null;
  for (const s of data ?? []) {
    const t = Date.parse(s.last_sync_at);
    if (!Number.isNaN(t) && (mostRecent == null || t > mostRecent)) mostRecent = t;
  }
  const ageMin = mostRecent ? (Date.now() - mostRecent) / 60_000 : null;

  // Pulse cadence: 1.2s when very fresh → 4.8s when stale.
  let period = 2.8;
  let color = "var(--positive)";
  let label = "live";
  if (ageMin != null) {
    if (ageMin < 30) period = 1.2;
    else if (ageMin < 360) period = 2.0;
    else if (ageMin < 1440) {
      period = 3.4;
      color = "var(--neutral)";
      label = "stale";
    } else {
      period = 4.8;
      color = "var(--negative)";
      label = "offline";
    }
  }

  return (
    <span className="sl-live-badge" style={{ color }}>
      <span
        className="sl-live-dot"
        style={{ background: color, animationDuration: `${period}s` }}
      />
      {label}
    </span>
  );
}
