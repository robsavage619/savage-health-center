from __future__ import annotations

"""Vault search — grep Rob's Obsidian knowledge graph from the API."""

import re
from pathlib import Path

from fastapi import APIRouter, Query

from shc.config import settings

router = APIRouter(tags=["vault"])

_CONTEXT_LINES = 4  # lines of surrounding context per match


def _search_file(path: Path, terms: list[str]) -> list[dict]:
    """Return match excerpts from a single vault note."""
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return []

    pattern = re.compile("|".join(re.escape(t) for t in terms), re.IGNORECASE)
    matches: list[dict] = []
    seen_ranges: set[tuple[int, int]] = set()

    for i, line in enumerate(lines):
        if pattern.search(line):
            start = max(0, i - _CONTEXT_LINES)
            end = min(len(lines), i + _CONTEXT_LINES + 1)
            key = (start, end)
            if key in seen_ranges:
                continue
            seen_ranges.add(key)
            excerpt = "\n".join(lines[start:end])
            matches.append({"line": i + 1, "excerpt": excerpt})

    return matches


@router.get("/vault/search")
async def vault_search(
    q: str = Query(..., min_length=2, description="Search terms (space-separated)"),
    limit: int = Query(default=10, gt=0, le=50),
) -> list[dict]:
    """Full-text search across all Obsidian vault notes.

    Returns matching notes with relevant excerpts. Useful for answering
    questions grounded in Rob's personal research knowledge graph.
    """
    vault_path = settings.vault_path
    if not vault_path.exists():
        return []

    terms = [t for t in q.split() if len(t) >= 2]
    if not terms:
        return []

    results: list[dict] = []
    for md_file in sorted(vault_path.rglob("*.md")):
        file_matches = _search_file(md_file, terms)
        if file_matches:
            relative = md_file.relative_to(vault_path)
            title = md_file.stem.replace("-", " ").replace("_", " ").title()
            # Extract H1 title if present
            try:
                for line in md_file.read_text(encoding="utf-8", errors="ignore").splitlines()[:10]:
                    if line.startswith("# "):
                        title = line[2:].strip()
                        break
            except OSError:
                pass
            results.append({
                "path": str(relative),
                "title": title,
                "matches": file_matches[:3],  # cap excerpts per file
                "match_count": len(file_matches),
            })
        if len(results) >= limit:
            break

    # Sort by match density
    results.sort(key=lambda r: -r["match_count"])
    return results[:limit]


@router.get("/vault/notes")
async def vault_notes(subdir: str | None = None) -> list[dict]:
    """List vault notes, optionally filtered to a subdirectory."""
    vault_path = settings.vault_path
    if not vault_path.exists():
        return []

    base = vault_path / subdir if subdir else vault_path
    notes = []
    for md_file in sorted(base.rglob("*.md")):
        relative = md_file.relative_to(vault_path)
        notes.append({
            "path": str(relative),
            "name": md_file.stem,
            "size_bytes": md_file.stat().st_size,
        })
    return notes
