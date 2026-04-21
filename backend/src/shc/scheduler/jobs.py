from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from shc.ingest import whoop

log = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler()
    return _scheduler


def register_jobs(scheduler: AsyncIOScheduler) -> None:
    scheduler.add_job(
        whoop.sync_all,
        "interval",
        minutes=30,
        id="whoop_sync",
        replace_existing=True,
        misfire_grace_time=300,
    )
    log.info("registered APScheduler jobs")
