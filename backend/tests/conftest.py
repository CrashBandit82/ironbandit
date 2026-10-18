"""Test-Fixtures für den Plan-CSV-Import.

Die Tests laufen gegen eine eigene SQLite-Datei statt gegen Postgres: sie sollen
ohne laufende Container ausführbar sein und niemals Produktivdaten anfassen.
`main.py` wird bewusst NICHT importiert — dessen Import-Nebenwirkungen (Migration
+ create_all gegen die echte DATABASE_URL, Logging nach /var/log) haben in einem
Testlauf nichts verloren. Stattdessen wird eine minimale App nur aus den
Routern gebaut, die geprüft werden.
"""

import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Muss VOR dem Import von database/models gesetzt sein — database.py legt das
# Engine-Objekt beim Import an.
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-used-in-production")
os.environ.setdefault("REFRESH_SECRET_KEY", "test-refresh-secret-not-used-in-production")

import auth  # noqa: E402
import database  # noqa: E402
import models  # noqa: E402
from routers import plan_import, templates  # noqa: E402


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,   # eine einzige In-Memory-DB für alle Verbindungen
    )
    models.Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        models.Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def seeded(db_session):
    """Zwei Nutzer + ein paar Übungen. User A ist der Aufrufer, User B dient
    dazu, die Fremdzugriffs-Prüfung auf Vorschau-Sessions zu belegen."""
    user_a = models.User(
        email="a@example.com", username="usera",
        hashed_password="x", is_active=True, is_verified=True,
    )
    user_b = models.User(
        email="b@example.com", username="userb",
        hashed_password="x", is_active=True, is_verified=True,
    )
    db_session.add_all([user_a, user_b])
    db_session.flush()

    exercises = {}
    for name, cardio in [
        ("Bankdrücken", False), ("Schulterdrücken", False), ("Klimmzüge", False),
        ("Trizeps-Pushdown", False), ("Laufen", True),
    ]:
        ex = models.Exercise(name=name, is_cardio=cardio, created_by_user_id=None)
        db_session.add(ex)
        db_session.flush()
        exercises[name] = ex.id

    db_session.commit()
    return {"user_a": user_a, "user_b": user_b, "exercises": exercises}


def _build_app(db_session, current_user):
    app = FastAPI()
    app.include_router(plan_import.router)
    app.include_router(templates.router)

    # Rate-Limiter für die Funktionstests stilllegen — er wird in
    # test_rate_limit_greift gezielt wieder eingeschaltet.
    plan_import.limiter.enabled = False
    app.state.limiter = plan_import.limiter

    app.dependency_overrides[database.get_db] = lambda: db_session
    app.dependency_overrides[auth.get_current_user] = lambda: current_user
    return app


@pytest.fixture()
def client_factory(db_session):
    """→ client_factory(user) liefert einen TestClient, der als `user` auftritt."""
    def _make(current_user):
        return TestClient(_build_app(db_session, current_user))
    return _make


@pytest.fixture()
def client(seeded, client_factory):
    return client_factory(seeded["user_a"])
