"""Comfort features (sprint 2, part I, ADR-0024): the optional « radio » streams.

Streams are set on the server (``RADIO_STREAMS``, JSON list of {"label", "url"}), empty by default:
nothing is shown or loaded until the owner adds some. Only YouTube embeds from the privacy-enhanced
host (www.youtube-nocookie.com/embed/<id>) are accepted, the one third-party host the CSP allows in
frames; any other entry is ignored. The page loads a stream only when the user presses « Écouter »,
muted, and never on the API's behalf.
"""

from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, Depends, Response

from app.auth import AuthContext, require_member
from app.config import get_settings

router = APIRouter(prefix="/api/v1", tags=["comfort"])
log = logging.getLogger("academy.comfort")
EMBED = re.compile(r"^https://www\.youtube-nocookie\.com/embed/([A-Za-z0-9_-]{6,20})$")
MAX_STREAMS = 5


def radio_streams(raw: str) -> list[dict]:
    try:
        items = json.loads(raw) if raw.strip() else []
    except json.JSONDecodeError:
        log.warning("RADIO_STREAMS is not valid JSON: radio off")
        return []
    streams = []
    for item in items if isinstance(items, list) else []:
        label = str(item.get("label", "")).strip() if isinstance(item, dict) else ""
        match = EMBED.match(str(item.get("url", "")).strip()) if isinstance(item, dict) else None
        if not match or not label or len(label) > 60 or "<" in label:
            log.warning("RADIO_STREAMS entry ignored (YouTube nocookie embed and a plain label only)")
            continue
        streams.append({"id": match.group(1), "label": label, "url": f"https://www.youtube-nocookie.com/embed/{match.group(1)}"})
        if len(streams) == MAX_STREAMS:
            break
    return streams


@router.get("/radio")
def radio(response: Response, auth: AuthContext = Depends(require_member)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return {"streams": radio_streams(get_settings().radio_streams)}
