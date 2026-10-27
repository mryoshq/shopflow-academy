"""Seed the Compose development DB and copy credentials outside Git/logs."""

import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local"
TARGET = LOCAL / "demo-credentials.json"
CONTAINER_PATH = "/tmp/academy-demo-credentials.json"


def main() -> None:
    if TARGET.exists():
        raise SystemExit("Local credentials file already exists; left unchanged")
    run = subprocess.run(
        ["docker", "compose", "exec", "-T", "backend", "python", "-m", "app.seed_demo", "--output", CONTAINER_PATH],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    result = json.loads(run.stdout)
    if result["created"] == 0:
        raise SystemExit("No new demo accounts; previous credentials cannot be recovered")
    LOCAL.mkdir(mode=0o700, exist_ok=True)
    try:
        subprocess.run(["docker", "compose", "cp", f"backend:{CONTAINER_PATH}", str(TARGET)], cwd=ROOT, capture_output=True, check=True)
        TARGET.chmod(0o600)
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Credential copy failed; recover {CONTAINER_PATH} from the backend container before retrying") from exc
    subprocess.run(["docker", "compose", "exec", "-T", "backend", "rm", "-f", CONTAINER_PATH], cwd=ROOT, capture_output=True, check=False)
    print(f"Created {result['created']} fictional accounts; credentials saved to .local/demo-credentials.json (mode 0600)")


if __name__ == "__main__":
    main()
