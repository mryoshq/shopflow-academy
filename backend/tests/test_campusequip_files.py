"""ADR-0044: the CampusEquip experience's static files are exactly the delivered ones (fingerprints), without any correction."""

import hashlib
import json
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
STATIC = FRONTEND / "public" / "experiences" / "campusequip"
SOURCES = FRONTEND / "src" / "campusequip"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_static_files_match_the_delivered_fingerprints_and_the_provenance():
    delivered = json.loads((SOURCES / "empreintes.json").read_text(encoding="utf-8"))["files"]
    served = sorted(str(path.relative_to(STATIC)) for path in STATIC.rglob("*") if path.is_file())
    expected = sorted(name for name in delivered if name.startswith(("data/", "documents/")))
    assert served == expected  # nothing more is served: no teacher file, no correction
    for name in served:
        assert sha(STATIC / name) == delivered[name], name
    provenance = json.loads((STATIC / "data" / "provenance.json").read_text(encoding="utf-8"))
    assert sha(STATIC / "documents" / "Sujet_CampusEquip_axes_1_2.pdf") == provenance["subjectSha256"]
    assert sha(STATIC / "data" / "referentiels.json") == provenance["referencesSha256"]
    assert "Aucun fichier enseignant" in provenance["note"]


def test_the_model_and_its_delivered_tests_are_kept_unchanged():
    delivered = json.loads((SOURCES / "empreintes.json").read_text(encoding="utf-8"))["files"]
    assert sha(SOURCES / "model.ts") == delivered["src/model.ts"]
    assert sha(SOURCES / "dataset.json") == delivered["src/dataset.json"]
    assert sha(SOURCES / "source" / "style.css") == delivered["src/style.css"]
    assert sha(SOURCES / "expected.json") == delivered["verification/expected.json"]
    # The delivered tests: only the path of expected.json changed (verification/ is not copied).
    original = (SOURCES / "model.test.ts").read_text(encoding="utf-8").replace("from './expected.json'", "from '../verification/expected.json'")
    assert hashlib.sha256(original.encode("utf-8")).hexdigest() == delivered["src/model.test.ts"]
