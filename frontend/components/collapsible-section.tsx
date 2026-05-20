"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A labelled divider that expands its content on click. Detail/history
 * sections collapse by default so the dashboard leads with today's essentials.
 * Auto-expands when the page hash targets its id (so SectionNav can deep-link
 * into a collapsed section).
 */
export function CollapsibleSection({
  id,
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const openIfTargeted = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, [id]);

  return (
    <section id={id} className="scroll-mt-20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-1 py-2 text-left group"
      >
        <span
          className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-dim)] group-hover:text-[var(--text-muted)] transition-colors shrink-0"
          style={{ fontFamily: "var(--font-orbitron)" }}
        >
          {title}
        </span>
        {hint && <span className="text-[10px] text-[var(--text-faint)] tabular-nums shrink-0">{hint}</span>}
        <span className="flex-1 h-px bg-[var(--hairline)]" />
        <span className="text-[10px] text-[var(--text-dim)] group-hover:text-[var(--text-muted)] shrink-0">
          {open ? "▴ hide" : "▾ show"}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}
