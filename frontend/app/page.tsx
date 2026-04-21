import { HeroRecovery } from "@/components/hero-recovery";
import { HRVChart } from "@/components/hrv-chart";
import { SleepCard } from "@/components/sleep-card";
import { SyncStatus } from "@/components/sync-status";

export default function Dashboard() {
  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <header className="flex items-baseline justify-between pb-2">
        <h1 className="text-sm font-medium tracking-wide text-[oklch(0.55_0_0)] uppercase">
          Savage Health Center
        </h1>
        <span className="text-[11px] text-[oklch(0.4_0_0)] tabular-nums">
          {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </span>
      </header>

      <SyncStatus />

      {/* Row 1 — Hero recovery + HRV */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HeroRecovery />
        <div className="md:col-span-2">
          <HRVChart />
        </div>
      </section>

      {/* Row 2 — Sleep */}
      <section>
        <SleepCard />
      </section>

      {/* Placeholder rows — P2 + P3 */}
      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[oklch(0.18_0_0)] p-6 flex items-center justify-center min-h-[120px]">
          <p className="text-xs text-[oklch(0.35_0_0)]">Workout history — coming in P2</p>
        </div>
        <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[oklch(0.18_0_0)] p-6 flex items-center justify-center min-h-[120px]">
          <p className="text-xs text-[oklch(0.35_0_0)]">AI advisor — coming in P3</p>
        </div>
      </section>
    </main>
  );
}
