"""Project grid of the two CampusEquip subjects (ADR-0046), and the former grid kept apart.

Part 1 (axes 1 and 2), base 10, with 1 individual point per student; part 2 (axes 3 and 4), base 10, common to the
group. Each part has its own bonus, 5 at most. Project = base on 20 + bonus on 10. Points entered on the former grid
(SQL 4, Python 4, MongoDB and Redis 3, Airflow 3, evidence 2, understanding 4) are never changed nor deleted: they are
shown apart, « à reprendre », and count for nothing.
"""

from __future__ import annotations

from app.models import ProjectGrade

# (key, label, points). Labels are in French: they are shown as written (i18n on the client).
PART1 = [("p1_model", "Modèle relationnel et contraintes", 2), ("p1_sql", "Trois analyses SQL, tableaux et graphique", 2),
         ("p1_python", "Contrôles Python, quarantaine et rapport", 2),
         ("p1_load", "Chargement transactionnel, rejeu et prise en charge automatique", 2),
         ("p1_proofs", "Preuves reproductibles et compréhension (commun)", 1)]
PART1_INDIVIDUAL = 1  # « dont 1 individuel par étudiant »
PART1_BONUS = [("b1_plan", "Plan SQL avant et après index", 1), ("b1_recursive", "Analyse récursive ou précalcul", 1),
               ("b1_chunks", "Lecture par morceaux", 1), ("b1_api", "IoT ou API", 2)]
PART2 = [("p2_airflow", "Airflow et reprise", 3), ("p2_mongo", "Événements MongoDB", 2), ("p2_redis", "Redis", 2),
         ("p2_time", "Tentatives et analyse temporelle", 2), ("p2_repro", "Reproductibilité et explication du groupe", 1)]
PART2_BONUS = [("b2_queue", "File avec acquittement", 1), ("b2_metrics", "Mesures et conservation", 2),
               ("b2_sensor", "Capteur local simulé", 1), ("b2_resume", "Reprise approfondie", 1)]
BONUS_CAP = 5  # per part
BASE_MAX, BONUS_MAX = 20, 10
CRITERIA = {key: points for key, _, points in PART1 + PART1_BONUS + PART2 + PART2_BONUS}

LEGACY = {"sql": 4, "python": 4, "nosql": 3, "airflow": 3, "reproducibility": 2}
LEGACY_INDIVIDUAL = 4


def grid_out() -> dict:
    """The grid as the teacher's screen shows it."""
    section = lambda items: [{"key": k, "label": label, "max": points} for k, label, points in items]  # noqa: E731
    return {"parts": [
        {"key": "part1", "title": "Partie 1 (axes 1 et 2)", "base": section(PART1), "individual_max": PART1_INDIVIDUAL,
         "bonus": section(PART1_BONUS), "bonus_cap": BONUS_CAP},
        {"key": "part2", "title": "Partie 2 (axes 3 et 4)", "base": section(PART2), "individual_max": 0,
         "bonus": section(PART2_BONUS), "bonus_cap": BONUS_CAP},
    ], "base_max": BASE_MAX, "bonus_max": BONUS_MAX}


def _sum(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return round(sum(present), 2) if present else None


def student_total(grade: ProjectGrade | None, user_id: int) -> dict:
    """One student's project: base on 20, bonus on 10, and whether every base line is entered (``complete``)."""
    scores = (grade.scores if grade else None) or {}
    criteria = scores.get("criteria") or {}
    individual = (scores.get("individual") or {}).get(str(user_id))
    part1 = [criteria.get(k) for k, _, _ in PART1] + [individual]
    part2 = [criteria.get(k) for k, _, _ in PART2]
    bonus1 = _sum([criteria.get(k) for k, _, _ in PART1_BONUS])
    bonus2 = _sum([criteria.get(k) for k, _, _ in PART2_BONUS])
    p1, p2 = _sum(part1), _sum(part2)
    base = _sum([p1, p2])
    bonus = _sum([min(BONUS_CAP, bonus1) if bonus1 is not None else None, min(BONUS_CAP, bonus2) if bonus2 is not None else None])
    return {"part1": p1, "part2": p2, "individual": individual, "base": base, "bonus": bonus,
            "complete": all(v is not None for v in part1 + part2)}


def legacy_out(grade: ProjectGrade | None, members: list[int]) -> dict | None:
    """What was entered on the former grid, untouched; None when nothing was."""
    if grade is None:
        return None
    values = {key: getattr(grade, key) for key in LEGACY}
    individual = {str(uid): (grade.individual or {}).get(str(uid)) for uid in members}
    if all(v is None for v in values.values()) and all(v is None for v in individual.values()):
        return None
    common = _sum(list(values.values()))
    return {**values, "common": common, "students": [
        {"id": uid, "individual": individual[str(uid)],
         "total": _sum([common, individual[str(uid)]])} for uid in members]}
