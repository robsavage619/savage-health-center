from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import duckdb

from shc.config import settings

log = logging.getLogger(__name__)

_write_lock: asyncio.Lock | None = None
_write_conn: duckdb.DuckDBPyConnection | None = None

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def _apply_migrations(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version "
        "(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    )
    applied: set[int] = {
        r[0] for r in conn.execute("SELECT version FROM schema_version").fetchall()
    }
    for path in _migration_files():
        version = int(path.stem.split("_")[0])
        if version in applied:
            continue
        log.info("applying migration %s", path.name)
        conn.execute(path.read_text())
        log.info("migration %s applied", path.name)


def init_db() -> None:
    """Open write connection, apply migrations, configure encryption key."""
    global _write_conn, _write_lock
    db_path = settings.db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = duckdb.connect(str(db_path))
    encryption_key = settings.db_encryption_key
    if encryption_key:
        conn.execute(f"PRAGMA key='{encryption_key}'")

    _apply_migrations(conn)
    _write_conn = conn
    _write_lock = asyncio.Lock()
    log.info("DuckDB ready at %s", db_path)


def get_write_conn() -> duckdb.DuckDBPyConnection:
    assert _write_conn is not None, "init_db() not called"
    return _write_conn


def get_write_lock() -> asyncio.Lock:
    assert _write_lock is not None, "init_db() not called"
    return _write_lock


def get_read_conn() -> duckdb.DuckDBPyConnection:
    """Return a cursor on the shared write connection — safe for concurrent reads."""
    assert _write_conn is not None, "init_db() not called"
    return _write_conn.cursor()


@asynccontextmanager
async def write_ctx():
    """Async context manager that serializes writes through the global lock."""
    lock = get_write_lock()
    async with lock:
        yield get_write_conn()
