"""Web Push without payload (sprint 2, part H, ADR-0023).

The server only "tickles" the browser: the push carries no content, so no message text
ever transits through a push service. The service worker then fetches the user's unread
notifications from the API (same origin, session cookie) and shows them.

* VAPID keys come from the environment (``VAPID_PUBLIC_KEY``, ``VAPID_PRIVATE_KEY``,
  generated locally by ``scripts/vapid_keys.py`` into ``.env``, never committed). Without
  them, Web Push is simply off and the in-page notifications keep working.
* Endpoints are limited to the known push services (no request to an arbitrary URL).
"""

from __future__ import annotations

import base64
import json
import logging
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings

log = logging.getLogger("academy.webpush")
PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com", ".push.apple.com", ".notify.windows.com")
MAX_FAILURES = 5


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64url(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def allowed_endpoint(endpoint: str) -> bool:
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    return (parts.scheme == "https" and parts.port in (None, 443) and len(endpoint) <= 600
            and any(host == item or (item.startswith(".") and host.endswith(item)) for item in PUSH_HOSTS))


def enabled() -> bool:
    settings = get_settings()
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def vapid_header(endpoint: str, now: float | None = None) -> str:
    """``Authorization: vapid t=<JWT ES256>, k=<public key>`` for the push service of ``endpoint``."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

    settings = get_settings()
    parts = urlsplit(endpoint)
    claims = {"aud": f"{parts.scheme}://{parts.netloc}", "exp": int((now or time.time()) + 12 * 3600),
              "sub": settings.vapid_subject or settings.app_base_url}
    signing_input = f"{b64url(json.dumps({'typ': 'JWT', 'alg': 'ES256'}).encode())}.{b64url(json.dumps(claims).encode())}"
    key = ec.derive_private_key(int.from_bytes(unb64url(settings.vapid_private_key), "big"), ec.SECP256R1())
    r, s = decode_dss_signature(key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA256())))
    token = f"{signing_input}.{b64url(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"
    return f"vapid t={token}, k={settings.vapid_public_key}"


def send_one(endpoint: str) -> int:
    """POST an empty push; returns the HTTP status (0 when unreachable)."""
    request = Request(endpoint, data=b"", method="POST", headers={
        "Authorization": vapid_header(endpoint), "TTL": "300", "Urgency": "high", "Content-Length": "0"})
    try:
        with urlopen(request, timeout=5) as response:  # noqa: S310 (endpoint checked by allowed_endpoint)
            return response.status
    except HTTPError as error:
        return error.code
    except (URLError, OSError, ValueError):
        return 0


def push_to(engine, user_ids: list[int]) -> None:
    """Tickle every browser of these users, in a background thread (never blocks a request)."""
    if not enabled() or not user_ids:
        return

    def run() -> None:
        from app.models import PushSubscription

        with Session(engine) as db:
            for item in db.scalars(select(PushSubscription).where(PushSubscription.user_id.in_(sorted(set(user_ids))))).all():
                if not allowed_endpoint(item.endpoint):
                    db.delete(item)
                    continue
                status = send_one(item.endpoint)
                if status in (404, 410):
                    db.delete(item)  # unsubscribed or expired
                elif not 200 <= status < 300:
                    item.failures += 1
                    if item.failures >= MAX_FAILURES:
                        db.delete(item)
                else:
                    item.failures = 0
            db.commit()

    threading.Thread(target=run, name="webpush", daemon=True).start()
