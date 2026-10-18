from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import date, datetime
from slowapi import Limiter

from database import get_db
import models, auth, plan_csv
from routers.workouts import _bump_use_count
from routers.sessions import attach_to_active_session

router = APIRouter(prefix="/api/templates", tags=["templates"])
# Rate-Limit fürs Teilen: adressiert wird per exaktem Benutzernamen — das Limit
# verhindert, dass jemand darüber massenhaft Benutzernamen durchprobiert.
limiter = Limiter(key_func=auth.get_client_ip)


# ── Schemas ───────────────────────────────────────────────────────────────────
# A template ("Plan") is pure exercise grouping + order. It never carries planned
# sets, weights, reps, duration or distance — those numbers only ever exist on
# WorkoutSet/WorkoutLog, entered live during an actual workout.

class TemplateItemIn(BaseModel):
    exercise_id: int
    # Freitext-Notiz pro Übung. Wird vom CSV-Import gefüllt und muss beim
    # Bearbeiten mitgeschickt werden — update_template ersetzt die Items
    # vollständig, ohne das Feld gingen importierte Notizen still verloren.
    notes: Optional[str] = Field(default=None, max_length=500)

class TemplateCreate(BaseModel):
    # Obergrenzen, weil beides ungebremst durchschlug: ein Name über 255 Zeichen
    # sprengte die VARCHAR(255)-Spalte (unbehandelter 500er), und jedes Item
    # erzeugt in create/update_template ein eigenes SELECT + INSERT + flush —
    # eine Liste mit zehntausenden Einträgen war damit ein DoS-Vektor.
    # Bestandsdaten liegen weit darunter (größter Plan: 7 Übungen).
    name: str = Field(..., min_length=1, max_length=255)
    items: List[TemplateItemIn] = Field(..., max_length=200)

class TemplateItemOut(BaseModel):
    id:            int
    exercise_id:   int
    exercise_name: str
    is_cardio:     bool
    position:      int
    notes:         Optional[str] = None

    class Config:
        from_attributes = True

class TemplateOut(BaseModel):
    id:    int
    name:  str
    items: List[TemplateItemOut]

    class Config:
        from_attributes = True


class ShareCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)


# Höchstzahl offener (noch nicht angenommener/abgelehnter) Freigaben, die ein
# einzelner Empfänger gleichzeitig haben darf — über ALLE Absender hinweg.
MAX_OPEN_SHARES_PER_RECIPIENT = 20

class ShareOut(BaseModel):
    id:            int
    template_name: str
    from_username: str
    exercises:     List[str]
    created_at:    datetime

    class Config:
        from_attributes = True


class SessionExercise(BaseModel):
    log_id:        int
    exercise_id:   int
    exercise_name: str
    is_cardio:     bool

class TemplateStartResult(BaseModel):
    message: str
    count:   int
    session: List[SessionExercise]
    # Laufendes Training (für die Trainingsdauer) — siehe routers/sessions.py
    session_id: Optional[int] = None


def _item_out(item: models.WorkoutTemplateItem) -> TemplateItemOut:
    return TemplateItemOut(
        id=item.id,
        exercise_id=item.exercise_id,
        exercise_name=item.exercise.name,
        is_cardio=item.exercise.is_cardio,
        position=item.position,
        notes=item.notes,
    )


def _clean_notes(raw):
    """Auch aus dem Plan-Editor eingegebene Notizen laufen durch die
    CSV-Härtung: sie landen später im Plan-Export, und eine Zelle wie
    "=HYPERLINK(...)" würde dort sonst als Formel wieder herauskommen."""
    if raw is None:
        return None
    return plan_csv.defuse_cell(raw) or None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[TemplateOut])
def list_templates(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    templates = db.query(models.WorkoutTemplate).filter(
        models.WorkoutTemplate.user_id == current_user.id
    ).order_by(models.WorkoutTemplate.name).all()

    result = []
    for t in templates:
        items = [_item_out(item) for item in t.items]
        result.append(TemplateOut(id=t.id, name=t.name, items=items))
    return result


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(
    data: TemplateCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if not data.items:
        raise HTTPException(status_code=400, detail="Vorlage braucht mindestens eine Übung")

    template = models.WorkoutTemplate(user_id=current_user.id, name=data.name)
    db.add(template)
    db.flush()

    items_out = []
    for position, item in enumerate(data.items, start=1):
        # Exercises are shared across all users — no ownership filter here.
        exercise = db.query(models.Exercise).filter(models.Exercise.id == item.exercise_id).first()
        if not exercise:
            raise HTTPException(status_code=404, detail=f"Übung {item.exercise_id} nicht gefunden")

        ti = models.WorkoutTemplateItem(
            template_id=template.id,
            exercise_id=exercise.id,
            position=position,
            notes=_clean_notes(item.notes),
        )
        db.add(ti)
        db.flush()

        items_out.append(TemplateItemOut(
            id=ti.id, exercise_id=exercise.id, exercise_name=exercise.name,
            is_cardio=exercise.is_cardio, position=position, notes=ti.notes,
        ))

    db.commit()
    return TemplateOut(id=template.id, name=template.name, items=items_out)


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: int,
    data: TemplateCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Edit a plan at any time (also after it has been used for workouts): rename
    it and/or replace its exercise list + order. Past workout logs are untouched —
    they reference exercises directly, not the plan."""
    template = db.query(models.WorkoutTemplate).filter(
        models.WorkoutTemplate.id == template_id,
        models.WorkoutTemplate.user_id == current_user.id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Vorlage nicht gefunden")
    if not data.items:
        raise HTTPException(status_code=400, detail="Vorlage braucht mindestens eine Übung")

    template.name = data.name
    # replace items wholesale (cascade delete-orphan removes the old ones)
    template.items.clear()
    db.flush()

    items_out = []
    for position, item in enumerate(data.items, start=1):
        exercise = db.query(models.Exercise).filter(models.Exercise.id == item.exercise_id).first()
        if not exercise:
            raise HTTPException(status_code=404, detail=f"Übung {item.exercise_id} nicht gefunden")
        ti = models.WorkoutTemplateItem(
            template_id=template.id, exercise_id=exercise.id, position=position,
            notes=_clean_notes(item.notes),
        )
        db.add(ti)
        db.flush()
        items_out.append(TemplateItemOut(
            id=ti.id, exercise_id=exercise.id, exercise_name=exercise.name,
            is_cardio=exercise.is_cardio, position=position, notes=ti.notes,
        ))

    db.commit()
    return TemplateOut(id=template.id, name=template.name, items=items_out)


@router.post("/{template_id}/start", response_model=TemplateStartResult)
def start_template_workout(
    template_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Startet ein Workout aus einer Vorlage. Legt pro Übung einen leeren Log-Eintrag
    an — keine Sätze, keine Dauer/Distanz vorbefüllt. Alle Werte (Sätze, Gewicht,
    Wiederholungen, bzw. Dauer/Distanz bei Cardio) werden erst live, während des
    tatsächlichen Trainings, einer nach dem anderen erfasst."""
    template = db.query(models.WorkoutTemplate).filter(
        models.WorkoutTemplate.id == template_id,
        models.WorkoutTemplate.user_id == current_user.id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Vorlage nicht gefunden")

    session = []
    for item in template.items:
        exercise = item.exercise
        log = models.WorkoutLog(
            user_id=current_user.id,
            exercise_id=exercise.id,
            exercise_name=exercise.name,
            date=date.today()
        )
        db.add(log)
        db.flush()
        _bump_use_count(db, current_user.id, exercise.id)

        session.append(SessionExercise(
            log_id=log.id, exercise_id=exercise.id, exercise_name=exercise.name,
            is_cardio=exercise.is_cardio,
        ))

    workout_session = attach_to_active_session(
        db, current_user.id, template.name, [s.model_dump() for s in session]
    )
    db.commit()
    return TemplateStartResult(
        message=f"Workout '{template.name}' gestartet", count=len(session), session=session,
        session_id=workout_session.id,
    )


@router.delete("/{template_id}", status_code=204)
def delete_template(
    template_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    template = db.query(models.WorkoutTemplate).filter(
        models.WorkoutTemplate.id == template_id,
        models.WorkoutTemplate.user_id == current_user.id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Vorlage nicht gefunden")
    # ausstehende Freigaben dieses Plans mitlöschen (FK)
    db.query(models.TemplateShare).filter(
        models.TemplateShare.template_id == template.id
    ).delete(synchronize_session=False)
    db.delete(template)
    db.commit()


# ── Teilen per Benutzername ───────────────────────────────────────────────────
# Bewusst KEINE Nutzersuche/Autovervollständigung: geteilt werden kann nur an
# einen exakt bekannten Benutzernamen. Der Empfänger sieht die Freigabe in
# seiner Eingangsliste und übernimmt sie als eigene, unabhängige Kopie — oder
# lehnt ab. Das Rate-Limit verhindert Namens-Raten in Masse.

@router.post("/{template_id}/share")
@limiter.limit("10/minute")
def share_template(
    request: Request,
    template_id: int,
    data: ShareCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    template = db.query(models.WorkoutTemplate).filter(
        models.WorkoutTemplate.id == template_id,
        models.WorkoutTemplate.user_id == current_user.id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Vorlage nicht gefunden")

    target = db.query(models.User).filter(
        func.lower(models.User.username) == data.username.strip().lower(),
        models.User.is_active == True
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden — Benutzername exakt eingeben")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Du kannst einen Plan nicht mit dir selbst teilen")

    existing = db.query(models.TemplateShare).filter(
        models.TemplateShare.template_id == template.id,
        models.TemplateShare.to_user_id == target.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"'{template.name}' wurde bereits mit {target.username} geteilt")

    # Deckel auf offene Freigaben pro Empfänger: die Dublettenprüfung oben
    # verhindert nur mehrfaches Teilen DESSELBEN Plans. Mit vielen Plänen ließe
    # sich die Eingangsliste eines Nutzers sonst zuspammen.
    open_shares = db.query(func.count(models.TemplateShare.id)).filter(
        models.TemplateShare.to_user_id == target.id
    ).scalar() or 0
    if open_shares >= MAX_OPEN_SHARES_PER_RECIPIENT:
        raise HTTPException(
            status_code=429,
            detail=f"{target.username} hat bereits {MAX_OPEN_SHARES_PER_RECIPIENT} offene "
                   f"Freigaben — bitte warten, bis diese angenommen oder abgelehnt wurden."
        )

    db.add(models.TemplateShare(
        template_id=template.id, from_user_id=current_user.id, to_user_id=target.id
    ))
    db.commit()
    return {"message": f"'{template.name}' mit {target.username} geteilt"}


@router.get("/shares/incoming", response_model=List[ShareOut])
def incoming_shares(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    shares = db.query(models.TemplateShare).filter(
        models.TemplateShare.to_user_id == current_user.id
    ).order_by(models.TemplateShare.created_at.desc()).all()
    return [
        ShareOut(
            id=sh.id,
            template_name=sh.template.name,
            from_username=sh.from_user.username,
            exercises=[item.exercise.name for item in sh.template.items],
            created_at=sh.created_at,
        )
        for sh in shares
    ]


@router.post("/shares/{share_id}/accept", response_model=TemplateOut)
def accept_share(
    share_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Übernimmt einen geteilten Plan als eigene, unabhängige Kopie (spätere
    Änderungen des Absenders wirken sich nicht mehr aus)."""
    share = db.query(models.TemplateShare).filter(
        models.TemplateShare.id == share_id,
        models.TemplateShare.to_user_id == current_user.id
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="Freigabe nicht gefunden")

    source = share.template
    copy = models.WorkoutTemplate(user_id=current_user.id, name=source.name)
    db.add(copy)
    db.flush()

    items_out = []
    for item in source.items:
        ti = models.WorkoutTemplateItem(
            template_id=copy.id, exercise_id=item.exercise_id, position=item.position,
            notes=item.notes,
        )
        db.add(ti)
        db.flush()
        items_out.append(TemplateItemOut(
            id=ti.id, exercise_id=item.exercise_id, exercise_name=item.exercise.name,
            is_cardio=item.exercise.is_cardio, position=item.position, notes=ti.notes,
        ))

    db.delete(share)
    db.commit()
    return TemplateOut(id=copy.id, name=copy.name, items=items_out)


@router.delete("/shares/{share_id}", status_code=204)
def decline_share(
    share_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Empfänger lehnt ab — oder der Absender zieht die Freigabe zurück."""
    share = db.query(models.TemplateShare).filter(
        models.TemplateShare.id == share_id
    ).first()
    if not share or current_user.id not in (share.to_user_id, share.from_user_id):
        raise HTTPException(status_code=404, detail="Freigabe nicht gefunden")
    db.delete(share)
    db.commit()
