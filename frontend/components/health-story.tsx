"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/ui/metric";
import { ObsidianMark, ObsidianSourceTag } from "@/components/obsidian-badge";

// Highlights key biometric figures inline (HRV, sigma, scores, percentages, ACWR values)
function HighlightFigures({ text }: { text: string }) {
  const parts = text.split(/([\+\-]?\d+\.?\d*σ|\d{2,3}\/100|[\+\-]?\d+\.?\d+%|\d+\.?\d*\s*ms\b|\bACWR\s+\d+\.\d+|\d+\.\d+σ)/g);
  return (
    <>
      {parts.map((part, i) =>
        /[\+\-]?\d+\.?\d*σ|\d{2,3}\/100|[\+\-]?\d+\.?\d+%|\d+\.?\d*\s*ms\b|\bACWR\s+\d+\.\d+/.test(part) ? (
          <span
            key={i}
            className="font-medium tabular-nums"
            style={{ color: "oklch(0.88 0.18 145)" }}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// Section labels inferred from paragraph position (narratives follow a consistent structure)
const PARA_LABELS = [
  "Readiness",
  "Training load",
  "Today's focus",
  "Goals & nutrition",
  "Trajectory",
];

function StoryNarrative({
  narrative,
  sources,
}: {
  narrative: string;
  sources?: string[];
}) {
  const paras = narrative.split(/\n\n+/).filter(Boolean);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? paras : paras.slice(0, 2);

  return (
    <article>
      {/* Lede paragraph */}
      {paras[0] && (
        <div
          className="pl-3 mb-5"
          style={{ borderLeft: "2px solid oklch(0.88 0.18 145 / 0.6)" }}
        >
          <p className="text-[14.5px] leading-[1.8] text-[var(--text-primary)] font-[430]">
            <HighlightFigures text={paras[0]} />
          </p>
        </div>
      )}

      {/* Body paragraphs */}
      {visible.slice(1).map((para, i) => {
        const idx = i + 1;
        const label = PARA_LABELS[idx] ?? `Note ${idx + 1}`;
        return (
          <div key={idx} className="mb-4">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span
                className="text-[9px] font-semibold uppercase tracking-widest shrink-0"
                style={{ color: "oklch(0.88 0.18 145 / 0.7)" }}
              >
                {label}
              </span>
              <div className="h-px flex-1 bg-[var(--hairline)]" />
            </div>
            <p className="text-[13px] leading-[1.75] text-[var(--text-muted)]">
              <HighlightFigures text={para} />
            </p>
          </div>
        );
      })}

      {paras.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors mt-1"
        >
          {expanded ? "↑ Show less" : `↓ ${paras.length - 2} more sections`}
        </button>
      )}

      {sources && sources.length > 0 && (
        <div className="pt-3 mt-4 border-t border-[var(--hairline)]">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-dim)] mr-2 align-middle">
            <ObsidianMark size={11} />
            Vault sources
          </span>
          {sources.map((s, i) => (
            <ObsidianSourceTag key={i} source={s} />
          ))}
        </div>
      )}
    </article>
  );
}

const STORY_PROMPT = `Generate Rob's daily health story AND today's workout plan in a single pass.

STEP 1 — Read context.
- GET http://127.0.0.1:8000/api/briefing/context for live biometrics (recovery, HRV, sleep, gates) AND today's most-relevant vault notes (selected server-side based on signals like HRV anomaly, high ACWR, deload, illness).
- GET http://127.0.0.1:8000/api/workout/context for training history (also includes the ranked vault notes).
- Both responses already contain a "## VAULT RESEARCH" section — do not read files from disk.

STEP 2 — Write the narrative health story.
4–6 paragraphs of clear prose addressed to Rob in second person. Lead with the most important signal of the moment, not chronology. Cite specific numbers (recovery score, HRV deviation σ, ACWR, sleep totals) but anchor them to meaning, not just the number. Weave vault research in naturally by source name (the filename in parentheses after each note title) where relevant. End with one paragraph on near-term trajectory: what the next 1–2 weeks should look like.
Constraints: no "as your AI advisor" framing. No motivational filler. Never imply chronic propranolol use — it is PRN/occasional, reference only if today's check-in shows it was taken. Never invent metrics not in the live context. Note any "DATA AGES" / "DATA GAPS" entries before drawing strong conclusions from stale numbers.
POST to http://127.0.0.1:8000/api/health-story with body { "narrative": "<text>", "sources": [<vault filenames cited>], "model": "claude-sonnet-4-6" }.

STEP 3 — Generate today's workout plan.
Single JSON object. Optimize for body recomposition (strength + fat loss). Real exercise names and weights from Rob's history. Apply GREEN/YELLOW/RED intensity matrix per recovery score. Always include a metabolic finisher (or Z2 walk on red days).
POST to http://127.0.0.1:8000/api/workout/plan with body { "plan": <plan>, "source": "claude_code", "push_to_hevy": false }.

Confirm both POSTs succeeded.`;

type SyncCounts = { recovery: number; sleep: number; workout: number };
type SyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "ok"; counts?: SyncCounts }
  | { kind: "err"; msg: string };

interface StoryData {
  story_date?: string;
  generated_at?: string;
  model?: string;
  narrative?: string;
  sources?: string[];
}

export function HealthStory() {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [sync, setSync] = useState<SyncState>({ kind: "idle" });

  const storyQ = useQuery<StoryData>({
    queryKey: ["health-story"],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SHC_API ?? "http://127.0.0.1:8000"}/api/health-story`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as StoryData;
    },
  });

  const story = storyQ.data;
  const hasContent = !!story?.narrative;

  function handleCopyPrompt() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(STORY_PROMPT)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        })
        .catch(() => fallbackCopy());
    } else {
      fallbackCopy();
    }
  }

  function fallbackCopy() {
    const el = document.createElement("textarea");
    el.value = STORY_PROMPT;
    el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      setShowPrompt(true);
    }
  }

  async function handleSync() {
    setSync({ kind: "syncing" });
    try {
      const result = await api.syncAll();
      await qc.invalidateQueries();
      const counts = result?.whoop?.counts as SyncCounts | undefined;
      setSync({ kind: "ok", counts });
      setTimeout(() => setSync({ kind: "idle" }), 5000);
    } catch (e) {
      setSync({ kind: "err", msg: e instanceof Error ? e.message : "sync failed" });
      setTimeout(() => setSync({ kind: "idle" }), 4000);
    }
  }

  const ageLabel = story?.generated_at
    ? new Date(story.generated_at).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="shc-card shc-enter overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-[var(--hairline)] flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: "oklch(0.88 0.18 145 / 0.18)",
              color: "oklch(0.88 0.18 145)",
            }}
          >
            AI
          </span>
          <div className="min-w-0">
            <Eyebrow>Your story</Eyebrow>
            <p className="mt-0.5 text-[13px] text-[var(--text-primary)]">
              Narrative briefing — metrics + research synthesized into one read
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {ageLabel && (
            <span className="text-[10px] text-[var(--text-faint)] tabular-nums hidden sm:inline">
              {ageLabel}
            </span>
          )}

          <button
            type="button"
            onClick={handleCopyPrompt}
            className={copied ? "btn btn-primary text-[11px]" : "btn btn-secondary text-[11px]"}
            title="Step 1 — copy prompt, paste into Claude Code to generate today's story"
          >
            <span className="text-[10px] mr-1 text-[var(--text-faint)]">1</span>
            {copied ? "✓ Prompt copied" : "✦ Copy CC prompt"}
          </button>

          <button
            type="button"
            onClick={handleSync}
            disabled={sync.kind === "syncing"}
            className={sync.kind === "ok" ? "btn btn-primary text-[11px]" : "btn btn-secondary text-[11px]"}
            title="Step 2 — pull latest WHOOP + Hevy + AI story from the API"
          >
            <span className="text-[10px] mr-1 text-[var(--text-faint)]">2</span>
            <span
              className={sync.kind === "syncing" ? "animate-spin inline-block" : ""}
              style={sync.kind === "err" ? { color: "var(--negative)" } : undefined}
            >
              {sync.kind === "ok" ? "✓" : sync.kind === "err" ? "✗" : "↻"}
            </span>{" "}
            {sync.kind === "syncing"
              ? "Syncing…"
              : sync.kind === "ok"
              ? sync.counts
                ? `${sync.counts.recovery}r · ${sync.counts.sleep}s · ${sync.counts.workout}w`
                : "Synced"
              : sync.kind === "err"
              ? "Failed"
              : "Sync"}
          </button>
        </div>
      </div>

      <div className="px-5 py-5">
        {showPrompt && (
          <div className="mb-3 rounded-md border border-[var(--hairline-strong)] bg-[var(--surface-1)] p-3">
            <p className="text-[10.5px] text-[var(--text-dim)] uppercase tracking-wider mb-1.5">
              Copy this prompt manually
            </p>
            <pre className="whitespace-pre-wrap text-[11px] text-[var(--text-primary)] leading-relaxed">
              {STORY_PROMPT}
            </pre>
          </div>
        )}

        {storyQ.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shc-skeleton h-[14px]" />
            ))}
          </div>
        )}

        {!storyQ.isLoading && !hasContent && (
          <div className="text-[12.5px] text-[var(--text-muted)] leading-relaxed space-y-2">
            <p>
              No story yet for today. Click{" "}
              <span className="text-[var(--text-primary)] font-medium">Copy CC prompt</span>,
              paste into Claude Code, then hit{" "}
              <span className="text-[var(--text-primary)] font-medium">Sync</span> to pull
              it back.
            </p>
            <p className="text-[var(--text-faint)]">
              Claude reads your live biometrics + vault research, writes a
              narrative analysis, and POSTs it to /api/health-story. Sync pulls it
              alongside WHOOP and Hevy data.
            </p>
          </div>
        )}

        {hasContent && (
          <StoryNarrative narrative={story.narrative!} sources={story.sources} />
        )}
      </div>
    </div>
  );
}
