from __future__ import annotations

import contextlib
import logging

import keyring

log = logging.getLogger(__name__)

_SERVICE_PREFIX = "shc"


def _service(source: str, kind: str, version: int = 1) -> str:
    return f"{_SERVICE_PREFIX}.{source}.{kind}.v{version}"


def store_token(source: str, kind: str, value: str, version: int = 1) -> None:
    keyring.set_password(_service(source, kind, version), source, value)
    log.debug("stored %s/%s in Keychain", source, kind)


def load_token(source: str, kind: str, version: int = 1) -> str | None:
    return keyring.get_password(_service(source, kind, version), source)


def delete_token(source: str, kind: str, version: int = 1) -> None:
    with contextlib.suppress(keyring.errors.PasswordDeleteError):
        keyring.delete_password(_service(source, kind, version), source)


def purge_all(source: str) -> None:
    """Remove all versioned tokens for a source (use shc auth purge CLI)."""
    for kind in ("access_token", "refresh_token"):
        for v in range(1, 5):
            delete_token(source, kind, version=v)
    log.info("purged all tokens for %s", source)
