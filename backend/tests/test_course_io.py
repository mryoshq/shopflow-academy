import copy

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Course, CourseRelease
from test_student import env, post  # noqa: F401  (fixture reuse)


def demo_course_id(engine) -> int:
    with Session(engine) as db:
        return db.scalar(select(Course.id).where(Course.slug == "demo-shopflow-donnees"))


def course_count(engine) -> int:
    with Session(engine) as db:
        return db.scalar(select(func.count(Course.id)))


def comparable(document: dict) -> dict:
    data = copy.deepcopy(document)
    data.pop("exported_at", None)
    data.pop("source", None)
    data.pop("course", None)
    return data


def import_doc(client, document: dict, **extra):
    return post(client, "/api/v1/teacher/courses/import" + ("?dry_run=true" if extra.pop("dry_run", False) else ""),
                {"document": document, **extra})


def test_roundtrip_export_import_validate_preview_publish(env):
    clients, engine = env
    teacher = clients["teacher"]
    exported = teacher.get(f"/api/v1/teacher/courses/{demo_course_id(engine)}/export")
    assert exported.status_code == 200 and "attachment" in exported.headers["content-disposition"]
    document = exported.json()
    assert document["format"] == "shopflow-course" and document["format_version"] == 1
    missions = [m for mod in document["modules"] for ch in mod["chapters"] for m in ch["missions"]]
    assert missions[2]["prerequisite_slugs"] == ["validation-import-csv"]
    assert missions[0]["objective_codes"] == ["DEMO-GRAIN"] and missions[0]["definition"]["correct_ids"] == ["grain"]

    dry = import_doc(teacher, document, dry_run=True).json()
    assert dry == {"dry_run": True, "valid": True, "title": "Démonstration — Données ShopFlow", "slug": "demo-shopflow-donnees",
                   "objectives": 3, "modules": 1, "chapters": 1, "missions": 3, "missions_without_definition": 0, "slug_available": False}
    before = course_count(engine)
    assert import_doc(teacher, document).status_code == 409  # never overwrites
    assert course_count(engine) == before

    created = import_doc(teacher, document, slug="demo-copie", title="Copie de démonstration")
    assert created.status_code == 201, created.text
    new_id = created.json()["id"]
    assert post(teacher, f"/api/v1/teacher/courses/{new_id}/validate").json() == {"valid": True, "mission_count": 3}
    preview = post(teacher, f"/api/v1/teacher/courses/{new_id}/preview").json()
    assert "correct_ids" not in str(preview) and preview["title"] == "Copie de démonstration"
    release = post(teacher, f"/api/v1/teacher/courses/{new_id}/publish")
    assert release.status_code == 201
    again = teacher.get(f"/api/v1/teacher/releases/{release.json()['id']}/export").json()
    assert again["source"]["kind"] == "release" and again["course"]["slug"] == "demo-copie"
    assert comparable(again) == comparable(document)
    history = teacher.get(f"/api/v1/teacher/courses/{new_id}/history").json()
    assert [item["action"] for item in history][-1] == "course.import" and history[0]["action"] == "course.publish"


def test_malformed_documents_are_refused_with_paths(env):
    clients, engine = env
    teacher = clients["teacher"]
    good = teacher.get(f"/api/v1/teacher/courses/{demo_course_id(engine)}/export").json()
    before = course_count(engine)

    def errors_for(mutate) -> list[dict]:
        document = copy.deepcopy(good)
        mutate(document)
        response = import_doc(teacher, document, slug="refus")
        assert response.status_code == 422, response.text
        return response.json()["detail"]["errors"]

    first = lambda d: d["modules"][0]["chapters"][0]["missions"][0]  # noqa: E731
    assert errors_for(lambda d: d.update(format="autre"))[0]["path"] == "format"
    assert errors_for(lambda d: d.update(format_version=2))[0]["path"] == "format_version"
    assert errors_for(lambda d: d.update(unexpected=True))[0]["path"] == "unexpected"
    assert errors_for(lambda d: d["course"].update(title="<script>x</script>"))[0]["path"] == "course.title"
    assert "Objectif inconnu" in errors_for(lambda d: first(d).update(objective_codes=["NOPE"]))[0]["message"]
    assert "Prérequis invalide" in errors_for(lambda d: first(d).update(prerequisite_slugs=["absente"]))[0]["message"]
    assert errors_for(lambda d: first(d)["definition"].update(correct_ids=["inconnu"]))[0]["path"].startswith("modules.0.chapters.0.missions.0.definition")
    assert errors_for(lambda d: first(d)["definition"].update(objective_ids=[1]))[0]["message"].startswith("Utiliser")
    assert errors_for(lambda d: first(d).update(slug="ordre-pipeline-ingestion"))[0]["message"].endswith("en double")
    assert errors_for(lambda d: d["objectives"].append(dict(d["objectives"][0])))[0]["message"] == "Codes d'objectif en double"
    assert errors_for(lambda d: first(d)["definition"].update(scenario="<img src=x onerror=alert(1)>"))
    assert post(teacher, "/api/v1/teacher/courses/import", {"document": "pas un objet"}).status_code == 422
    assert course_count(engine) == before


def test_search_filters_and_sorts(env):
    clients, engine = env
    teacher = clients["teacher"]
    document = teacher.get(f"/api/v1/teacher/courses/{demo_course_id(engine)}/export").json()
    import_doc(teacher, document, slug="atelier-qualite", title="Atelier qualité")
    found = teacher.get("/api/v1/teacher/course-search", params={"q": "QUALITÉ".lower()}).json()
    assert [item["slug"] for item in found] == ["atelier-qualite"] and found[0]["owner"] == "demo.enseignant"
    published = teacher.get("/api/v1/teacher/course-search", params={"status": "published"}).json()
    assert [item["slug"] for item in published] == ["demo-shopflow-donnees"]
    by_title = teacher.get("/api/v1/teacher/course-search", params={"sort": "title"}).json()
    assert [item["title"] for item in by_title] == sorted([item["title"] for item in by_title], key=str.lower)
    assert teacher.get("/api/v1/teacher/course-search", params={"status": "bogus"}).status_code == 422


def test_restore_draft_from_release_with_backup(env):
    clients, engine = env
    teacher = clients["teacher"]
    course_id = demo_course_id(engine)
    tree = teacher.get(f"/api/v1/teacher/courses/{course_id}").json()
    mission = tree["modules"][0]["chapters"][0]["missions"][0]
    changed = dict(mission["definition"], correct_ids=["distinct"], explanation="Brouillon modifié par erreur.")
    assert teacher.put(f"/api/v1/teacher/missions/{mission['id']}/draft", json=changed,
                       headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]}).status_code == 200
    with Session(engine) as db:
        release_id = db.scalar(select(CourseRelease.id).where(CourseRelease.course_id == course_id))
    published_before = teacher.get(f"/api/v1/teacher/releases/{release_id}/export").json()
    restored = post(teacher, f"/api/v1/teacher/courses/{course_id}/restore", {"release_id": release_id})
    assert restored.json() == {"restored_missions": 3, "release_version": 1}
    draft = teacher.get(f"/api/v1/teacher/courses/{course_id}").json()["modules"][0]["chapters"][0]["missions"][0]["definition"]
    assert draft["correct_ids"] == ["grain"]
    published_after = teacher.get(f"/api/v1/teacher/releases/{release_id}/export").json()
    assert comparable(published_after) == comparable(published_before)  # releases are never touched
    history = teacher.get(f"/api/v1/teacher/courses/{course_id}/history").json()
    assert history[0]["action"] == "course.restore" and history[0]["has_backup"] is True
    assert {"mission.update"} <= {item["action"] for item in history}
    backup = teacher.get(f"/api/v1/teacher/history/{history[0]['id']}/backup").json()
    assert backup["modules"][0]["chapters"][0]["missions"][0]["definition"]["correct_ids"] == ["distinct"]
    assert post(teacher, f"/api/v1/teacher/courses/{course_id}/restore", {"release_id": 999999}).status_code == 404


def test_students_cannot_export_or_import(env):
    clients, engine = env
    course_id = demo_course_id(engine)
    assert clients["a"].get(f"/api/v1/teacher/courses/{course_id}/export").status_code == 403
    assert clients["a"].get("/api/v1/teacher/course-search").status_code == 403
    assert post(clients["a"], "/api/v1/teacher/courses/import", {"document": {}}).status_code == 403
    assert post(clients["a"], f"/api/v1/teacher/courses/{course_id}/restore", {"release_id": 1}).status_code == 403
    assert clients["teacher"].post("/api/v1/teacher/courses/import", json={"document": {}}).status_code == 403  # CSRF
