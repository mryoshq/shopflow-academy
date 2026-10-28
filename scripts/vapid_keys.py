#!/usr/bin/env python3
"""Generate the Web Push (VAPID) keys once, into .env (ADR-0023).

    python3 scripts/vapid_keys.py            # adds VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to .env if missing

The private key is written to .env only (mode 600), never printed and never committed.
Existing keys are kept: changing them would invalidate every browser subscription.
Needs the `cryptography` package (installed in the backend image):
    docker compose run --rm --no-deps -v "$PWD:/repo" -w /repo backend python scripts/vapid_keys.py
"""

from __future__ import annotations

import base64
import os
from pathlib import Path
import sys

ENV = Path(__file__).resolve().parents[1] / ".env"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def main() -> int:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    lines = ENV.read_text(encoding="utf-8").splitlines() if ENV.exists() else []
    present = {line.split("=", 1)[0] for line in lines if "=" in line and line.split("=", 1)[1].strip()}
    if {"VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"} <= present:
        print("VAPID keys already present in .env: kept.")
        return 0
    key = ec.generate_private_key(ec.SECP256R1())
    public = b64url(key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
    private = b64url(key.private_numbers().private_value.to_bytes(32, "big"))
    kept = [line for line in lines if not line.startswith(("VAPID_PUBLIC_KEY=", "VAPID_PRIVATE_KEY="))]
    ENV.write_text("\n".join(kept + [f"VAPID_PUBLIC_KEY={public}", f"VAPID_PRIVATE_KEY={private}"]) + "\n", encoding="utf-8")
    os.chmod(ENV, 0o600)
    print("VAPID keys written to .env (private key not shown). Restart: docker compose up -d --wait backend")
    return 0


if __name__ == "__main__":
    sys.exit(main())
