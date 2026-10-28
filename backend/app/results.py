"""Teacher-only results and their CSV, isolated from live tracking and grading."""

import csv
from io import StringIO

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.auth import AuthContext, display_name, require_teacher
from app.database import get_db
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
                 and not defs[item["mission_version_id"]].bonus and defs[item["mission_version_id"]].kind != "lesson"]
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
    return ({"assignment_id": assignment.id, "cohort": cohort.label, "course_title": release.student_snapshot.get("title", ""),
             "version": release.version, "threshold": threshold, "students": students, "weakest_missions": weak[:5]}, missions, exports)


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
