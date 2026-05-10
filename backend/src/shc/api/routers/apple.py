from __future__ import annotations

import hashlib
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import APIKeyHeader

from shc.config import settings
from shc.ingest.apple import _store_hae

log = logging.getLogger(__name__)

router = APIRouter(tags=["apple"])

_key_header = APIKeyHeader(name="X-SHC-Key", auto_error=False)


def _require_key(key: Annotated[str | None, Depends(_key_header)]) -> None:
    """Reject requests that don't carry the configured webhook key."""
    if not settings.apple_webhook_key:
        raise HTTPException(status_code=503, detail="apple_webhook_key not configured")
    if key != settings.apple_webhook_key:
        raise HTTPException(status_code=401, detail="invalid key")


@router.post("/apple/hae", dependencies=[Depends(_require_key)])
async def apple_hae_webhook(request: Request) -> dict[str, Any]:
    """Receive a Health Auto Export JSON payload and upsert into measurements.

    Health Auto Export → Settings → Automations → add REST API export →
    set URL to http://<tailscale-host>:8000/api/apple/hae, add header
    X-SHC-Key: <apple_webhook_key>.

    Payload shape (HAE default):
        {"data": {"Heart Rate Variability": [{"date": "...", "qty": 45.2, "units": "ms"}]}}
    """
    try:
        data = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid JSON: {exc}") from exc

    content_hash = hashlib.sha256(await request.body()).hexdigest()[:16]

    try:
        await _store_hae(data, content_hash)
    except Exception as exc:
        log.exception("HAE webhook ingest failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    metrics = data.get("data", {})
    metric_count = len(metrics) if isinstance(metrics, dict) else 0
    sample_count = (
        sum(len(v) for v in metrics.values() if isinstance(v, list))
        if isinstance(metrics, dict)
        else 0
    )
    log.info("HAE webhook: %d metrics, %d samples", metric_count, sample_count)
    return {"ok": True, "metrics": metric_count, "samples": sample_count}
