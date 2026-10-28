"""Upsert the teacher locally with recoverable private credentials, no email."""

import json
import os
from pathlib import Path
from secrets import token_urlsafe
import subprocess


ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local"
SOURCE = LOCAL / "teacher-email.txt"
TARGET = LOCAL / "teacher-credentials.json"
PENDING = LOCAL / "teacher-credentials.pending.json"


def write_private(path: Path, data: dict[str, str]) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w") as output:
            json.dump(data, output)
            output.flush()
            os.fsync(output.fileno())
    except Exception:
        path.unlink(missing_ok=True)
        raise


def main() -> None:
    LOCAL.mkdir(mode=0o700, exist_ok=True)
    LOCAL.chmod(0o700)
    email = SOURCE.read_text().strip()
    if PENDING.exists():
        payload = json.loads(PENDING.read_text())
        if payload["email"] != email:
            raise SystemExit("Pending teacher credential belongs to another address; inspect locally")
    else:
        payload = {"email": email, "password": token_urlsafe(32)}
        write_private(PENDING, payload)
    try:
        run = subprocess.run(
            ["docker", "compose", "exec", "-T", "backend", "python", "-m", "app.upsert_teacher"],
            cwd=ROOT, input=json.dumps(payload), capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise SystemExit("Local teacher setup failed; private pending credential retained for retry. No email was sent") from exc
    result = json.loads(run.stdout)
    os.replace(PENDING, TARGET)
    TARGET.chmod(0o600)
    print(f"Teacher account {'created' if result['created'] else 'updated'} locally; credentials in .local/teacher-credentials.json. No email was sent")


if __name__ == "__main__":
    main()
