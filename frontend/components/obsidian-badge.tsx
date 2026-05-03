/**
 * Branded badge for content sourced from Rob's Obsidian vault — use anywhere
 * the UI surfaces a research note, citation, or vault-derived insight.
 *
 * Mirrors the WHOOP "Powered by" treatment in `whoop-vitals.tsx`.
 */

export function ObsidianMark({
  size = 14,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/obsidian-mark.svg"
      alt="Obsidian"
      width={size}
      height={Math.round(size * 1.25)}
      className={`inline-block flex-shrink-0 ${className}`}
      style={{ filter: "drop-shadow(0 0 8px oklch(0.65 0.2 295 / 0.35))" }}
    />
  );
}

export function ObsidianWordmark({ height = 16 }: { height?: number }) {
  return (
    <img
      src="/obsidian-wordmark.svg"
      alt="Obsidian"
      className="block w-auto"
      style={{
        height,
        filter: "drop-shadow(0 0 10px oklch(0.65 0.2 295 / 0.30))",
      }}
    />
  );
}

export function ObsidianSourceTag({ source }: { source: string }) {
  // Strip .md extension and replace separators for readability.
  const label = source.replace(/\.md$/, "").replace(/[-_]/g, " ");
  return (
    <span
      className="inline-flex items-center gap-1.5 mr-1.5 mt-1 px-2 py-0.5 rounded-full text-[10.5px] text-[var(--text-muted)]"
      style={{
        border: "1px solid oklch(0.65 0.2 295 / 0.35)",
        background: "oklch(0.65 0.2 295 / 0.06)",
      }}
    >
      <ObsidianMark size={10} />
      <span>{label}</span>
    </span>
  );
}
