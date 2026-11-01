"""Teacher-only results and their CSV, isolated from live tracking and grading."""

import csv
from io import StringIO

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.curriculum_schema import UNGRADED_KINDS
from app.auth import AuthContext, display_name, require_teacher
from app.database import get_db
from app.final_grade import class_final, config_of
from app.progress import course_score, definitions, mission_scores
from app.student import flatten
from app.teacher_dashboard import audit, class_students, csv_cell, csv_number, owned_class

router = APIRouter(prefix="/api/v1/teacher", tags=["results"])


def results_data(db: Session, auth: AuthContext, assignment_id: int, threshold: float) -> tuple[dict, list[dict], list[dict]]:
    assignment, release, cohort = owned_class(db, auth, assignment_id)
    missions = flatten(release.student_snapshot)
    ids = [item["mission_version_id"] for item in missions]
    defs = definitions(db, ids)
    # Optional bonuses and lessons are never described as weak points.
    principal = [item for item in missions if item["mission_version_id"] in defs
                 and not defs[item["mission_version_id"]].bonus and defs[item["mission_version_id"]].kind not in UNGRADED_KINDS]
    successes = {item["mission_version_id"]: 0 for item in principal}
    students, exports = [], []
    for student in class_students(db, cohort.id):
        scores = mission_scores(db, student.id, ids)
        summary = course_score(scores)
        percentage = round(100 * summary["core_points"] / summary["core_possible"], 2) if summary["core_possible"] else None
        support = percentage is not None and percentage < threshold
        unsuccessful = []
        completed = 0
        for item in principal:
            vid = item["mission_version_id"]
            score = scores[vid]
            if score.completed:
                successes[vid] += 1
                completed += 1
            else:
                unsuccessful.append({"mission_version_id": vid, "title": item["title"], "best_points": score.best,
                                     "possible": score.possible, "attempts": score.attempts})
        students.append({"id": student.id, "display_name": display_name(student.username),
                         "core_points": summary["core_points"], "core_possible": summary["core_possible"],
                         "bonus_points": summary["bonus_points"], "percentage": percentage, "needs_support": support,
                         "completed": completed, "total": len(principal), "unsuccessful_count": len(unsuccessful),
                         "unsuccessful_missions": unsuccessful})
        # Preserve mission columns, order, point totals and spreadsheet formatting.
        # The success counter follows Results: principal graded missions only.
        exports.append([csv_cell(display_name(student.username))] + [csv_number(scores[vid].best) for vid in ids]
                       + [csv_number(summary["core_points"]), summary["core_possible"], csv_number(summary["bonus_points"]),
                          completed, "oui" if support else "non"])
    total = len(students)
    weak = [{"mission_version_id": item["mission_version_id"], "title": item["title"],
             "completed": successes[item["mission_version_id"]], "total": total,
             "unsuccessful_count": total - successes[item["mission_version_id"]],
             "success_percentage": round(100 * successes[item["mission_version_id"]] / total, 2)}
            for item in principal if total and successes[item["mission_version_id"]] < total]
    weak.sort(key=lambda item: item["success_percentage"])
    # ADR-0046: final grade on 20, a calculation over the same points (nothing stored changes).
    config = config_of(db, assignment.id)
    finals = class_final(db, release, cohort, config, class_students(db, cohort.id))
    for row in students:
        row["final_grade"] = finals[row["id"]]
    return ({"assignment_id": assignment.id, "cohort": cohort.label, "course_title": release.student_snapshot.get("title", ""),
             "version": release.version, "threshold": threshold, "students": students, "grading": config, "weakest_missions": weak[:5]}, missions, exports)


@router.get("/classes/{assignment_id}/results")
def results(assignment_id: int, response: Response, threshold: float = Query(default=50, ge=0, le=100),
            auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return results_data(db, auth, assignment_id, threshold)[0]


@router.get("/classes/{assignment_id}/results/export.csv")
def results_csv(assignment_id: int, threshold: float = Query(default=50, ge=0, le=100),
                auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> Response:
    data, missions, rows = results_data(db, auth, assignment_id, threshold)
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["etudiant"] + [csv_cell(item["title"]) for item in missions]
                    + ["total_points", "total_possible", "bonus_points", "missions_reussies", "a_accompagner"])
    writer.writerows(rows)
    audit(db, auth, "class.export", assignment_id, {"view": "results", "threshold": threshold})
    db.commit()
    filename = f"shopflow-notes-classe-{assignment_id}-v{data['version']}.csv"
    return Response(content="\ufeff" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


@router.get("/classes/{assignment_id}/results/final.csv")
def final_csv(assignment_id: int, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> Response:
    """ADR-0046: the final grade on 20 and each of its components (a separate file: the results export keeps its columns)."""
    assignment, release, cohort = owned_class(db, auth, assignment_id)
    config = config_of(db, assignment.id)
    students = class_students(db, cohort.id)
    finals = class_final(db, release, cohort, config, students)
    weights = config["weights"]
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["etudiant", f"cours_sur_20_{csv_number(weights['course'])}pct", f"ateliers_sur_20_{csv_number(weights['workshops'])}pct",
                     f"campusequip_sur_20_{csv_number(weights['project'])}pct", "socle_sur_20", "bonus_projet", "bonus_cours",
                     "note_finale_20", "provisoire", "en_attente"])
    cell = lambda value: "" if value is None else csv_number(value)  # noqa: E731
    labels = {"course": "cours", "workshops": "ateliers", "project": "campusequip"}
    for student in students:
        final = finals[student.id]
        parts = final["parts"]
        writer.writerow([csv_cell(display_name(student.username)), cell(parts["course"]["on20"]), cell(parts["workshops"]["on20"]),
                         cell(parts["project"]["on20"]), cell(final["base"]), cell(final["project_bonus"]), cell(final["course_bonus"]),
                         cell(final["final"]), "oui" if final["provisional"] else "non", " ".join(labels[p] for p in final["pending"])])
    audit(db, auth, "class.export", assignment_id, {"view": "final_grade"})
    db.commit()
    return Response(content="\ufeff" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="shopflow-note-finale-classe-{assignment_id}-v{release.version}.csv"',
                             "Cache-Control": "no-store"})
