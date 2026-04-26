"use client";

import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "@/components/ui/metric";

const API_BASE =
  process.env.NEXT_PUBLIC_SHC_API ?? "http://127.0.0.1:8000";

const STORAGE_KEY = "shc:health-story:v1";

type Cached = {
  date: string;
  generated_at: string;
  text: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadCached(): Cached | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (c.date !== todayISO()) return null;
    return c;
  } catch {
    return null;
  }
}

function saveCached(c: Cached) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    // ignore quota / private mode
  }
}

export function HealthStory() {
  const [text, setText] = useState<string>("");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const c = loadCached();
    if (c) {
      setText(c.text);
      setGeneratedAt(c.generated_at);
    }
  }, []);

  async function generate() {
    if (streaming) return;
    setError(null);
    setText("");
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let buf = "";

    try {
      const res = await fetch(`${API_BASE}/api/health-story`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "text") {
              buf += ev.text;
              setText(buf);
            } else if (ev.type === "error") {
              setError(ev.text);
            }
          } catch {
            // skip malformed
          }
        }
      }
      const now = new Date().toISOString();
      setGeneratedAt(now);
      saveCached({ date: todayISO(), generated_at: now, text: buf });
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        setError(e.message);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function abort() {
    abortRef.current?.abort();
  }

  const hasContent = text.length > 0;
  const ageLabel = generatedAt
    ? new Date(generatedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="shc-card shc-enter overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-[var(--hairline)]">
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
          {streaming ? (
            <button
              type="button"
              onClick={abort}
              className="btn btn-secondary text-[11px]"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={generate}
              className="btn btn-primary text-[11px]"
            >
              {hasContent ? "Regenerate" : "Generate"}
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-5">
        {error && (
          <div className="mb-3 rounded-md border border-[var(--negative)] bg-[oklch(0.7_0.18_25_/_0.06)] px-3 py-2 text-[12px] text-[var(--negative)]">
            {error}
          </div>
        )}

        {!hasContent && !streaming && !error && (
          <p className="text-[12.5px] text-[var(--text-muted)] leading-relaxed">
            Click <span className="text-[var(--text-primary)] font-medium">Generate</span> to
            produce a longform narrative analysis. The advisor pulls live
            biometric data and the research notes from your vault, then synthesizes
            them into a story about where your body is and where it's going.
          </p>
        )}

        {(hasContent || streaming) && (
          <article className="prose-narrative text-[14px] leading-[1.7] text-[var(--text-primary)] space-y-4">
            {text.split(/\n\n+/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            {streaming && (
              <span
                className="inline-block w-1.5 h-[14px] bg-[var(--text-primary)] align-middle ml-0.5 animate-pulse"
                aria-label="generating"
              />
            )}
          </article>
        )}
      </div>
    </div>
  );
}
