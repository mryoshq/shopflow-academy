"""Measure the outage of a redeployment (ADR-0038, docs/RUNBOOK.md).

Polls GET <base>/health/ready every 0.2 s (stdlib only, no credentials) and prints the longest run of failed
answers. Start it, redeploy in another terminal, then stop it with Ctrl+C:

    python3 scripts/ops/measure_downtime.py http://127.0.0.1:3080

Never touches the database, the tunnel or n8n; read-only.
"""

import signal
import sys
import time
import urllib.error
import urllib.request


def up(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:  # noqa: S310 (local health check)
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        return False


def stop(*_: object) -> None:
    raise KeyboardInterrupt


def main() -> int:
    signal.signal(signal.SIGTERM, stop)
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3080").rstrip("/")
    url = f"{base}/health/ready"
    down_since: float | None = None
    worst = 0.0
    gaps: list[float] = []
    print(f"Surveillance de {url} (Ctrl+C pour arrêter)")
    try:
        while True:
            now = time.monotonic()
            if up(url):
                if down_since is not None:
                    gap = now - down_since
                    gaps.append(gap)
                    worst = max(worst, gap)
                    print(f"  rétabli après {gap:.1f} s")
                    down_since = None
            elif down_since is None:
                down_since = now
                print("  indisponible…")
            time.sleep(0.2)
    except KeyboardInterrupt:
        pass
    if down_since is not None:
        gaps.append(time.monotonic() - down_since)
        worst = max(worst, gaps[-1])
        print("  toujours indisponible à l'arrêt")
    print(f"Coupures : {len(gaps)} ; plus longue : {worst:.1f} s ; total : {sum(gaps):.1f} s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
