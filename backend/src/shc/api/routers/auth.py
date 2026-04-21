from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from shc.ingest.whoop import exchange_code, get_auth_url

router = APIRouter(tags=["auth"])


@router.get("/whoop/login")
async def whoop_login() -> RedirectResponse:
    return RedirectResponse(get_auth_url())


@router.get("/whoop/callback")
async def whoop_callback(code: str, state: str) -> dict:
    try:
        await exchange_code(code, state)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "authorized"}
