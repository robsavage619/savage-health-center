from __future__ import annotations

import asyncio
import json
import logging

import anthropic
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from shc.ai.briefing import CHAT_SYSTEM, build_daily_context
from shc.ai.workout_planner import get_vault_research
from shc.config import settings
from shc.db.schema import get_read_conn

router = APIRouter(tags=["chat"])
log = logging.getLogger(__name__)

MODEL = "claude-opus-4-7"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


def _build_system(conn) -> list[dict]:
    """Build the system prompt blocks: static clinical profile + live data."""
    live_context = build_daily_context(conn)
    return [
        {
            "type": "text",
            "text": CHAT_SYSTEM,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": live_context,
        },
    ]


async def _stream_response(messages: list[dict]):
    if not settings.anthropic_api_key:
        yield "data: " + json.dumps({
            "type": "error",
            "text": "Advisor not configured — add ANTHROPIC_API_KEY to shc.env",
        }) + "\n\n"
        return

    conn = get_read_conn()
    try:
        system = _build_system(conn)
    finally:
        conn.close()

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    def _run_stream():
        try:
            with client.messages.stream(
                model=MODEL,
                max_tokens=1024,
                system=system,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    asyncio.run_coroutine_threadsafe(queue.put(text), loop)
        except Exception as e:
            asyncio.run_coroutine_threadsafe(
                queue.put(json.dumps({"__error": str(e)})), loop
            )
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

    thread = loop.run_in_executor(None, _run_stream)

    while True:
        chunk = await queue.get()
        if chunk is None:
            break
        if isinstance(chunk, str) and chunk.startswith('{"__error":'):
            yield "data: " + json.dumps({"type": "error", "text": json.loads(chunk)["__error"]}) + "\n\n"
            break
        yield "data: " + json.dumps({"type": "text", "text": chunk}) + "\n\n"

    yield "data: " + json.dumps({"type": "done"}) + "\n\n"
    await thread


@router.post("/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    return StreamingResponse(
        _stream_response(messages),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Health story ─────────────────────────────────────────────────────────────

HEALTH_STORY_SYSTEM = """\
You are Rob Savage's personal health historian. Your job is to write a
narrative briefing — not bullets, not a dashboard — that synthesizes his
recent biometrics, training history, and the relevant research from his
knowledge vault into a coherent story about where his body is right now,
how he got here, and what the trajectory implies.

## Voice and structure
- Write in clear, direct prose. 4–6 paragraphs. No headings unless a
  natural section break demands it. No bullet lists.
- Address Rob in second person ("you").
- Lead with the most important signal of the moment, not chronology.
- Cite specific numbers from his data — recovery scores, HRV deviations,
  ACWR, sleep totals — but always anchor them to meaning, not just the
  number. ("Your recovery is 73 today" is weak; "Your recovery sits at
  73 — solidly in the green band where heavy compound work is well
  tolerated" is the bar.)
- When a vault research note is relevant, weave it in naturally. Reference
  the source by name (e.g. "the Gabbett ACWR work") rather than as a
  citation footnote.
- If something is concerning, name it directly and say what to watch.
- End with one paragraph on near-term trajectory: what the next 1–2 weeks
  should look like given the current state.

## What NOT to do
- No "as your AI advisor I think…" framing. Just speak.
- No motivational filler ("keep up the great work!"). Be a thoughtful
  observer, not a cheerleader.
- Never imply chronic propranolol use. It is PRN / occasional. Reference
  it only if the live data shows it was taken today and the gates fired.
- Never invent metrics that aren't in the live context.
"""


@router.post("/health-story")
async def health_story() -> StreamingResponse:
    """Stream a longform narrative analysis of Rob's current state."""
    return StreamingResponse(
        _stream_health_story(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_health_story():
    if not settings.anthropic_api_key:
        yield "data: " + json.dumps({
            "type": "error",
            "text": "Health story requires ANTHROPIC_API_KEY in shc.env",
        }) + "\n\n"
        return

    conn = get_read_conn()
    try:
        live_context = build_daily_context(conn)
    finally:
        conn.close()

    try:
        vault = get_vault_research()
    except Exception as e:
        log.warning("Vault load failed: %s", e)
        vault = "Vault not available."

    system = [
        {
            "type": "text",
            "text": HEALTH_STORY_SYSTEM,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": f"## Research vault\n\n{vault}",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": f"## Live data snapshot\n\n{live_context}",
        },
    ]

    user_prompt = (
        "Write the narrative health briefing for today. Synthesize the live "
        "data with the relevant vault research into a coherent story about "
        "where my body is right now, what's been happening over the last "
        "few weeks, and what the next 1–2 weeks should look like."
    )

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    def _run_stream():
        try:
            with client.messages.stream(
                model=MODEL,
                max_tokens=2048,
                system=system,
                messages=[{"role": "user", "content": user_prompt}],
            ) as stream:
                for text in stream.text_stream:
                    asyncio.run_coroutine_threadsafe(queue.put(text), loop)
        except Exception as e:
            asyncio.run_coroutine_threadsafe(
                queue.put(json.dumps({"__error": str(e)})), loop
            )
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

    thread = loop.run_in_executor(None, _run_stream)

    while True:
        chunk = await queue.get()
        if chunk is None:
            break
        if isinstance(chunk, str) and chunk.startswith('{"__error":'):
            yield "data: " + json.dumps({"type": "error", "text": json.loads(chunk)["__error"]}) + "\n\n"
            break
        yield "data: " + json.dumps({"type": "text", "text": chunk}) + "\n\n"

    yield "data: " + json.dumps({"type": "done"}) + "\n\n"
    await thread
