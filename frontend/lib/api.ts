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
  spo2: number | null;
  rhr: number | null;
  hours: number | null;
}

export interface SleepTrendPoint {
  date: string;
  stages: string | null;
  hours: number | null;
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

export interface StatsSummary {
  acwr: { acute: number | null; chronic: number | null; ratio: number | null };
  hrv: { today: number | null; baseline_28d: number | null; deviation_sigma: number | null };
  rhr: { baseline_28d: number | null; last_7_avg: number | null; elevated_pct: number | null };
  sleep: {
    consistency_stdev: number | null;
    avg_7d: number | null;
    debt_7d_hours: number | null;
  };
  recovery_trend_slope_7d: number;
  streaks: { recovery_above_60: number; sleep_above_7h: number };
  personal_bests: {
    best_hrv: { date: string; hrv: number } | null;
    lowest_rhr: { date: string; rhr: number } | null;
  };
}

export interface Insight {
  headline: string;
  body: string;
  polarity: "positive" | "neutral" | "negative";
}

export interface WeekDay {
  label: string;
  date: string;
  is_today: boolean;
  is_future: boolean;
  recovery: number | null;
  sleep_hours: number | null;
}

export interface PersonalBests {
  top_hrv: { date: string; value: number }[];
  lowest_rhr: { date: string; value: number }[];
  longest_sleep: { date: string; value: number }[];
}

export interface HeatmapDay {
  date: string;
  intensity: number;
  sets: number;
  volume_kg: number;
}

export interface WeeklyVolume {
  week: string;
  sets: number;
  volume_kg: number;
  sessions: number;
}

export interface PR {
  exercise: string;
  pr_lbs: number;
  pr_kg: number;
  last_performed: string;
}

export interface Correlation {
  question: string;
  sample_days: number;
  avg_recovery_yes: number | null;
  avg_recovery_no: number | null;
  avg_hrv_yes: number | null;
  avg_hrv_no: number | null;
  hrv_delta: number | null;
}

export interface ClinicalOverview {
  conditions: { name: string; onset: string | null; status: string }[];
  medications: { name: string; dose: string | null; frequency: string | null; started: string | null }[];
  key_labs: { name: string; value: number; unit: string | null; collected_at: string | null }[];
}

export interface WeightPoint {
  date: string;
  kg: number;
  lbs: number;
}

export const api = {
  recoveryToday: () => get<RecoveryToday>("/api/recovery/today"),
  recoveryTrend: (days = 14) => get<RecoveryPoint[]>(`/api/recovery/trend?days=${days}`),
  hrvTrend: (days = 28) => get<HRVPoint[]>(`/api/hrv/trend?days=${days}`),
  sleepRecent: (days = 7) => get<SleepEntry[]>(`/api/sleep/recent?days=${days}`),
  sleepTrend: (days = 30) => get<SleepTrendPoint[]>(`/api/sleep/trend?days=${days}`),
  readinessToday: () => get<ReadinessToday>("/api/readiness/today"),
  oauthStatus: () => get<OAuthStatus[]>("/api/oauth/status"),
  statsSummary: () => get<StatsSummary>("/api/stats/summary"),
  insights: () => get<Insight[]>("/api/insights"),
  weekSummary: () => get<WeekDay[]>("/api/week/summary"),
  personalBests: () => get<PersonalBests>("/api/personal-bests"),
  trainingHeatmap: (weeks = 52) => get<HeatmapDay[]>(`/api/training/heatmap?weeks=${weeks}`),
  trainingWeekly: (weeks = 16) => get<WeeklyVolume[]>(`/api/training/weekly?weeks=${weeks}`),
  trainingPRs: (n = 15) => get<PR[]>(`/api/training/prs?n=${n}`),
  insightsCorrelations: () => get<Correlation[]>("/api/insights/correlations"),
  clinicalOverview: () => get<ClinicalOverview>("/api/clinical/overview"),
  bodyTrend: (days = 90) => get<WeightPoint[]>(`/api/body/trend?days=${days}`),
};
