"""Comfort features (ADR-0024, radio revised on 30/10/2026): the optional « radio » streams.

Streams are set on the server (``RADIO_STREAMS``, JSON list of {"label", "url"}), empty by default:
nothing is shown or loaded until the owner adds some. Only direct HTTPS audio streams from the hosts
the gateway CSP allows in ``media-src`` (``RADIO_HOSTS``) are accepted; any other entry is ignored.
The browser plays the stream itself, only after « Lecture »: the server never relays it.
"""

from __future__ import annotations

import json
import logging
import re
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Response

from app.auth import AuthContext, require_member
from app.config import get_settings

router = APIRouter(prefix="/api/v1", tags=["comfort"])
log = logging.getLogger("academy.comfort")
# Must match `media-src` in gateway/nginx.conf (checked by tests/test_comfort.py).
RADIO_HOSTS = ("stream.nightride.fm", "radio.plaza.one")
PATH = re.compile(r"^/[A-Za-z0-9._/-]{1,80}$")
MAX_STREAMS = 5


def stream_url(raw: str) -> str | None:
    """The URL when it is a plain https stream on an allowed host (no credentials, query, fragment or port)."""
    try:
        parts = urlsplit(raw)
    except ValueError:
        return None
    if (parts.scheme != "https" or parts.hostname not in RADIO_HOSTS or parts.port is not None or parts.username
            or parts.password or parts.query or parts.fragment or not PATH.match(parts.path) or ".." in parts.path):
        return None
    return f"https://{parts.hostname}{parts.path}"


def radio_streams(raw: str) -> list[dict]:
    try:
        items = json.loads(raw) if raw.strip() else []
    except json.JSONDecodeError:
        log.warning("RADIO_STREAMS is not valid JSON: radio off")
        return []
    streams = []
    for item in items if isinstance(items, list) else []:
        label = str(item.get("label", "")).strip() if isinstance(item, dict) else ""
        url = stream_url(str(item.get("url", "")).strip()) if isinstance(item, dict) else None
        if not url or not label or len(label) > 60 or "<" in label:
            log.warning("RADIO_STREAMS entry ignored (https stream on %s and a plain label only)", ", ".join(RADIO_HOSTS))
            continue
        streams.append({"id": f"radio-{len(streams) + 1}", "label": label, "url": url})
        if len(streams) == MAX_STREAMS:
            break
    return streams


@router.get("/radio")
def radio(response: Response, auth: AuthContext = Depends(require_member)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return {"streams": radio_streams(get_settings().radio_streams)}
