const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export interface RecoveryToday {
  date: string;
  score: number;
  hrv: number;
  rhr: number;
  skin_temp: number;
}

export interface RecoveryPoint {
  date: string;
  score: number;
  hrv: number;
  rhr: number;
}

export interface HRVPoint {
  date: string;
  hrv: number;
  avg: number;
  sd: number;
}

export interface SleepEntry {
  date: string;
  stages: string | null;
  spo2: number;
  rhr: number;
}

export interface ReadinessToday {
  date: string;
  recovery_score: number;
  hrv: number;
  rhr: number;
  sleep_hours: number;
  energy: number | null;
  stress: number | null;
}

export interface OAuthStatus {
  source: string;
  last_sync_at: string;
  needs_reauth: boolean;
}

export const api = {
  recoveryToday: () => get<RecoveryToday>("/api/recovery/today"),
  recoveryTrend: (days = 14) => get<RecoveryPoint[]>(`/api/recovery/trend?days=${days}`),
  hrvTrend: (days = 28) => get<HRVPoint[]>(`/api/hrv/trend?days=${days}`),
  sleepRecent: (days = 7) => get<SleepEntry[]>(`/api/sleep/recent?days=${days}`),
  readinessToday: () => get<ReadinessToday>("/api/readiness/today"),
  oauthStatus: () => get<OAuthStatus[]>("/api/oauth/status"),
};
