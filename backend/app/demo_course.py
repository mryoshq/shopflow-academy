"""Idempotent demonstration course: three clearly labelled fictional missions.

Only the fictional ``demo.*`` accounts are enrolled; real students are never touched.

    docker compose exec -T backend python -m app.demo_course
"""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthContext
from app.curriculum import publish_course
from app.curriculum_schema import MissionDefinition
from app.database import get_engine
from app.models import (
    Assignment, Chapter, Cohort, Course, CourseModule, CourseRelease, Enrollment, LearningObjective, Mission, User,
)

SLUG = "demo-shopflow-donnees"
TITLE = "Démonstration — Données ShopFlow"
COHORT = "Cohorte démonstration (comptes fictifs)"
TEACHER = "demo.enseignant"

OBJECTIVES = [
    ("DEMO-GRAIN", "Identifier le grain d'une table avant d'agréger après une jointure."),
    ("DEMO-QUALITE", "Choisir les règles de qualité adaptées à un import CSV."),
    ("DEMO-PIPELINE", "Ordonner les étapes d'une ingestion idempotente."),
]


def missions(objective_ids: dict[str, int]) -> list[tuple[str, str, dict]]:
    return [
        ("frais-livraison-join", "Frais de livraison après une jointure", {
            "kind": "data_interpretation",
            "scenario": ("Nadia, analyste chez ShopFlow à Tanzar (ville fictive), prépare le total des frais de livraison. "
                         "La commande C-101 coûte 30 DH de livraison et contient deux articles ; la commande C-102 coûte 40 DH "
                         "et contient un article. La comptabilité attend 70 DH, mais la requête "
                         "SUM(o.shipping_fee) sur orders JOIN order_items affiche 100 DH."),
            "instructions": "Quelle est la cause de l'écart, et quelle correction retenez-vous ?",
            "objective_ids": [objective_ids["DEMO-GRAIN"]],
            "display_data": {"kind": "table", "columns": ["order_id", "item_id", "produit", "shipping_fee (DH)"],
                             "rows": [["C-101", "I-1", "Tapis berbère", 30], ["C-101", "I-2", "Théière", 30],
                                      ["C-102", "I-3", "Lanterne", 40]]},
            "choices": [
                {"id": "grain", "label": "La jointure passe au grain article : agréger les frais par commande avant de joindre."},
                {"id": "distinct", "label": "Remplacer par SUM(DISTINCT o.shipping_fee) pour retirer les doublons."},
                {"id": "doublons", "label": "Supprimer les lignes en double de order_items."},
                {"id": "saisie", "label": "Corriger les frais saisis dans orders, qui sont faux."},
            ],
            "correct_ids": ["grain"],
            "feedback": {
                "distinct": "Le résultat tombe juste ici par hasard : deux commandes à 30 DH ne seraient comptées qu'une fois.",
                "doublons": "Ces lignes sont légitimes : une commande peut contenir plusieurs articles.",
                "saisie": "Les frais de chaque commande sont corrects ; c'est leur répétition qui fausse la somme.",
                "grain": "Exact : une ligne représente un article, les frais de C-101 sont donc comptés deux fois.",
            },
            "explanation": ("Après la jointure, une ligne représente un article : 30 + 30 + 40 = 100 DH. On calcule les frais "
                            "au grain commande (par exemple dans une CTE sur orders) puis on joint, ce qui donne 30 + 40 = 70 DH."),
            "hints": ["Comptez combien de fois la commande C-101 apparaît dans le tableau.",
                      "Le grain d'une table, c'est ce que représente une ligne. Ici : une commande, ou un article ?"],
            "max_points": 10, "estimated_duration_minutes": 10,
        }),
        ("validation-import-csv", "Valider un import CSV de clients", {
            "kind": "multiple_choice",
            "scenario": ("Le service client de ShopFlow envoie chaque soir un fichier clients.csv. Avant de le charger dans "
                         "l'entrepôt, Youssef examine un extrait du fichier du jour."),
            "instructions": "Quelles règles de qualité appliquez-vous avant le chargement ? Plusieurs réponses sont possibles.",
            "objective_ids": [objective_ids["DEMO-QUALITE"]],
            "display_data": {"kind": "table", "columns": ["id", "ville", "date_inscription", "montant_dh"],
                             "rows": [[1, "Tanzar", "2026-03-14", "250.00"], [2, "Oued Lmal", "14/03/2026", "180"],
                                      [2, "Oued Lmal", "14/03/2026", "180"], [3, None, "2026-04-02", "deux cents"]]},
            "choices": [
                {"id": "types", "label": "Contrôler le type de montant_dh et rejeter les valeurs non numériques."},
                {"id": "dates", "label": "Normaliser date_inscription vers un format unique (AAAA-MM-JJ)."},
                {"id": "doublons", "label": "Dédupliquer sur l'identifiant client."},
                {"id": "manquants", "label": "Traiter la ville manquante selon une règle documentée (rejet journalisé)."},
                {"id": "texte", "label": "Convertir toutes les colonnes en texte pour éviter les erreurs de chargement."},
                {"id": "silence", "label": "Supprimer sans trace toute ligne qui paraît inhabituelle."},
            ],
            "correct_ids": ["types", "dates", "doublons", "manquants"],
            "feedback": {
                "texte": "Tout passer en texte masque les erreurs au lieu de les traiter.",
                "silence": "Une suppression sans journal empêche de comprendre et de corriger la source.",
            },
            "explanation": ("L'extrait montre un montant non numérique, deux formats de date, un doublon exact et une ville "
                            "manquante : chaque problème a sa règle, et chaque rejet est journalisé."),
            "hints": ["Regardez chaque colonne séparément : quel problème voyez-vous dans chacune ?"],
            "max_points": 10, "estimated_duration_minutes": 10,
        }),
        ("ordre-pipeline-ingestion", "Ordonner un pipeline d'ingestion", {
            "kind": "reorder",
            "scenario": ("ShopFlow automatise l'import quotidien des commandes. Le pipeline doit pouvoir être relancé "
                         "sans créer de doublons dans l'entrepôt."),
            "instructions": "Remettez les étapes dans l'ordre d'exécution.",
            "objective_ids": [objective_ids["DEMO-PIPELINE"]],
            "choices": [
                {"id": "lecture", "label": "Lire le fichier source"},
                {"id": "validation", "label": "Valider le schéma et les types"},
                {"id": "nettoyage", "label": "Nettoyer les valeurs (dates, espaces, montants)"},
                {"id": "dedup", "label": "Dédupliquer les enregistrements"},
                {"id": "chargement", "label": "Charger de façon idempotente (upsert)"},
            ],
            "correct_ids": ["lecture", "validation", "nettoyage", "dedup", "chargement"],
            "explanation": ("On lit, on rejette tôt ce qui ne respecte pas le schéma, on nettoie, on déduplique, puis on charge "
                            "avec une clé d'unicité : relancer le pipeline ne crée aucun doublon."),
            "hints": ["Quelle étape doit absolument venir en dernier pour qu'une relance soit sans risque ?"],
            "max_points": 10, "estimated_duration_minutes": 8,
        }),
    ]


def ensure_course(db: Session, teacher: User) -> Course:
    course = db.scalar(select(Course).where(Course.slug == SLUG))
    if course is not None:
        return course
    course = Course(slug=SLUG, title=TITLE, created_by=teacher.id,
                    description="Parcours de démonstration avec des données fictives. Ne compte pas dans la note du module.")
    db.add(course)
    db.flush()
    ids = {}
    for code, statement in OBJECTIVES:
        objective = LearningObjective(course_id=course.id, code=code, statement=statement)
        db.add(objective)
        db.flush()
        ids[code] = objective.id
    module = CourseModule(course_id=course.id, title="Module de démonstration", sort_order=0)
    db.add(module)
    db.flush()
    chapter = Chapter(module_id=module.id, title="Données ShopFlow", sort_order=0)
    db.add(chapter)
    db.flush()
    created = []
    for order, (slug, title, body) in enumerate(missions(ids)):
        mission = Mission(chapter_id=chapter.id, slug=slug, title=title, sort_order=order)
        db.add(mission)
        db.flush()
        created.append((mission, body))
    # The ordering mission unlocks once the CSV validation mission is solved.
    created[2][1]["prerequisite_mission_ids"] = [created[1][0].id]
    for mission, body in created:
        mission.draft_definition = MissionDefinition.model_validate(body).model_dump()
    db.commit()
    return course


def run(db: Session) -> dict:
    teacher = db.scalar(select(User).where(User.username == TEACHER, User.role == "teacher"))
    if teacher is None:
        raise SystemExit("demo.enseignant is missing; run scripts/seed_demo.py first")
    course = ensure_course(db, teacher)
    release = db.scalar(select(CourseRelease).where(CourseRelease.course_id == course.id, CourseRelease.status == "published")
                        .order_by(CourseRelease.version.desc()).limit(1))
    if release is None:
        published = publish_course(course.id, AuthContext(user=teacher, session=None), db)  # type: ignore[arg-type]
        release = db.get(CourseRelease, published["id"])
    cohort = db.scalar(select(Cohort).where(Cohort.label == COHORT))
    if cohort is None:
        cohort = Cohort(label=COHORT)
        db.add(cohort)
        db.flush()
    students = db.scalars(select(User).where(User.role == "student", User.username.like("demo.etudiant%"))).all()
    enrolled = set(db.scalars(select(Enrollment.user_id).where(Enrollment.cohort_id == cohort.id)).all())
    for student in students:
        if student.id not in enrolled:
            db.add(Enrollment(cohort_id=cohort.id, user_id=student.id))
    if db.scalar(select(Assignment.id).where(Assignment.cohort_id == cohort.id, Assignment.course_release_id == release.id)) is None:
        db.add(Assignment(cohort_id=cohort.id, course_release_id=release.id))
    db.commit()
    return {"course_id": course.id, "release_id": release.id, "cohort_id": cohort.id, "demo_students": len(students)}


def main() -> None:
    from app.config import get_settings
    if get_settings().app_env == "production":
        raise SystemExit("Demo course is disabled in production (use the test stack, see docs/RUNBOOK.md)")
    with Session(get_engine(), expire_on_commit=False) as db:
        print(json.dumps(run(db)))


if __name__ == "__main__":
    main()
