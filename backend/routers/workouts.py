from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date, timedelta

from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/api/workouts", tags=["workouts"])

DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


# ── Exercises ─────────────────────────────────────────────────────────────────

@router.get("/exercises", response_model=List[schemas.ExerciseOut])
def list_exercises(
    search: Optional[str] = None,
    category: Optional[str] = None,
    is_cardio: Optional[bool] = None,
    # Paginiert, damit die Antwortgröße nicht unbegrenzt mit dem Bestand wächst
    # (aktuell ~880 Übungen, jede Nutzung lud bisher alle auf einmal). Das
    # Frontend holt die Seiten nacheinander, um seine Relevanzsuche weiterhin
    # über den Gesamtbestand laufen zu lassen.
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Exercises are shared across all users — no ownership filter here.
    query = db.query(models.Exercise)
    if search:
        query = query.filter(models.Exercise.name.ilike(f"%{search}%"))
    if category:
        query = query.filter(models.Exercise.category == category)
    if is_cardio is not None:
        query = query.filter(models.Exercise.is_cardio == is_cardio)

    exercises = query.order_by(models.Exercise.name, models.Exercise.id).offset(offset).limit(limit).all()

    stats = {
        s.exercise_id: s.use_count
        for s in db.query(models.UserExerciseStat).filter(
            models.UserExerciseStat.user_id == current_user.id
        ).all()
    }

    result = []
    for e in exercises:
        out = schemas.ExerciseOut.model_validate(e)
        out.use_count = stats.get(e.id, 0)
        out.can_edit = _may_edit_exercise(current_user, e)
        result.append(out)
    return result


def _may_edit_exercise(user: models.User, exercise: models.Exercise) -> bool:
    """Editing/deleting an exercise is allowed for an admin (always) or the user
    who originally created it. wger-imports / hand-seeded ones have no creator, so
    only an admin can touch those."""
    return bool(user.is_admin or exercise.created_by_user_id == user.id)


def _foreign_plan_usage(db: Session, exercise_id: int, user_id: int) -> int:
    """Anzahl FREMDER Pläne (Pläne anderer Nutzer), die diese Übung enthalten.

    Hintergrund: Übungen sind global sichtbar, und das Löschen einer Übung
    entfernt die zugehörigen Plan-Einträge ALLER Nutzer. Wer eine viel genutzte
    Übung anlegt und später löscht, würde damit fremde Trainingspläne
    beschneiden. Solange also ein anderer Nutzer die Übung in einem Plan hat,
    ist Ändern und Löschen gesperrt — bewusst auch für Admins, damit es keinen
    Weg gibt, fremde Pläne unbemerkt zu verändern."""
    return db.query(func.count(func.distinct(models.WorkoutTemplateItem.template_id))).join(
        models.WorkoutTemplate,
        models.WorkoutTemplate.id == models.WorkoutTemplateItem.template_id
    ).filter(
        models.WorkoutTemplateItem.exercise_id == exercise_id,
        models.WorkoutTemplate.user_id != user_id,
    ).scalar() or 0


# Selbst angelegte Übungen sind für ALLE Nutzer sichtbar. Ohne Obergrenze könnte
# ein einzelnes Konto die gemeinsame Übungsliste unbrauchbar machen. Die Grenze
# greift nur beim Anlegen NEUER Übungen — wer bereits mehr hat, behält sie und
# kann sie unverändert weiter nutzen und bearbeiten.
MAX_OWN_EXERCISES = 200


@router.post("/exercises", response_model=schemas.ExerciseOut, status_code=201)
def create_exercise(
    data: schemas.ExerciseCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    own_count = db.query(func.count(models.Exercise.id)).filter(
        models.Exercise.created_by_user_id == current_user.id
    ).scalar() or 0
    if own_count >= MAX_OWN_EXERCISES:
        raise HTTPException(
            status_code=409,
            detail=f"Du hast das Limit von {MAX_OWN_EXERCISES} selbst angelegten Übungen "
                   f"erreicht. Lösche nicht mehr benötigte Übungen, um neue anzulegen."
        )

    exercise = models.Exercise(created_by_user_id=current_user.id, **data.model_dump())
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    out = schemas.ExerciseOut.model_validate(exercise)
    out.can_edit = _may_edit_exercise(current_user, exercise)
    return out


@router.put("/exercises/{exercise_id}", response_model=schemas.ExerciseOut)
def update_exercise(
    exercise_id: int,
    data: schemas.ExerciseCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    exercise = db.query(models.Exercise).filter(models.Exercise.id == exercise_id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Übung nicht gefunden")
    # Editable by an admin (always) or the original creator — same rule as delete.
    if not _may_edit_exercise(current_user, exercise):
        raise HTTPException(status_code=403, detail="Keine Berechtigung, diese Übung zu bearbeiten")
    # Sobald ein anderer Nutzer die Übung in einem Plan hat, ist sie festgeschrieben:
    # eine nachträgliche Umbenennung würde sonst in fremden Plänen auftauchen.
    foreign = _foreign_plan_usage(db, exercise.id, current_user.id)
    if foreign:
        raise HTTPException(
            status_code=409,
            detail=f"Übung kann nicht geändert werden — sie wird von {foreign} "
                   f"{'Plan' if foreign == 1 else 'Plänen'} anderer Nutzer genutzt. "
                   f"Lege stattdessen eine neue Übung an."
        )
    for k, v in data.model_dump().items():
        setattr(exercise, k, v)
    db.commit()
    db.refresh(exercise)
    out = schemas.ExerciseOut.model_validate(exercise)
    out.can_edit = True
    return out


@router.delete("/exercises/{exercise_id}", status_code=204)
def delete_exercise(
    exercise_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    exercise = db.query(models.Exercise).filter(models.Exercise.id == exercise_id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Übung nicht gefunden")
    if not _may_edit_exercise(current_user, exercise):
        raise HTTPException(status_code=403, detail="Keine Berechtigung, diese Übung zu löschen")
    # Harte Sperre, kein Force-Delete: das Löschen würde unten die Plan-Einträge
    # ALLER Nutzer entfernen. Erlaubt ist es nur, wenn die Übung in keinem
    # fremden Plan steht (eigene Pläne des Aufrufers sind unproblematisch —
    # deren Verlust ist seine eigene Entscheidung).
    foreign = _foreign_plan_usage(db, exercise.id, current_user.id)
    if foreign:
        raise HTTPException(
            status_code=409,
            detail=f"Übung kann nicht gelöscht werden — sie wird von {foreign} "
                   f"{'Plan' if foreign == 1 else 'Plänen'} anderer Nutzer genutzt."
        )

    # Referenzen lösen, sonst schlägt das DELETE mit einem FK-Fehler (500) fehl,
    # sobald die Übung je benutzt wurde:
    #  - Plan-Einträge (aller Nutzer) entfernen — der Plan selbst bleibt bestehen
    #  - Nutzungsstatistiken entfernen
    #  - Workout-Logs behalten ihre Historie: exercise_name bleibt als Text
    #    erhalten, nur die FK-Verknüpfung wird gelöst
    db.query(models.WorkoutTemplateItem).filter(
        models.WorkoutTemplateItem.exercise_id == exercise.id
    ).delete(synchronize_session=False)
    db.query(models.UserExerciseStat).filter(
        models.UserExerciseStat.exercise_id == exercise.id
    ).delete(synchronize_session=False)
    #  - Dauernotizen zu dieser Übung entfernen (FK) — ohne Übung gibt es
    #    keinen Ort mehr, an dem sie angezeigt würden
    db.query(models.ExerciseNote).filter(
        models.ExerciseNote.exercise_id == exercise.id
    ).delete(synchronize_session=False)
    db.query(models.WorkoutLog).filter(
        models.WorkoutLog.exercise_id == exercise.id
    ).update({"exercise_id": None}, synchronize_session=False)

    db.delete(exercise)
    db.commit()


@router.get("/exercises/{exercise_id}/last-sets", response_model=schemas.LastSetsOut)
def last_sets_for_exercise(
    exercise_id: int,
    exclude_log_id: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Letzte tatsächlich protokollierte Sätze des Nutzers zu dieser Übung —
    für die Live-Eingabe als 'Letztes Training: 65kg × 8'-Platzhalter, nicht als
    fest eingetragener Wert. `exclude_log_id` blendet das gerade aktive/bearbeitete
    Log aus, damit es sich nicht selbst als 'letztes Mal' anzeigt."""
    query = db.query(models.WorkoutLog).join(
        models.WorkoutSet, models.WorkoutSet.workout_log_id == models.WorkoutLog.id
    ).filter(
        models.WorkoutLog.user_id == current_user.id,
        models.WorkoutLog.exercise_id == exercise_id,
    )
    if exclude_log_id is not None:
        query = query.filter(models.WorkoutLog.id != exclude_log_id)

    last_log = query.order_by(
        models.WorkoutLog.date.desc(), models.WorkoutLog.created_at.desc()
    ).distinct().first()

    if not last_log:
        return schemas.LastSetsOut(date=None, sets=[])

    ordered_sets = sorted(last_log.sets, key=lambda s: s.set_number)
    return schemas.LastSetsOut(
        date=last_log.date,
        sets=[schemas.WorkoutSetOut.model_validate(s) for s in ordered_sets]
    )


# ── Dauernotiz pro Übung ──────────────────────────────────────────────────────
# Eine Notiz je Nutzer und Übung, die bei jedem Training dieser Übung wieder
# erscheint (siehe models.ExerciseNote). Jeder sieht und ändert nur seine eigene.

def _note_out(exercise_id: int, note: Optional[models.ExerciseNote]) -> schemas.ExerciseNoteOut:
    return schemas.ExerciseNoteOut(
        exercise_id=exercise_id,
        notes=note.notes if note else None,
        updated_at=note.updated_at if note else None,
    )


@router.get("/exercises/{exercise_id}/note", response_model=schemas.ExerciseNoteOut)
def get_exercise_note(
    exercise_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    note = db.query(models.ExerciseNote).filter(
        models.ExerciseNote.user_id == current_user.id,
        models.ExerciseNote.exercise_id == exercise_id
    ).first()
    return _note_out(exercise_id, note)


@router.put("/exercises/{exercise_id}/note", response_model=schemas.ExerciseNoteOut)
def put_exercise_note(
    exercise_id: int,
    data: schemas.ExerciseNoteIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if not db.query(models.Exercise.id).filter(models.Exercise.id == exercise_id).first():
        raise HTTPException(status_code=404, detail="Übung nicht gefunden")

    text_ = (data.notes or "").strip()
    note = db.query(models.ExerciseNote).filter(
        models.ExerciseNote.user_id == current_user.id,
        models.ExerciseNote.exercise_id == exercise_id
    ).first()

    if not text_:
        # Leere Notiz = keine Notiz: Zeile entfernen statt Leerstring speichern.
        if note:
            db.delete(note)
            db.commit()
        return _note_out(exercise_id, None)

    if note:
        note.notes = text_
    else:
        note = models.ExerciseNote(user_id=current_user.id, exercise_id=exercise_id, notes=text_)
        db.add(note)
    db.commit()
    db.refresh(note)
    return _note_out(exercise_id, note)


# ── Workout Logs ──────────────────────────────────────────────────────────────

def _bump_use_count(db: Session, user_id: int, exercise_id: int):
    stat = db.query(models.UserExerciseStat).filter(
        models.UserExerciseStat.user_id == user_id,
        models.UserExerciseStat.exercise_id == exercise_id
    ).first()
    if stat:
        stat.use_count += 1
    else:
        db.add(models.UserExerciseStat(user_id=user_id, exercise_id=exercise_id, use_count=1))


@router.post("", response_model=schemas.WorkoutLogOut, status_code=201)
def log_workout(
    data: schemas.WorkoutLogCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    exercise = db.query(models.Exercise).filter(models.Exercise.id == data.exercise_id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Übung nicht gefunden")

    log = models.WorkoutLog(
        user_id=current_user.id,
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        duration_min=data.duration_min, distance_km=data.distance_km,
        notes=data.notes,
        date=data.date or date.today()
    )
    db.add(log)
    db.flush()

    if data.sets:
        for i, s in enumerate(data.sets, start=1):
            db.add(models.WorkoutSet(workout_log_id=log.id, set_number=i, reps=s.reps, weight_kg=s.weight_kg))

    _bump_use_count(db, current_user.id, exercise.id)
    db.commit()
    db.refresh(log)
    return log


@router.get("/today", response_model=List[schemas.WorkoutLogOut])
def logs_today(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _logs_for_date(db, current_user.id, date.today())


@router.get("/date/{target_date}", response_model=List[schemas.WorkoutLogOut])
def logs_for_date(
    target_date: date,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _logs_for_date(db, current_user.id, target_date)


def _logs_for_date(db: Session, user_id: int, target_date: date):
    return db.query(models.WorkoutLog).filter(
        models.WorkoutLog.user_id == user_id,
        models.WorkoutLog.date == target_date
    ).order_by(models.WorkoutLog.created_at).all()


@router.put("/{log_id}", response_model=schemas.WorkoutLogOut)
def update_log(
    log_id: int,
    data: schemas.WorkoutLogUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    log = db.query(models.WorkoutLog).filter(
        models.WorkoutLog.id == log_id,
        models.WorkoutLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    update_data = data.model_dump(exclude_unset=True, exclude={"sets"})
    for k, v in update_data.items():
        setattr(log, k, v)

    if data.sets is not None:
        db.query(models.WorkoutSet).filter(models.WorkoutSet.workout_log_id == log.id).delete()
        for i, s in enumerate(data.sets, start=1):
            db.add(models.WorkoutSet(workout_log_id=log.id, set_number=i, reps=s.reps, weight_kg=s.weight_kg))

    db.commit()
    db.refresh(log)
    return log


@router.delete("/{log_id}", status_code=204)
def delete_log(
    log_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    log = db.query(models.WorkoutLog).filter(
        models.WorkoutLog.id == log_id,
        models.WorkoutLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    db.delete(log)
    db.commit()


# ── Per-set logging & editing ─────────────────────────────────────────────────
# One set at a time, for logging while actually training (do a set at the gym,
# come back to the phone, log just that one set) rather than planning all sets
# up front. These work on any log regardless of its date, so old workouts in the
# history stay fully editable — add / edit / delete individual sets weeks later.
# Distinct from PUT /{log_id} above, which replaces the whole list. Nothing is
# cached: volume/totals are recomputed on read, so edits are always reflected.

@router.post("/{log_id}/sets", response_model=schemas.WorkoutLogOut, status_code=201)
def add_set(
    log_id: int,
    data: schemas.WorkoutSetIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    log = db.query(models.WorkoutLog).filter(
        models.WorkoutLog.id == log_id,
        models.WorkoutLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    next_number = len(log.sets) + 1
    db.add(models.WorkoutSet(workout_log_id=log.id, set_number=next_number, reps=data.reps, weight_kg=data.weight_kg))
    db.commit()
    db.refresh(log)
    return log


@router.put("/{log_id}/sets/{set_id}", response_model=schemas.WorkoutLogOut)
def update_set(
    log_id: int,
    set_id: int,
    data: schemas.WorkoutSetIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Edit a single already-logged set (weight/reps) — also for old history entries."""
    log = db.query(models.WorkoutLog).filter(
        models.WorkoutLog.id == log_id,
        models.WorkoutLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    target = next((s for s in log.sets if s.id == set_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Satz nicht gefunden")

    target.reps = data.reps
    target.weight_kg = data.weight_kg
    db.commit()
    db.refresh(log)
    return log


@router.delete("/{log_id}/sets/{set_id}", response_model=schemas.WorkoutLogOut)
def delete_set(
    log_id: int,
    set_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    log = db.query(models.WorkoutLog).filter(
        models.WorkoutLog.id == log_id,
        models.WorkoutLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    target = next((s for s in log.sets if s.id == set_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Satz nicht gefunden")

    db.delete(target)
    db.flush()

    # renumber remaining sets 1..N so "Satz 1, Satz 2, ..." stays contiguous
    remaining = sorted([s for s in log.sets if s.id != set_id], key=lambda s: s.set_number)
    for i, s in enumerate(remaining, start=1):
        s.set_number = i

    db.commit()
    db.refresh(log)
    return log


# ── Totals ────────────────────────────────────────────────────────────────────

def _totals_for(db: Session, user_id: int, target_date: date) -> schemas.WorkoutDayTotals:
    logs = _logs_for_date(db, user_id, target_date)
    total_sets = sum(len(l.sets) for l in logs)
    total_volume = sum((s.reps or 0) * (s.weight_kg or 0) for l in logs for s in l.sets)
    total_duration = sum(l.duration_min or 0 for l in logs)
    return schemas.WorkoutDayTotals(
        entries=len(logs),
        total_sets=total_sets,
        total_volume_kg=round(total_volume, 1),
        total_duration_min=round(total_duration, 1),
        workout_done=len(logs) > 0
    )


@router.get("/totals/today", response_model=schemas.WorkoutDayTotals)
def totals_today(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _totals_for(db, current_user.id, date.today())


@router.get("/totals/date/{target_date}", response_model=schemas.WorkoutDayTotals)
def totals_for_date(
    target_date: date,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _totals_for(db, current_user.id, target_date)


@router.get("/weekly", response_model=schemas.WorkoutWeeklyStats)
def weekly_stats(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    counts = dict(
        db.query(models.WorkoutLog.date, func.count(func.distinct(models.WorkoutLog.id)))
        .filter(
            models.WorkoutLog.user_id == current_user.id,
            models.WorkoutLog.date >= week_start,
            models.WorkoutLog.date <= week_end
        )
        .group_by(models.WorkoutLog.date)
        .all()
    )
    # Zahl der Trainingseinheiten pro Tag = Anzahl distinkter Log-Timestamps (Sekunde),
    # vereinfachend: ein "Workout" = mind. 1 Log-Eintrag an diesem Tag
    sessions_per_day = {d: 1 for d in counts.keys()}

    days = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        sessions = sessions_per_day.get(d, 0)
        days.append(schemas.WorkoutDayOverview(
            date=d, day_name=DAY_NAMES[i],
            workout_done=sessions > 0, sessions=sessions
        ))

    weekly_total_sessions = sum(d.sessions for d in days)
    avg_daily = round(weekly_total_sessions / 7, 2)

    # Volumen (Σ reps × weight) dieser Woche und der Vorwoche für den Vergleich.
    prev_start = week_start - timedelta(days=7)
    prev_end = week_start - timedelta(days=1)

    def _volume_between(start: date, end: date) -> float:
        vol = (
            db.query(func.coalesce(func.sum(models.WorkoutSet.reps * models.WorkoutSet.weight_kg), 0.0))
            .join(models.WorkoutLog, models.WorkoutSet.workout_log_id == models.WorkoutLog.id)
            .filter(
                models.WorkoutLog.user_id == current_user.id,
                models.WorkoutLog.date >= start,
                models.WorkoutLog.date <= end,
                models.WorkoutSet.weight_kg.isnot(None),
            )
            .scalar()
        )
        return round(float(vol or 0.0), 1)

    def _sessions_between(start: date, end: date) -> int:
        return (
            db.query(func.count(func.distinct(models.WorkoutLog.date)))
            .filter(
                models.WorkoutLog.user_id == current_user.id,
                models.WorkoutLog.date >= start,
                models.WorkoutLog.date <= end,
            )
            .scalar()
        ) or 0

    weekly_volume = _volume_between(week_start, week_end)
    prev_volume = _volume_between(prev_start, prev_end)
    prev_sessions = _sessions_between(prev_start, prev_end)

    change_pct = None
    if prev_volume > 0:
        change_pct = round((weekly_volume - prev_volume) / prev_volume * 100, 1)

    return schemas.WorkoutWeeklyStats(
        week_start=week_start, week_end=week_end, days=days,
        weekly_total_sessions=weekly_total_sessions,
        weekly_goal=current_user.weekly_workout_goal,
        avg_daily_sessions=avg_daily,
        weekly_total_volume_kg=weekly_volume,
        prev_week_total_volume_kg=prev_volume,
        prev_week_total_sessions=prev_sessions,
        volume_change_pct=change_pct,
    )


# ── Stagnations-/Deload-Hinweis ───────────────────────────────────────────────
# Betrachtet je Übung die letzten Einheiten und meldet neutral, wenn über den
# Zeitraum in KEINER Dimension eine Steigerung erkennbar ist. Fortschritt zählt
# in jeder Form (progressive Overload): mehr Gewicht ODER mehr Wiederholungen bei
# gleichem Gewicht ODER mehr Gesamtvolumen. Nur wenn weder Max-Gewicht noch
# Gesamt-Wiederholungen noch Volumen gestiegen sind, gilt es als Stagnation.
# Bewusst konservativ: erst ab MIN_SESSIONS Datenpunkten, um nicht zu früh zu warnen.
STAGNATION_MIN_SESSIONS = 3
STAGNATION_WINDOW = 4  # max. betrachtete jüngste Einheiten je Übung


@router.get("/stagnating", response_model=schemas.StagnatingExercisesOut)
def stagnating_exercises(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Alle Kraft-Logs des Nutzers mit Sätzen, chronologisch je Übung gruppiert.
    logs = (
        db.query(models.WorkoutLog)
        .filter(
            models.WorkoutLog.user_id == current_user.id,
            models.WorkoutLog.exercise_id.isnot(None),
        )
        .order_by(models.WorkoutLog.date.asc(), models.WorkoutLog.created_at.asc())
        .all()
    )

    # Pro Übung: je Einheit die drei Fortschritts-Kennzahlen erfassen
    # (max_weight, total_reps, volume) — nur Einheiten mit Sätzen zählen.
    by_exercise: dict[int, dict] = {}
    for log in logs:
        if not log.sets:
            continue
        weights = [s.weight_kg for s in log.sets if s.weight_kg is not None]
        total_reps = sum(s.reps or 0 for s in log.sets)
        volume = sum((s.reps or 0) * (s.weight_kg or 0) for s in log.sets)
        entry = {
            "date": log.date,
            "max_weight": max(weights) if weights else None,
            "total_reps": total_reps,
            "volume": round(volume, 1),
        }
        grp = by_exercise.setdefault(log.exercise_id, {"name": log.exercise_name, "sessions": []})
        grp["name"] = log.exercise_name or grp["name"]
        grp["sessions"].append(entry)

    # Fortschritt in einer Kennzahl = irgendeine spätere Einheit im Fenster hat
    # den Startwert übertroffen. So gilt auch ein zwischenzeitliches Hoch als
    # Fortschritt, und ein fehlender Startwert (z.B. kein Gewicht bei reiner
    # Körpergewichtsübung) liefert für diesen Kanal einfach kein Signal.
    def _improved(series):
        base = series[0]
        if base is None:
            return False
        return any(v is not None and v > base for v in series[1:])

    result: list[schemas.StagnatingExercise] = []
    for ex_id, grp in by_exercise.items():
        window = grp["sessions"][-STAGNATION_WINDOW:]
        if len(window) < STAGNATION_MIN_SESSIONS:
            continue

        weight_series = [w["max_weight"] for w in window]
        reps_series   = [w["total_reps"] for w in window]
        vol_series    = [w["volume"] for w in window]

        # Stagnation NUR, wenn KEINE der drei Dimensionen gestiegen ist —
        # mehr Gewicht, mehr Wiederholungen ODER mehr Volumen gilt als Fortschritt.
        if _improved(weight_series) or _improved(reps_series) or _improved(vol_series):
            continue

        # Anzeige: Max-Gewicht bevorzugt (aussagekräftigste Headline), sonst
        # Volumen als Kennzahl. Beeinflusst nur die Formulierung, nicht die
        # Stagnations-Entscheidung oben.
        has_weight = all(w is not None for w in weight_series)
        if has_weight:
            metric = "weight"
            first_val, last_val = weight_series[0], weight_series[-1]
        else:
            metric = "volume"
            first_val, last_val = vol_series[0], vol_series[-1]

        span_days = (window[-1]["date"] - window[0]["date"]).days
        weeks = max(1, round(span_days / 7)) if span_days > 0 else 1
        result.append(schemas.StagnatingExercise(
            exercise_id=ex_id,
            exercise_name=grp["name"] or "",
            sessions=len(window),
            weeks_span=weeks,
            metric=metric,
            first_value=round(float(first_val), 1),
            last_value=round(float(last_val), 1),
            unit="kg",
        ))

    # Deterministische Reihenfolge: längste Stagnation zuerst.
    result.sort(key=lambda r: r.weeks_span, reverse=True)
    return schemas.StagnatingExercisesOut(exercises=result)
