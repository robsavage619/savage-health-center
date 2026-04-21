from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import shutil
import time
from pathlib import Path

from watchdog.events import FileClosedEvent, FileSystemEventHandler
from watchdog.observers import Observer

from shc.config import settings
from shc.db.schema import write_ctx

log = logging.getLogger(__name__)

_DEBOUNCE_S = 2.0
_SIZE_STABLE_S = 1.0


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def _size_stable(path: Path) -> bool:
    """Return True if file size hasn't changed in _SIZE_STABLE_S seconds."""
    s1 = path.stat().st_size
    time.sleep(_SIZE_STABLE_S)
    s2 = path.stat().st_size
    return s1 == s2


class _HAEHandler(FileSystemEventHandler):
    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._pending: dict[str, asyncio.TimerHandle] = {}

    def on_closed(self, event: FileClosedEvent) -> None:  # type: ignore[override]
        path = Path(event.src_path)
        if path.suffix.lower() not in (".json", ".csv"):
            return
        key = str(path)
        if key in self._pending:
            self._pending[key].cancel()
        handle = self._loop.call_later(_DEBOUNCE_S, self._process, path)
        self._pending[key] = handle

    def _process(self, path: Path) -> None:
        self._pending.pop(str(path), None)
        asyncio.run_coroutine_threadsafe(_ingest_file(path), self._loop)


async def _ingest_file(path: Path) -> None:
    if not path.exists():
        return
    if not _size_stable(path):
        log.warning("HAE file %s still growing, skipping", path.name)
        return

    processing_dir = settings.data_dir / "hae_processing"
    processing_dir.mkdir(parents=True, exist_ok=True)
    dest = processing_dir / path.name
    shutil.move(str(path), dest)

    try:
        raw = dest.read_bytes()
        content_hash = _hash_bytes(raw)
        data = json.loads(raw)
        await _store_hae(data, content_hash)
        log.info("ingested HAE file %s", path.name)
    except json.JSONDecodeError:
        log.exception("failed to parse HAE file %s", dest)
    finally:
        dest.unlink(missing_ok=True)


async def _store_hae(data: dict, content_hash: str) -> None:
    """Parse HealthAutoExport JSON and upsert into measurements."""
    metrics = data.get("data", {})
    if not isinstance(metrics, dict):
        return

    async with write_ctx() as conn:
        for metric_name, entries in metrics.items():
            if not isinstance(entries, list):
                continue
            for entry in entries:
                ts = entry.get("date") or entry.get("startDate")
                value = entry.get("qty") or entry.get("value")
                unit = entry.get("units", "")
                if ts is None or value is None:
                    continue
                external_id = f"hae:{metric_name}:{ts}"
                row_hash = hashlib.sha256(f"{metric_name}{ts}{value}".encode()).hexdigest()[:16]
                conn.execute(
                    """
                    INSERT INTO measurements
                        (source, metric, ts, value_num, unit, external_id, content_hash)
                    VALUES ('apple_health', $metric, $ts, $value, $unit, $ext_id, $hash)
                    ON CONFLICT (source, metric, ts, external_id) DO NOTHING
                    """,
                    {
                        "metric": metric_name,
                        "ts": ts,
                        "value": float(value) if isinstance(value, (int, float, str)) else None,
                        "unit": unit,
                        "ext_id": external_id,
                        "hash": row_hash,
                    },
                )


_observer: Observer | None = None


def start_watcher(loop: asyncio.AbstractEventLoop) -> None:
    global _observer
    watch_dir = settings.hae_dir
    watch_dir.mkdir(parents=True, exist_ok=True)
    handler = _HAEHandler(loop)
    _observer = Observer()
    _observer.schedule(handler, str(watch_dir), recursive=False)
    _observer.start()
    log.info("watching HAE folder %s", watch_dir)


def stop_watcher() -> None:
    if _observer:
        _observer.stop()
        _observer.join()
