from fastapi import APIRouter, Depends, HTTPException
import os, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from concurrent.futures import ThreadPoolExecutor
import html as _html
_executor = ThreadPoolExecutor(max_workers=2)
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import date, timedelta
from pydantic import BaseModel
from typing import Optional

from database import get_db
import models, auth
from routers.auth import _delete_avatar_file

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Admin Dependency ──────────────────────────────────────────────────────────

def get_admin_user(current_user: models.User = Depends(auth.get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Kein Admin-Zugriff")
    return current_user


# ── Schemas ───────────────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    id:                 int
    username:           str
    email:              str
    is_active:          bool
    is_verified:        bool
    is_admin:           bool
    created_at:         str
    workout_log_count:  int
    last_active:        Optional[str] = None

    class Config:
        from_attributes = True


class BroadcastMessage(BaseModel):
    subject: str
    message: str

class InactivityNotice(BaseModel):
    days_inactive: int = 30
    warning_days:  int = 7  # "wird in X Tagen gelöscht"


# ── Email Helper ──────────────────────────────────────────────────────────────

def _send_email(to: str, subject: str, html: str, text: str):
    try:
        smtp_host     = os.getenv("SMTP_HOST")
        smtp_port     = int(os.getenv("SMTP_PORT", 587))
        smtp_user     = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")
        from_address  = os.getenv("SMTP_FROM_ADDRESS", smtp_user)
        if not all([smtp_host, smtp_user, smtp_password]):
            return False
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = from_address
        msg["To"]      = to
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo(); server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(from_address, to, msg.as_string())
        return True
    except Exception as e:
        import logging
        logging.getLogger("ironbandit").error(f"Admin E-Mail fehlgeschlagen an {to}: {type(e).__name__}: {e}", exc_info=True)
        return False


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[AdminUserOut])
def list_users(
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()
    result = []
    for u in users:
        log_count = db.query(func.count(models.WorkoutLog.id)).filter(
            models.WorkoutLog.user_id == u.id
        ).scalar() or 0

        last_log = db.query(func.max(models.WorkoutLog.date)).filter(
            models.WorkoutLog.user_id == u.id
        ).scalar()

        result.append(AdminUserOut(
            id=u.id,
            username=u.username,
            email=u.email,
            is_active=u.is_active,
            is_verified=u.is_verified,
            is_admin=u.is_admin,
            created_at=u.created_at.astimezone().strftime("%d.%m.%Y %H:%M") if u.created_at else "—",
            workout_log_count=log_count,
            last_active=last_log.strftime("%d.%m.%Y") if last_log else None
        ))
    return result


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Du kannst deinen eigenen Account nicht löschen")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User nicht gefunden")

    template_ids = [
        t.id for t in db.query(models.WorkoutTemplate.id).filter(
            models.WorkoutTemplate.user_id == user_id
        ).all()
    ]
    if template_ids:
        db.query(models.WorkoutTemplateItem).filter(
            models.WorkoutTemplateItem.template_id.in_(template_ids)
        ).delete(synchronize_session=False)

    log_ids = [
        l.id for l in db.query(models.WorkoutLog.id).filter(
            models.WorkoutLog.user_id == user_id
        ).all()
    ]
    if log_ids:
        db.query(models.WorkoutSet).filter(
            models.WorkoutSet.workout_log_id.in_(log_ids)
        ).delete(synchronize_session=False)

    db.query(models.EmailVerificationToken).filter(models.EmailVerificationToken.user_id == user_id).delete()
    db.query(models.PasswordResetToken).filter(models.PasswordResetToken.user_id == user_id).delete()
    db.query(models.UserExerciseStat).filter(models.UserExerciseStat.user_id == user_id).delete()
    db.query(models.WorkoutLog).filter(models.WorkoutLog.user_id == user_id).delete()
    db.query(models.WeightLog).filter(models.WeightLog.user_id == user_id).delete()
    db.query(models.ExerciseNote).filter(models.ExerciseNote.user_id == user_id).delete()
    db.query(models.WorkoutSession).filter(models.WorkoutSession.user_id == user_id).delete()
    # Plan-Freigaben von/an diesen Nutzer entfernen (FK auf templates/users)
    db.query(models.TemplateShare).filter(
        (models.TemplateShare.from_user_id == user_id) | (models.TemplateShare.to_user_id == user_id)
    ).delete(synchronize_session=False)
    db.query(models.WorkoutTemplate).filter(models.WorkoutTemplate.user_id == user_id).delete()
    # Exercises this user created stay alive for everyone else — only the
    # "creator can delete" permission is lost, leaving just the admin able to.
    db.query(models.Exercise).filter(models.Exercise.created_by_user_id == user_id).update(
        {"created_by_user_id": None}
    )
    _delete_avatar_file(user.avatar_path)
    db.delete(user)
    db.commit()
    return {"message": f"User {user.username} gelöscht"}


@router.put("/users/{user_id}/toggle-active")
def toggle_active(
    user_id: int,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Eigenen Account nicht deaktivierbar")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User nicht gefunden")
    user.is_active = not user.is_active
    db.commit()
    return {"message": f"User {'aktiviert' if user.is_active else 'deaktiviert'}", "is_active": user.is_active}


@router.put("/users/{user_id}/toggle-verified")
def toggle_verified(
    user_id: int,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User nicht gefunden")
    user.is_verified = not user.is_verified
    db.commit()
    return {"message": f"Verifizierung {'aktiviert' if user.is_verified else 'deaktiviert'}", "is_verified": user.is_verified}


@router.post("/users/{user_id}/resend-verification")
def admin_resend_verification(
    user_id: int,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User nicht gefunden")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="User ist bereits verifiziert")

    import secrets
    from datetime import datetime, timedelta, timezone
    from routers.auth import send_verification_email

    db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.user_id == user.id,
        models.EmailVerificationToken.used == False
    ).update({"used": True})

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    verify = models.EmailVerificationToken(user_id=user.id, token=token, expires_at=expires)
    db.add(verify)
    db.commit()

    _executor.submit(send_verification_email, user.username, user.email, token)
    return {"message": f"Verifikations-E-Mail gesendet an {user.email}"}


@router.post("/broadcast")
def broadcast_message(
    data: BroadcastMessage,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Sendet E-Mail an alle verifizierten und aktiven User."""
    users = db.query(models.User).filter(
        models.User.is_verified == True,
        models.User.is_active == True
    ).all()

    if not users:
        raise HTTPException(status_code=400, detail="Keine User gefunden")

    html_template = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <h2 style="color:#34d399;margin-top:0;">📢 IronBandit</h2>
    <div style="color:#e2e8f0;line-height:1.8;white-space:pre-wrap;">{_html.escape(data.message)}</div>
    <hr style="border-color:#334155;margin:24px 0;">
    <p style="color:#475569;font-size:12px;margin:0;">ironbandit.at</p>
  </div>
</body></html>"""

    def _send_all():
        sent = 0
        for user in users:
            personalized = html_template.replace("{username}", _html.escape(user.username))
            safe_subject = data.subject.replace("\r", " ").replace("\n", " ")
            if _send_email(user.email, safe_subject, personalized, data.message):
                sent += 1
        import logging
        logging.getLogger("ironbandit").info(f"Broadcast gesendet: {sent}/{len(users)} User")

    _executor.submit(_send_all)
    return {"message": f"Wird gesendet an {len(users)} User", "count": len(users)}


@router.post("/notify-inactive")
def notify_inactive(
    data: InactivityNotice,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Sendet Inaktivitäts-Warnung an User ohne Workout-Log seit X Tagen."""
    cutoff = date.today() - timedelta(days=data.days_inactive)

    inactive_users = []
    users = db.query(models.User).filter(
        models.User.is_verified == True,
        models.User.is_active == True,
        models.User.is_admin == False
    ).all()

    for user in users:
        last_log = db.query(func.max(models.WorkoutLog.date)).filter(
            models.WorkoutLog.user_id == user.id
        ).scalar()
        if last_log is None or last_log < cutoff:
            inactive_users.append(user)

    if not inactive_users:
        return {"message": "Keine inaktiven User gefunden", "count": 0}

    def _send_warnings():
        sent = 0
        for user in inactive_users:
            html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <h2 style="color:#f59e0b;margin-top:0;">⚠️ Inaktivitäts-Hinweis</h2>
    <p style="color:#94a3b8;">Hallo <strong style="color:#f1f5f9;">{_html.escape(user.username)}</strong>,</p>
    <p style="color:#94a3b8;">dein IronBandit Konto war seit über <strong style="color:#f1f5f9;">{data.days_inactive} Tagen</strong> inaktiv.</p>
    <p style="color:#94a3b8;">Falls du das Konto nicht mehr benötigst, wird es in <strong style="color:#f59e0b;">{data.warning_days} Tagen</strong> gelöscht.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="https://ironbandit.at" style="background:linear-gradient(to right,#34d399,#22d3ee);color:#0f172a;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:15px;">
        Jetzt wieder einloggen
      </a>
    </div>
    <p style="color:#475569;font-size:12px;">Falls du dein Konto behalten möchtest, melde dich einfach an. Die Löschung erfolgt nur wenn du inaktiv bleibst.</p>
    <hr style="border-color:#334155;margin:24px 0;">
    <p style="color:#475569;font-size:12px;margin:0;">ironbandit.at</p>
  </div>
</body></html>"""
            text = (f"Hallo {user.username},\n\ndein Konto war seit {data.days_inactive} Tagen inaktiv "
                   f"und wird in {data.warning_days} Tagen gelöscht.\n\nMelde dich an um es zu behalten:\nhttps://ironbandit.at")
            if _send_email(user.email, "⚠️ IronBandit — Inaktivitäts-Hinweis", html, text):
                sent += 1
        import logging
        logging.getLogger("ironbandit").info(f"Inaktivitäts-Warnungen: {sent}/{len(inactive_users)} gesendet")

    _executor.submit(_send_warnings)
    return {"message": f"Wird gesendet an {len(inactive_users)} inaktive User", "count": len(inactive_users)}


@router.get("/stats")
def admin_stats(
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    total_users    = db.query(func.count(models.User.id)).scalar()
    verified_users = db.query(func.count(models.User.id)).filter(models.User.is_verified == True).scalar()
    total_workout_logs = db.query(func.count(models.WorkoutLog.id)).scalar()
    today_workout_logs = db.query(func.count(models.WorkoutLog.id)).filter(
        models.WorkoutLog.date == date.today()
    ).scalar()
    total_exercises = db.query(func.count(models.Exercise.id)).scalar()

    return {
        "total_users":         total_users,
        "verified_users":      verified_users,
        "total_workout_logs":  total_workout_logs,
        "today_workout_logs":  today_workout_logs,
        "total_exercises":     total_exercises,
    }


# ── wger.de Exercise Import ───────────────────────────────────────────────────
# wger.de's public exercise database (CC-BY-SA licensed) is much larger than our
# hand-seeded list. This is an admin-triggered, on-demand import — never run at
# startup — so it never blocks first boot or depends on outbound network access
# being available yet. Exercises are deduped via Exercise.wger_id.

WGER_CATEGORY_MAP = {
    "Chest":     ("Push",  False),
    "Shoulders": ("Push",  False),
    "Arms":      ("Pull",  False),
    "Back":      ("Pull",  False),
    "Abs":       ("Core",  False),
    "Legs":      ("Legs",  False),
    "Calves":    ("Legs",  False),
    "Cardio":    ("Cardio", True),
}


def _wger_equipment_label(equipment_list):
    if not equipment_list:
        return "None"
    name = equipment_list[0].get("name", "None")
    if "bodyweight" in name.lower():
        return "Bodyweight"
    return name[:100]


def _wger_pick_translation(translations):
    # language 1 = German, 2 = English (wger.de language codes)
    by_lang = {t.get("language"): t for t in translations or []}
    return by_lang.get(1) or by_lang.get(2)


@router.post("/import-wger")
def import_wger_exercises(
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    import httpx
    import logging
    logger = logging.getLogger("ironbandit")

    existing_wger_ids = {
        e.wger_id for e in db.query(models.Exercise.wger_id).filter(models.Exercise.wger_id != None).all()
    }

    imported, skipped, errors = 0, 0, 0
    url = "https://wger.de/api/v2/exerciseinfo/?limit=100&format=json"
    pages_fetched = 0
    MAX_PAGES = 20  # ~2000 exercises ceiling — plenty of headroom over wger's current ~850

    try:
        with httpx.Client(timeout=15.0) as client:
            while url and pages_fetched < MAX_PAGES:
                resp = client.get(url)
                resp.raise_for_status()
                data = resp.json()
                pages_fetched += 1

                for item in data.get("results", []):
                    try:
                        wger_id = item.get("id")
                        if wger_id is None or wger_id in existing_wger_ids:
                            skipped += 1
                            continue

                        translation = _wger_pick_translation(item.get("translations"))
                        if not translation or not translation.get("name"):
                            skipped += 1
                            continue

                        category_name = (item.get("category") or {}).get("name")
                        category, is_cardio = WGER_CATEGORY_MAP.get(category_name, ("Core", False))

                        db.add(models.Exercise(
                            created_by_user_id=None,
                            name=translation["name"][:255],
                            category=category,
                            equipment=_wger_equipment_label(item.get("equipment")),
                            is_cardio=is_cardio,
                            wger_id=wger_id,
                        ))
                        existing_wger_ids.add(wger_id)
                        imported += 1
                    except Exception as item_err:
                        errors += 1
                        logger.warning(f"wger-Import: Eintrag übersprungen ({item_err})")

                db.commit()
                url = data.get("next")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"wger.de nicht erreichbar oder Fehler beim Import: {e}")

    return {
        "message": f"{imported} Übungen importiert, {skipped} übersprungen (bereits vorhanden), {errors} Fehler",
        "imported": imported, "skipped": skipped, "errors": errors
    }
