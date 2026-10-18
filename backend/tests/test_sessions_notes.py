"""Dauernotiz pro Übung + Trainings-Sessions (Trainingsdauer).

Nutzt die Fixtures aus conftest.py (SQLite in-memory, zwei Nutzer), baut aber
eine eigene App mit den hier relevanten Routern.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import auth
import database
import models
from routers import sessions, templates, workouts


def _app(db_session, user):
    app = FastAPI()
    app.include_router(workouts.router)
    app.include_router(templates.router)
    app.include_router(sessions.router)
    app.dependency_overrides[database.get_db] = lambda: db_session
    app.dependency_overrides[auth.get_current_user] = lambda: user
    return TestClient(app)


@pytest.fixture()
def plan(seeded, db_session):
    ex = seeded["exercises"]
    t = models.WorkoutTemplate(user_id=seeded["user_a"].id, name="Push")
    db_session.add(t)
    db_session.flush()
    for pos, name in enumerate(["Bankdrücken", "Laufen"], start=1):
        db_session.add(models.WorkoutTemplateItem(template_id=t.id, exercise_id=ex[name], position=pos))
    db_session.commit()
    return t


# ── Dauernotiz ────────────────────────────────────────────────────────────────

def test_notiz_bleibt_ueber_trainings_hinweg(seeded, db_session):
    a = _app(db_session, seeded["user_a"])
    ex = seeded["exercises"]["Bankdrücken"]
    assert a.get(f"/api/workouts/exercises/{ex}/note").json()["notes"] is None

    r = a.put(f"/api/workouts/exercises/{ex}/note", json={"notes": "  Sitz Stufe 4  "})
    assert r.status_code == 200 and r.json()["notes"] == "Sitz Stufe 4"
    # neues Training derselben Übung (neuer Log) -> Notiz ist unverändert da
    a.post("/api/workouts", json={"exercise_id": ex, "sets": []})
    assert a.get(f"/api/workouts/exercises/{ex}/note").json()["notes"] == "Sitz Stufe 4"

    a.put(f"/api/workouts/exercises/{ex}/note", json={"notes": "Griff eng"})
    assert db_session.query(models.ExerciseNote).count() == 1   # Update, keine 2. Zeile


def test_notiz_ist_pro_nutzer(seeded, db_session):
    ex = seeded["exercises"]["Bankdrücken"]
    _app(db_session, seeded["user_a"]).put(f"/api/workouts/exercises/{ex}/note", json={"notes": "nur A"})
    assert _app(db_session, seeded["user_b"]).get(f"/api/workouts/exercises/{ex}/note").json()["notes"] is None


def test_leere_notiz_loescht(seeded, db_session):
    a = _app(db_session, seeded["user_a"])
    ex = seeded["exercises"]["Bankdrücken"]
    a.put(f"/api/workouts/exercises/{ex}/note", json={"notes": "x"})
    assert a.put(f"/api/workouts/exercises/{ex}/note", json={"notes": "   "}).json()["notes"] is None
    assert db_session.query(models.ExerciseNote).count() == 0


def test_notiz_validierung(seeded, db_session):
    a = _app(db_session, seeded["user_a"])
    ex = seeded["exercises"]["Bankdrücken"]
    assert a.put("/api/workouts/exercises/99999/note", json={"notes": "x"}).status_code == 404
    assert a.put(f"/api/workouts/exercises/{ex}/note", json={"notes": "x" * 501}).status_code == 422


def test_uebung_loeschen_entfernt_notizen(seeded, db_session):
    user = seeded["user_a"]
    ex = models.Exercise(name="Eigene", created_by_user_id=user.id)
    db_session.add(ex); db_session.commit()
    a = _app(db_session, user)
    a.put(f"/api/workouts/exercises/{ex.id}/note", json={"notes": "weg damit"})
    assert a.delete(f"/api/workouts/exercises/{ex.id}").status_code == 204
    assert db_session.query(models.ExerciseNote).count() == 0


# ── Sessions / Trainingsdauer ─────────────────────────────────────────────────

def test_planstart_legt_session_an_und_abschluss_misst_dauer(seeded, db_session, plan):
    a = _app(db_session, seeded["user_a"])
    assert a.get("/api/sessions/active").json() is None

    start = a.post(f"/api/templates/{plan.id}/start").json()
    active = a.get("/api/sessions/active").json()
    assert active["id"] == start["session_id"]
    assert [e["log_id"] for e in active["entries"]] == [s["log_id"] for s in start["session"]]
    assert active["finished_at"] is None and "server_now" in active

    # Start 42 Minuten in die Vergangenheit legen, dann abschließen
    s = db_session.get(models.WorkoutSession, active["id"])
    s.started_at = datetime.now(timezone.utc) - timedelta(minutes=42)
    db_session.commit()
    done = a.post(f"/api/sessions/{active['id']}/finish").json()
    assert 42 * 60 <= done["duration_sec"] < 42 * 60 + 30
    assert a.get("/api/sessions/active").json() is None

    # Idempotent: zweites Abschließen ändert die Dauer nicht
    assert a.post(f"/api/sessions/{active['id']}/finish").json()["duration_sec"] == done["duration_sec"]
    # Im Verlauf des Tages sichtbar
    day = a.get(f"/api/sessions/date/{done['date']}").json()
    assert [d["id"] for d in day] == [done["id"]]


def test_zweiter_plan_haengt_an_laufendes_training_an(seeded, db_session, plan):
    a = _app(db_session, seeded["user_a"])
    first = a.post(f"/api/templates/{plan.id}/start").json()
    second = a.post(f"/api/templates/{plan.id}/start").json()
    assert first["session_id"] == second["session_id"]
    active = a.get("/api/sessions/active").json()
    assert len(active["entries"]) == 4
    assert db_session.query(models.WorkoutSession).count() == 1


def test_vergessene_session_verfaellt(seeded, db_session, plan):
    a = _app(db_session, seeded["user_a"])
    sid = a.post(f"/api/templates/{plan.id}/start").json()["session_id"]
    s = db_session.get(models.WorkoutSession, sid)
    s.started_at = datetime.now(timezone.utc) - sessions.ACTIVE_MAX_AGE - timedelta(minutes=1)
    db_session.commit()
    assert a.get("/api/sessions/active").json() is None
    # neuer Start -> neue Session, die alte bleibt unabgeschlossen und erscheint nicht im Verlauf
    new_sid = a.post(f"/api/templates/{plan.id}/start").json()["session_id"]
    assert new_sid != sid


def test_fremde_session_nicht_abschliessbar(seeded, db_session, plan):
    sid = _app(db_session, seeded["user_a"]).post(f"/api/templates/{plan.id}/start").json()["session_id"]
    b = _app(db_session, seeded["user_b"])
    assert b.post(f"/api/sessions/{sid}/finish").status_code == 404
    assert b.get("/api/sessions/active").json() is None


def test_training_abbrechen_verwirft_dauer_und_leere_uebungen(seeded, db_session, plan):
    a = _app(db_session, seeded["user_a"])
    start = a.post(f"/api/templates/{plan.id}/start").json()
    bank, lauf = [e["log_id"] for e in start["session"]]
    a.post(f"/api/workouts/{bank}/sets", json={"reps": 8, "weight_kg": 60})   # Bankdrücken hat einen Satz

    r = a.delete(f"/api/sessions/{start['session_id']}")
    assert r.status_code == 200 and r.json()["removed_empty_logs"] == 1
    assert a.get("/api/sessions/active").json() is None
    assert db_session.query(models.WorkoutSession).count() == 0
    assert db_session.get(models.WorkoutLog, bank) is not None      # erfasster Satz bleibt
    assert db_session.get(models.WorkoutLog, lauf) is None          # leere Plan-Übung weg


def test_fremdes_training_nicht_abbrechbar(seeded, db_session, plan):
    sid = _app(db_session, seeded["user_a"]).post(f"/api/templates/{plan.id}/start").json()["session_id"]
    assert _app(db_session, seeded["user_b"]).delete(f"/api/sessions/{sid}").status_code == 404
    assert db_session.query(models.WorkoutSession).count() == 1
