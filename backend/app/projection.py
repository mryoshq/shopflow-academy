"""Student-facing identifiers and order for published missions.

Teacher-authored choice IDs are often sequential (``option-1``, ``option-2``…) and
entered in the expected order, so sending them as-is would reveal the answer of
ordering and matching activities. Students therefore receive, per mission version:

* opaque choice/target IDs derived with a server-side key (HMAC), and
* a deterministic shuffle that never equals the expected order when it can differ.

The mapping is recomputed on the server to grade an answer; nothing is stored.
"""

from __future__ import annotations

from functools import lru_cache
from hashlib import sha256
import hmac

from app.config import get_settings


@lru_cache
def _key() -> bytes:
    settings = get_settings()
    material = settings.app_secret or f"shopflow-projection:{settings.database_url}"
    return sha256(material.encode("utf-8")).digest()


def _mac(*parts: object) -> str:
    message = ":".join(str(part) for part in parts).encode("utf-8")
    return hmac.new(_key(), message, sha256).hexdigest()


def opaque_id(version_id: int, namespace: str, raw_id: str) -> str:
    return f"{namespace}{_mac(version_id, namespace, raw_id)[:16]}"


def _shuffle(items: list[dict], version_id: int, namespace: str, avoid: list[str] | None = None) -> list[dict]:
    ordered = sorted(items, key=lambda item: _mac(version_id, "order", namespace, item["id"]))
    reference = avoid if avoid is not None else [item["id"] for item in items]
    if len(ordered) > 1 and [item["id"] for item in ordered] == reference:
        ordered = ordered[1:] + ordered[:1]
    return ordered


def student_definition(projected: dict, version_id: int, private: dict | None) -> dict:
    """Return a copy of a public definition with opaque IDs and shuffled order."""
    result = dict(projected)
    kind = result.get("kind")
    choices = list(result.get("choices") or [])
    if kind != "true_false":
        avoid = list(private.get("correct_ids") or []) if private and kind == "reorder" else None
        choices = _shuffle(choices, version_id, "c", avoid)
    result["choices"] = [{**item, "id": opaque_id(version_id, "c", item["id"])} for item in choices]
    targets = list(result.get("match_targets") or [])
    if targets:
        avoid = None
        if private and private.get("correct_pairs"):
            pairs = private["correct_pairs"]
            avoid = [pairs[item["id"]] for item in choices if item["id"] in pairs]
        targets = _shuffle(targets, version_id, "t", avoid)
        result["match_targets"] = [{**item, "id": opaque_id(version_id, "t", item["id"])} for item in targets]
    return result


def reverse_ids(version_id: int, namespace: str, raw_ids: list[str]) -> dict[str, str]:
    """Map opaque student IDs back to authored IDs for one mission version."""
    return {opaque_id(version_id, namespace, raw): raw for raw in raw_ids}
