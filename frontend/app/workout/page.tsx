"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

const KG_PER_LB = 0.453592;
const LB_PER_KG = 2.20462;

interface PlannedSet {
  uid: string;
  block: string;
  exercise: string;
  set_idx: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_weight_lbs: number | null;
  target_rpe: number | null;
  target_rir: number | null;
  rest_seconds: number;
  notes?: string;
}

function parseReps(reps: string | number | null | undefined): number | null {
  if (reps == null) return null;
  if (typeof reps === "number") return reps;
  const m = String(reps).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function rpeToRir(rpe: number | null | undefined): number | null {
  if (rpe == null) return null;
  return Math.max(0, Math.round(10 - rpe));
}

function rirToRpe(rir: number | null | undefined): number | null {
  if (rir == null) return null;
  return Math.max(1, Math.min(10, 10 - rir));
}

/**
 * Linear regression / Velocity-based autoregulation suggestion for the next set.
 *
 * Rules (Helms 2018, RP autoregulation):
 *  - actual RIR < target RIR by ≥1 (set was harder than planned) → drop next set 5%
 *  - actual RIR < target RIR by ≥2 → drop next set 10%
 *  - actual RIR > target RIR by ≥2 (set was too easy) → add 2.5%
 *  - actual reps missed target by ≥2 → drop next set 5%
 *  - MCV < 0.4 m/s on a strength lift (>80% 1RM) → drop next set 5%
 */
function nextSetSuggestion(
  prev: { actual_reps: number | null; target_reps: number | null; actual_rir: number | null; target_rir: number | null; mcv_m_s: number | null; actual_weight_kg: number | null },
): { delta_pct: number; reason: string } | null {
  if (prev.actual_weight_kg == null) return null;
  const repMiss = prev.target_reps != null && prev.actual_reps != null ? prev.target_reps - prev.actual_reps : 0;
  const rirGap = prev.actual_rir != null && prev.target_rir != null ? prev.target_rir - prev.actual_rir : null;

  if (rirGap != null && rirGap >= 2) return { delta_pct: -10, reason: `RIR ${prev.actual_rir} vs target ${prev.target_rir} — fatigue ahead of plan, cut 10%` };
  if (rirGap != null && rirGap >= 1) return { delta_pct: -5, reason: `RIR ${prev.actual_rir} vs target ${prev.target_rir} — set was harder than planned, drop 5%` };
  if (repMiss >= 2) return { delta_pct: -5, reason: `Missed reps by ${repMiss} — drop 5% to hit target` };
  if (prev.mcv_m_s != null && prev.mcv_m_s < 0.4 && prev.actual_weight_kg > 0) {
    return { delta_pct: -5, reason: `MCV ${prev.mcv_m_s.toFixed(2)} m/s — bar speed loss, drop 5%` };
  }
  if (rirGap != null && rirGap <= -2) return { delta_pct: 2.5, reason: `RIR ${prev.actual_rir} vs target ${prev.target_rir} — too easy, add 2.5%` };
  return { delta_pct: 0, reason: "On target — repeat planned weight" };
}

function buildPlannedSets(plan: Awaited<ReturnType<typeof api.workoutNext>> | undefined): PlannedSet[] {
  if (!plan?.blocks) return [];
  const out: PlannedSet[] = [];
  for (const block of plan.blocks) {
    for (const ex of block.exercises) {
      const reps = parseReps(ex.reps);
      const wt_lbs = ex.weight_lbs ?? (ex.weight_kg ? Math.round(ex.weight_kg * LB_PER_KG) : null);
      const wt_kg = ex.weight_kg ?? (ex.weight_lbs ? +(ex.weight_lbs * KG_PER_LB).toFixed(2) : null);
      const target_rir = ex.rir_target ?? rpeToRir(ex.rpe_target ?? null);
      const target_rpe = ex.rpe_target ?? rirToRpe(ex.rir_target ?? null);
      for (let i = 1; i <= ex.sets; i++) {
        out.push({
          uid: `${block.label}::${ex.name}::${i}`,
          block: block.label,
          exercise: ex.name,
          set_idx: i,
          target_reps: reps,
          target_weight_kg: wt_kg,
          target_weight_lbs: wt_lbs,
          target_rpe,
          target_rir,
          rest_seconds: ex.rest_seconds ?? 90,
          notes: ex.notes,
        });
      }
    }
  }
  return out;
}

interface ActualState {
  reps: string;
  weight_lbs: string;
  rir: string;
  mcv: string;
}

function emptyActuals(): ActualState {
  return { reps: "", weight_lbs: "", rir: "", mcv: "" };
}

export default function WorkoutPage() {
  const qc = useQueryClient();
  const planQ = useQuery({ queryKey: ["workout-next"], queryFn: api.workoutNext });
  const sessionQ = useQuery({ queryKey: ["session-today"], queryFn: api.sessionToday, refetchInterval: 30_000 });

  const planned = useMemo(() => buildPlannedSets(planQ.data), [planQ.data]);

  // Map plan UID → server log (if logged); allow re-render on session change.
  const loggedByUid = useMemo(() => {
    const map = new Map<string, NonNullable<typeof sessionQ.data>["sets"][number]>();
    if (!sessionQ.data) return map;
    for (const s of sessionQ.data.sets) {
      const uid = `${s.block ?? ""}::${s.exercise}::${s.set_idx}`;
      // last-write wins (most recent set takes priority)
      map.set(uid, s);
    }
    return map;
  }, [sessionQ.data]);

  // Find next un-logged set for autoregulation hint placement.
  const nextSetUid = useMemo(() => planned.find((p) => !loggedByUid.has(p.uid))?.uid ?? null, [planned, loggedByUid]);

  // Per-uid input state (uncommitted edits).
  const [drafts, setDrafts] = useState<Record<string, ActualState>>({});

  const logMut = useMutation({
    mutationFn: api.sessionSetLog,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session-today"] }),
  });
  const delMut = useMutation({
    mutationFn: api.sessionDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session-today"] }),
  });

  // Rest timer
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const restRemaining = restEndsAt ? Math.max(0, Math.ceil((restEndsAt - now) / 1000)) : 0;

  function commit(p: PlannedSet) {
    const d = drafts[p.uid] ?? emptyActuals();
    const reps = d.reps ? parseInt(d.reps, 10) : null;
    const wt_lbs = d.weight_lbs ? parseFloat(d.weight_lbs) : p.target_weight_lbs;
    const rir = d.rir ? parseInt(d.rir, 10) : null;
    const mcv = d.mcv ? parseFloat(d.mcv) : null;
    const wt_kg = wt_lbs != null ? +(wt_lbs * KG_PER_LB).toFixed(2) : null;
    logMut.mutate({
      block: p.block,
      exercise: p.exercise,
      set_idx: p.set_idx,
      target_reps: p.target_reps,
      target_weight_kg: p.target_weight_kg,
      target_rpe: p.target_rpe,
      target_rir: p.target_rir,
      actual_reps: reps,
      actual_weight_kg: wt_kg,
      actual_rir: rir,
      actual_rpe: rir != null ? rirToRpe(rir) : null,
      mcv_m_s: mcv,
    });
    setRestEndsAt(Date.now() + p.rest_seconds * 1000);
  }

  // Compute autoreg suggestion for `nextSetUid`: look at the most recently
  // completed set of the same exercise.
  const suggestion = useMemo(() => {
    if (!nextSetUid) return null;
    const next = planned.find((p) => p.uid === nextSetUid);
    if (!next) return null;
    // Most recent logged set of the same exercise, lower set_idx
    let prev: NonNullable<typeof sessionQ.data>["sets"][number] | null = null;
    for (const p of planned) {
      if (p.exercise !== next.exercise) continue;
      if (p.set_idx >= next.set_idx) continue;
      const got = loggedByUid.get(p.uid);
      if (got) prev = got;
    }
    if (!prev) return null;
    const sug = nextSetSuggestion({
      actual_reps: prev.actual_reps,
      target_reps: prev.target_reps,
      actual_rir: prev.actual_rir,
      target_rir: prev.target_rir,
      mcv_m_s: prev.mcv_m_s,
      actual_weight_kg: prev.actual_weight_kg,
    });
    if (!sug || sug.delta_pct === 0) return sug;
    const baseLbs = next.target_weight_lbs ?? (prev.actual_weight_kg ? prev.actual_weight_kg * LB_PER_KG : null);
    if (baseLbs == null) return sug;
    const newLbs = Math.round((baseLbs * (1 + sug.delta_pct / 100)) / 2.5) * 2.5;
    return { ...sug, target_lbs: baseLbs, suggested_lbs: newLbs };
  }, [nextSetUid, planned, loggedByUid, sessionQ.data]);

  // Group planned sets by block
  const blocks = useMemo(() => {
    const out: { label: string; sets: PlannedSet[] }[] = [];
    for (const p of planned) {
      const last = out[out.length - 1];
      if (last && last.label === p.block) last.sets.push(p);
      else out.push({ label: p.block, sets: [p] });
    }
    return out;
  }, [planned]);

  const completedCount = sessionQ.data?.sets.length ?? 0;
  const totalCount = planned.length;

  return (
    <main className="min-h-screen px-4 pb-24 pt-5 max-w-[860px] mx-auto">
      <header className="flex items-baseline justify-between pb-3 border-b border-[var(--hairline)] mb-4">
        <div>
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-[0.2em]">Active Session</p>
          <h1 className="text-[18px] font-medium text-[var(--text-primary)] mt-0.5">
            {planQ.data?.title ?? "Loading…"}
          </h1>
        </div>
        <Link
          href="/"
          className="text-[10.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)] uppercase tracking-wider"
        >
          ← Dashboard
        </Link>
      </header>

      {/* Sticky session bar */}
      <div className="sticky top-0 z-10 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--hairline)] -mx-4 px-4 py-2 mb-4 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] font-medium tabular-nums text-[var(--text-primary)]">
            {completedCount}<span className="text-[var(--text-muted)] text-[12px]">/{totalCount}</span>
          </span>
          <span className="text-[10.5px] text-[var(--text-dim)] uppercase tracking-wider">sets</span>
        </div>
        {restEndsAt && restRemaining > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-[var(--text-dim)] uppercase tracking-wider">Rest</span>
            <span className="text-[18px] font-medium tabular-nums text-[var(--accent,#6cf)]">
              {Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, "0")}
            </span>
            <button
              onClick={() => setRestEndsAt(null)}
              className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider px-2 py-1 border border-[var(--hairline)] rounded hover:border-[var(--text-muted)]"
            >
              skip
            </button>
          </div>
        ) : (
          <span className="text-[10.5px] text-[var(--text-faint)]">Ready for next set</span>
        )}
      </div>

      {suggestion && nextSetUid && (
        <div className="mb-4 rounded-md border border-[var(--accent,#6cf)]/40 bg-[var(--accent,#6cf)]/5 p-3">
          <p className="text-[10px] text-[var(--accent,#6cf)] uppercase tracking-wider">Autoregulation · next set</p>
          <p className="text-[13px] text-[var(--text-primary)] mt-1">
            {suggestion.delta_pct === 0 ? (
              <>On target — repeat <span className="tabular-nums">{(suggestion as any).target_lbs?.toFixed?.(0) ?? "—"}</span> lbs</>
            ) : (
              <>
                {suggestion.delta_pct > 0 ? "↑" : "↓"} <span className="tabular-nums font-medium">{(suggestion as any).suggested_lbs?.toFixed(1)}</span> lbs
                <span className="text-[var(--text-muted)] ml-2">
                  (was {(suggestion as any).target_lbs?.toFixed?.(0)})
                </span>
              </>
            )}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">{suggestion.reason}</p>
        </div>
      )}

      {!planQ.data && <p className="text-[12px] text-[var(--text-dim)]">Loading plan…</p>}

      {blocks.map((block) => (
        <section key={block.label} className="mb-5">
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-[0.16em] mb-2">{block.label}</p>
          {/* Group by exercise within the block */}
          {Object.entries(
            block.sets.reduce<Record<string, PlannedSet[]>>((acc, s) => {
              (acc[s.exercise] ??= []).push(s);
              return acc;
            }, {}),
          ).map(([exercise, sets]) => (
            <div key={exercise} className="shc-card p-3 mb-3">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-[14px] font-medium text-[var(--text-primary)]">{exercise}</h3>
                <span className="text-[10.5px] text-[var(--text-dim)] tabular-nums">
                  target {sets[0].target_weight_lbs ?? "—"} lbs · {sets[0].target_reps ?? "—"} reps
                  {sets[0].target_rpe != null && <> · RPE {sets[0].target_rpe}</>}
                </span>
              </div>
              {sets[0].notes && (
                <p className="text-[10.5px] text-[var(--text-faint)] mb-2 leading-snug">{sets[0].notes}</p>
              )}
              <div className="space-y-1.5">
                {sets.map((p) => {
                  const logged = loggedByUid.get(p.uid);
                  const draft = drafts[p.uid] ?? emptyActuals();
                  const isNext = p.uid === nextSetUid;
                  return (
                    <div
                      key={p.uid}
                      className={`grid grid-cols-[24px_1fr_1fr_1fr_1fr_auto] gap-2 items-center text-[12px] py-1.5 px-2 rounded border ${
                        logged
                          ? "border-[var(--positive)]/30 bg-[var(--positive)]/5"
                          : isNext
                          ? "border-[var(--accent,#6cf)]/40 bg-[var(--accent,#6cf)]/5"
                          : "border-[var(--hairline)]"
                      }`}
                    >
                      <span className="text-[10.5px] text-[var(--text-dim)] tabular-nums">#{p.set_idx}</span>
                      {logged ? (
                        <>
                          <span className="tabular-nums text-[var(--text-primary)]">
                            {logged.actual_weight_kg != null ? Math.round(logged.actual_weight_kg * LB_PER_KG) : "—"} lbs
                          </span>
                          <span className="tabular-nums text-[var(--text-primary)]">
                            {logged.actual_reps ?? "—"} reps
                          </span>
                          <span className="tabular-nums text-[var(--text-muted)]">
                            RIR {logged.actual_rir ?? "—"}
                          </span>
                          <span className="tabular-nums text-[var(--text-muted)]">
                            {logged.mcv_m_s != null ? `${logged.mcv_m_s.toFixed(2)} m/s` : ""}
                          </span>
                          <button
                            onClick={() => delMut.mutate(logged.id)}
                            className="text-[10px] text-[var(--text-faint)] hover:text-[var(--negative)] uppercase tracking-wider"
                          >
                            undo
                          </button>
                        </>
                      ) : (
                        <>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder={String(p.target_weight_lbs ?? "")}
                            value={draft.weight_lbs}
                            onChange={(e) => setDrafts((s) => ({ ...s, [p.uid]: { ...draft, weight_lbs: e.target.value } }))}
                            className="bg-transparent border border-[var(--hairline)] rounded px-2 py-1 text-[12px] tabular-nums focus:outline-none focus:border-[var(--text-muted)]"
                            aria-label="weight (lbs)"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder={String(p.target_reps ?? "")}
                            value={draft.reps}
                            onChange={(e) => setDrafts((s) => ({ ...s, [p.uid]: { ...draft, reps: e.target.value } }))}
                            className="bg-transparent border border-[var(--hairline)] rounded px-2 py-1 text-[12px] tabular-nums focus:outline-none focus:border-[var(--text-muted)]"
                            aria-label="reps"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder={p.target_rir != null ? `RIR ${p.target_rir}` : "RIR"}
                            value={draft.rir}
                            onChange={(e) => setDrafts((s) => ({ ...s, [p.uid]: { ...draft, rir: e.target.value } }))}
                            className="bg-transparent border border-[var(--hairline)] rounded px-2 py-1 text-[12px] tabular-nums focus:outline-none focus:border-[var(--text-muted)]"
                            aria-label="RIR"
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            placeholder="MCV m/s"
                            value={draft.mcv}
                            onChange={(e) => setDrafts((s) => ({ ...s, [p.uid]: { ...draft, mcv: e.target.value } }))}
                            className="bg-transparent border border-[var(--hairline)] rounded px-2 py-1 text-[11px] tabular-nums focus:outline-none focus:border-[var(--text-muted)]"
                            aria-label="MCV m/s (optional)"
                          />
                          <button
                            onClick={() => commit(p)}
                            disabled={logMut.isPending}
                            className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded bg-[var(--text-primary)] text-[var(--bg)] disabled:opacity-50 hover:opacity-90"
                          >
                            log
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}

      {totalCount > 0 && completedCount === totalCount && (
        <div className="mt-6 p-4 rounded-md border border-[var(--positive)]/40 bg-[var(--positive)]/5 text-center">
          <p className="text-[14px] text-[var(--positive)] font-medium">Session complete · {completedCount} sets logged</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Hevy will sync the canonical record. The retrospective auto-generates from the next chat refresh.
          </p>
        </div>
      )}

      <p className="mt-8 pt-3 text-[10.5px] text-[var(--text-dim)] leading-snug border-t border-[var(--hairline)]">
        <span className="text-[var(--text-muted)]">Autoregulation rules. </span>
        Reps in reserve (RIR) is the inverse of RPE — RIR 2 = RPE 8. The autoreg engine drops 5%
        when actual RIR is 1 below target, 10% when 2+ below; adds 2.5% when 2+ above. MCV under
        0.4 m/s on heavy lifts triggers a 5% cut (bar-speed loss = velocity-based fatigue signal).
        Rep miss ≥2 cuts 5%. Rounded to nearest 2.5 lbs.
      </p>
    </main>
  );
}
