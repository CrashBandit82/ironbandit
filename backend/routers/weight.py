from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta
from pydantic import BaseModel
DateT = date  # alias for annotating fields that are themselves named `date`
              # (avoids the field default shadowing the type -> NoneType in Pydantic v2)

from database import get_db
import models, auth

router = APIRouter(prefix="/api/weight", tags=["weight"])


class WeightCreate(BaseModel):
    weight_kg: float
    date: Optional[DateT] = None


class WeightOut(BaseModel):
    id: int
    weight_kg: float
    date: date

    class Config:
        from_attributes = True


class WeightHistory(BaseModel):
    entries: List[WeightOut]
    latest: Optional[float] = None
    start_weight: Optional[float] = None
    trend: Optional[float] = None   # Differenz letzte 7 Tage


@router.post("", response_model=WeightOut, status_code=201)
def log_weight(
    data: WeightCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if data.weight_kg <= 0 or data.weight_kg > 500:
        raise HTTPException(status_code=400, detail="Ungültiges Gewicht")

    target_date = data.date or date.today()

    existing = db.query(models.WeightLog).filter(
        models.WeightLog.user_id == current_user.id,
        models.WeightLog.date == target_date
    ).first()

    if existing:
        existing.weight_kg = data.weight_kg
        db.commit()
        db.refresh(existing)
        return existing

    entry = models.WeightLog(
        user_id=current_user.id,
        weight_kg=data.weight_kg,
        date=target_date
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/history", response_model=WeightHistory)
def get_history(
    # ge/le zwingend: `date.today() - timedelta(days=99999999)` wirft einen
    # OverflowError und damit einen unbehandelten 500er. 3650 Tage = 10 Jahre.
    days: int = Query(30, ge=1, le=3650),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    since = date.today() - timedelta(days=days)
    entries = db.query(models.WeightLog).filter(
        models.WeightLog.user_id == current_user.id,
        models.WeightLog.date >= since
    ).order_by(models.WeightLog.date).all()

    latest = entries[-1].weight_kg if entries else None
    start  = entries[0].weight_kg  if entries else None
    trend  = None

    if len(entries) >= 2:
        recent = [e for e in entries if e.date >= date.today() - timedelta(days=7)]
        older  = [e for e in entries if e.date <  date.today() - timedelta(days=7)]
        if recent and older:
            trend = round(recent[-1].weight_kg - older[-1].weight_kg, 1)

    return WeightHistory(
        entries=[WeightOut.model_validate(e) for e in entries],
        latest=latest,
        start_weight=start,
        trend=trend
    )


class WeightUpdate(BaseModel):
    weight_kg: Optional[float] = None
    date: Optional[DateT] = None


@router.put("/{entry_id}", response_model=WeightOut)
def update_entry(
    entry_id: int,
    data: WeightUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Edit a past weight entry (value and/or date). Old entries stay editable."""
    entry = db.query(models.WeightLog).filter(
        models.WeightLog.id == entry_id,
        models.WeightLog.user_id == current_user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    if data.weight_kg is not None:
        if data.weight_kg <= 0 or data.weight_kg > 500:
            raise HTTPException(status_code=400, detail="Ungültiges Gewicht")
        entry.weight_kg = data.weight_kg

    if data.date is not None and data.date != entry.date:
        clash = db.query(models.WeightLog).filter(
            models.WeightLog.user_id == current_user.id,
            models.WeightLog.date == data.date,
            models.WeightLog.id != entry.id
        ).first()
        if clash:
            raise HTTPException(status_code=400, detail="Für dieses Datum gibt es bereits einen Eintrag")
        entry.date = data.date

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    entry = db.query(models.WeightLog).filter(
        models.WeightLog.id == entry_id,
        models.WeightLog.user_id == current_user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    db.delete(entry)
    db.commit()
