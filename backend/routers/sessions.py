"""Trainings-Sessions: Start/Ende eines Trainings für die Trainingsdauer.

Eine Session entsteht beim Starten eines Plans (routers/templates.py ruft
attach_to_active_session) und endet mit "Training abschließen". Startet man
während eines laufenden Trainings einen weiteren Plan, werden dessen Übungen
an die laufende Session angehängt — die Uhr läuft weiter, statt neu zu starten.

Alle Zeitstempel kommen vom Server (UTC). Das Frontend bekommt zusätzlich
`server_now`, um eine abweichende Handy-Uhr auszugleichen.
"""
import json
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models, auth

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

# Feld `date` würde den Typ `date` im Klassenrumpf verdecken (wie in schemas.py).
DateT = date

# Eine nie abgeschlossene Session gilt danach als verworfen (vergessen zu
# beenden) — sonst liefe die Uhr am nächsten Tag mit 20 h weiter.
ACTIVE_MAX_AGE = timedelta(hours=12)


class SessionEntry(BaseModel):
    log_id:        int
    exercise_id:   Optional[int] = None
    exercise_name: str
    is_cardio:     bool = False


class SessionOut(BaseModel):
    id:            int
    template_name: Optional[str] = None
    started_at:    datetime
    finished_at:   Optional[datetime] = None
    duration_sec:  Optional[int] = None
    date:          Optional[DateT] = None
    entries:       List[SessionEntry] = []
    server_now:    datetime


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    # SQLite (Tests) liefert naive Zeitstempel zurück; Postgres timezone-aware.
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _entries(s: models.WorkoutSession) -> list:
    try:
        data = json.loads(s.entries or "[]")
        return data if isinstance(data, list) else []
    except (ValueError, TypeError):
        return []


def _out(s: models.WorkoutSession) -> SessionOut:
    return SessionOut(
        id=s.id, template_name=s.template_name,
        started_at=_aware(s.started_at), finished_at=_aware(s.finished_at),
        duration_sec=s.duration_sec, date=s.date,
        entries=[SessionEntry(**e) for e in _entries(s)],
        server_now=_now(),
    )


def get_active_session(db: Session, user_id: int) -> Optional[models.WorkoutSession]:
    cutoff = _now() - ACTIVE_MAX_AGE
    return db.query(models.WorkoutSession).filter(
        models.WorkoutSession.user_id == user_id,
        models.WorkoutSession.finished_at.is_(None),
        models.WorkoutSession.started_at >= cutoff,
    ).order_by(models.WorkoutSession.started_at.desc()).first()


def attach_to_active_session(db: Session, user_id: int, template_name: Optional[str],
                             new_entries: list) -> models.WorkoutSession:
    """Hängt die Übungen eines frisch gestarteten Plans an die laufende Session
    oder legt eine neue an. Kein commit — das macht der Aufrufer zusammen mit
    den Log-Einträgen, damit beides atomar entsteht."""
    session = get_active_session(db, user_id)
    if session is None:
        session = models.WorkoutSession(
            user_id=user_id, template_name=template_name,
            started_at=_now(), date=date.today(), entries="[]",
        )
        db.add(session)
    elif template_name and session.template_name and template_name not in session.template_name.split(" + "):
        session.template_name = f"{session.template_name} + {template_name}"[:255]

    existing = _entries(session)
    known = {e.get("log_id") for e in existing}
    existing += [e for e in new_entries if e["log_id"] not in known]
    session.entries = json.dumps(existing, ensure_ascii=False)
    return session


@router.get("/active", response_model=Optional[SessionOut])
def active_session(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    s = get_active_session(db, current_user.id)
    return _out(s) if s else None


@router.post("/{session_id}/finish", response_model=SessionOut)
def finish_session(
    session_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    s = db.query(models.WorkoutSession).filter(
        models.WorkoutSession.id == session_id,
        models.WorkoutSession.user_id == current_user.id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Training nicht gefunden")
    if s.finished_at is None:   # idempotent: doppeltes Abschließen ändert nichts
        now = _now()
        s.finished_at = now
        s.duration_sec = max(0, int((now - _aware(s.started_at)).total_seconds()))
        db.commit()
        db.refresh(s)
    return _out(s)


@router.get("/date/{target_date}", response_model=List[SessionOut])
def sessions_for_date(
    target_date: date,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Abgeschlossene Trainings eines Tages — für die Dauer-Anzeige im Verlauf."""
    rows = db.query(models.WorkoutSession).filter(
        models.WorkoutSession.user_id == current_user.id,
        models.WorkoutSession.date == target_date,
        models.WorkoutSession.finished_at.isnot(None),
    ).order_by(models.WorkoutSession.started_at).all()
    return [_out(s) for s in rows]


@router.delete("/{session_id}")
def cancel_session(
    session_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Training abbrechen: die Session (und damit die Trainingsdauer) wird
    verworfen. Plan-Übungen, in die noch nichts eingetragen wurde (keine Sätze,
    keine Dauer), werden mit entfernt — sie entstanden nur durch den Plan-Start.
    Bereits erfasste Sätze bleiben im Verlauf erhalten."""
    s = db.query(models.WorkoutSession).filter(
        models.WorkoutSession.id == session_id,
        models.WorkoutSession.user_id == current_user.id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Training nicht gefunden")

    removed = 0
    if s.finished_at is None:
        log_ids = [e.get("log_id") for e in _entries(s) if e.get("log_id")]
        if log_ids:
            logs = db.query(models.WorkoutLog).filter(
                models.WorkoutLog.id.in_(log_ids),
                models.WorkoutLog.user_id == current_user.id,
            ).all()
            for log in logs:
                if not log.sets and log.duration_min is None:
                    db.delete(log)
                    removed += 1
    db.delete(s)
    db.commit()
    return {"removed_empty_logs": removed}
