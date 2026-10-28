"""Import ten local student accounts from ignored .local/student-emails.txt."""

import json
from pathlib import Path
from secrets import token_urlsafe
import subprocess


ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local"
SOURCE = LOCAL / "student-emails.txt"
TARGET = LOCAL / "student-credentials.json"


def main() -> None:
    if TARGET.exists():
        raise SystemExit("Local credentials file already exists; left unchanged")
    emails = [line.strip() for line in SOURCE.read_text().splitlines() if line.strip()]
    if len(emails) != 10:
        raise SystemExit("Expected exactly ten student addresses in .local/student-emails.txt")
    rows = [{"email": email, "password": token_urlsafe(24)} for email in emails]
    LOCAL.mkdir(mode=0o700, exist_ok=True)
    LOCAL.chmod(0o700)
    TARGET.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    TARGET.chmod(0o600)
    try:
        run = subprocess.run(
            ["docker", "compose", "exec", "-T", "backend", "python", "-m", "app.import_students"],
            cwd=ROOT, input=json.dumps(rows), capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise SystemExit("Local student import failed; private credentials file retained for recovery. No email was sent") from exc
    indices = json.loads(run.stdout)["created_indices"]
    if indices:
        TARGET.write_text(json.dumps([rows[i] for i in indices], ensure_ascii=False, indent=2))
        TARGET.chmod(0o600)
    else:
        TARGET.unlink()
    print(f"Created {len(indices)} local student accounts; no email was sent")


if __name__ == "__main__":
    main()
