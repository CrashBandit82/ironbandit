from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from slowapi import Limiter
import smtplib
import os
import secrets
import uuid
from pathlib import Path
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
import html as _html

from PIL import Image

_executor = ThreadPoolExecutor(max_workers=2)

# Pillow-Angriffsfläche auf die drei tatsächlich erlaubten Formate reduzieren.
# Grund: `file.content_type` ist ein vom Client gesetzter Header und damit
# wertlos als Formatprüfung — Pillow bestimmt das Format am Dateiinhalt. Ohne
# diese Beschränkung erreicht ein als "image/png" deklarierter Upload jeden
# registrierten Decoder (PSD, FITS, JPEG2000, PDF, TGA, …), und genau dort
# saßen die Speicherfehler der 10.3.0-Advisories. Das Deregistrieren passiert
# einmalig beim Import: Image.init() lädt alle Plugins, danach bleiben nur die
# erlaubten Opener übrig; alles andere endet in UnidentifiedImageError.
AVATAR_ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
Image.init()
for _fmt in list(Image.OPEN):
    if _fmt not in AVATAR_ALLOWED_FORMATS:
        del Image.OPEN[_fmt]
# Image.open() geht Image.ID der Reihe nach durch und schlägt jeden Eintrag in
# Image.OPEN nach — bleibt die Liste unbereinigt, endet schon ein gültiges PNG
# in einem KeyError statt in einer sauberen Ablehnung. Beide Strukturen müssen
# deshalb denselben Stand haben.
Image.ID[:] = [_i for _i in Image.ID if _i in AVATAR_ALLOWED_FORMATS]
# Zweiter Riegel gegen Decompression-Bombs (zusätzlich zur expliziten
# Pixelprüfung im Upload) — Pillow warnt/bricht ab jenseits dieser Größe.
Image.MAX_IMAGE_PIXELS = 30_000_000

from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/api/auth", tags=["auth"])
# Limits pro echter Client-IP (X-Forwarded-For von nginx) — nicht pro Proxy-IP,
# sonst teilen sich ALLE Nutzer ein Limit und einer kann den Login für alle sperren.
limiter = Limiter(key_func=auth.get_client_ip)

# Vorberechneter Bcrypt-Hash für den Login-Timing-Ausgleich: bei unbekannter
# E-Mail wird trotzdem einmal verify_password() dagegen laufen gelassen, damit
# existierende und nicht-existierende Konten dieselbe Antwortzeit haben (sonst
# verrät der ~100ms-Unterschied per Timing, welche E-Mails registriert sind).
_DUMMY_PASSWORD_HASH = auth.hash_password("timing-equalizer-not-a-real-password")

AVATAR_DIR = Path("/opt/ironbandit/uploads/avatars")
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
AVATAR_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _delete_avatar_file(avatar_path: str | None):
    """Löscht die zugehörige Datei auf der Platte, falls vorhanden (Konto-Löschung,
    Admin-Löschung, Ersetzen durch ein neues Avatar). Fehler werden bewusst
    verschluckt — ein fehlendes File darf die eigentliche Aktion nicht blockieren."""
    if not avatar_path:
        return
    try:
        old = AVATAR_DIR / Path(avatar_path).name
        if old.exists():
            old.unlink()
    except Exception:
        pass


def _smtp_from():
    """Absenderadresse für ausgehende Mails — separat vom SMTP-Login-Konto."""
    return os.getenv("SMTP_FROM_ADDRESS") or os.getenv("SMTP_USER")


def send_welcome_email(username: str, email: str):
    """Sendet Willkommens-E-Mail nach erfolgreicher Verifikation."""
    try:
        smtp_host     = os.getenv("SMTP_HOST")
        smtp_port     = int(os.getenv("SMTP_PORT", 587))
        smtp_user     = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")
        if not all([smtp_host, smtp_user, smtp_password]):
            return
        from_address = _smtp_from()

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🏋️ Willkommen bei IronBandit, {username}!"
        msg["From"]    = from_address
        msg["To"]      = email

        text = (f"Hallo {username}!\n\n"
                f"Deine E-Mail wurde bestätigt.\n\n"
                f"Schnellstart:\n"
                f"1. Wochenziel setzen (Wochenziel anpassen Button)\n"
                f"2. Erstes Workout eintragen (+ Button)\n"
                f"3. Trainingsplan als Vorlage speichern für schnelles Eintragen\n\n"
                f"Viel Erfolg!\nironbandit.at")

        html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <h2 style="color:#34d399;margin-top:0;">🏋️ Willkommen, {_html.escape(username)}!</h2>
    <p style="color:#94a3b8;">Deine E-Mail wurde bestätigt. Los geht's:</p>
    <ol style="color:#94a3b8;line-height:1.8;">
      <li>Wochenziel setzen</li>
      <li>Erstes Workout eintragen (+ Button)</li>
      <li>Trainingsplan als Vorlage speichern</li>
    </ol>
    <hr style="border-color:#334155;margin:24px 0;">
    <p style="color:#475569;font-size:12px;margin:0;">ironbandit.at</p>
  </div>
</body></html>"""

        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo(); server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(from_address, email, msg.as_string())
    except Exception as e:
        import logging
        logging.getLogger("ironbandit").error(f"Welcome-E-Mail fehlgeschlagen: {type(e).__name__}: {e}", exc_info=True)


def send_verification_email(username: str, email: str, token: str):
    """Sendet E-Mail Verifikationslink an neuen User."""
    try:
        smtp_host     = os.getenv("SMTP_HOST")
        smtp_port     = int(os.getenv("SMTP_PORT", 587))
        smtp_user     = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")
        if not all([smtp_host, smtp_user, smtp_password]):
            return
        from_address = _smtp_from()
        # Token als URL-FRAGMENT (#) statt als Query-Parameter (?): Fragmente
        # werden vom Browser nie an den Server geschickt und landen damit auch
        # nicht im nginx-Access-Log ($request enthält den Query-String). Vorher
        # standen gültige Einmal-Tokens im Klartext in logs/nginx/access.log.
        verify_url = f"https://ironbandit.at/verify-email#token={token}"
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "✅ IronBandit — E-Mail bestätigen"
        msg["From"]    = from_address
        msg["To"]      = email
        text = f"Hallo {username},\n\nBitte bestätige deine E-Mail:\n{verify_url}\n\nDer Link ist 24 Stunden gültig."
        html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <h2 style="color:#34d399;margin-top:0;">✅ E-Mail bestätigen</h2>
    <p style="color:#94a3b8;">Hallo <strong style="color:#f1f5f9;">{_html.escape(username)}</strong>,</p>
    <p style="color:#94a3b8;">Willkommen bei IronBandit! Bitte bestätige deine E-Mail-Adresse.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="{verify_url}" style="background:linear-gradient(to right,#34d399,#22d3ee);color:#0f172a;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:16px;">
        E-Mail bestätigen
      </a>
    </div>
    <p style="color:#475569;font-size:12px;">Der Link ist <strong>24 Stunden</strong> gültig. Du kannst dich aber auch ohne Bestätigung bereits anmelden.</p>
    <hr style="border-color:#334155;margin:24px 0;">
    <p style="color:#475569;font-size:11px;word-break:break-all;">{verify_url}</p>
  </div>
</body></html>"""
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo(); server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(from_address, email, msg.as_string())
    except Exception as e:
        import logging
        logging.getLogger("ironbandit").error(f"Verifikations-E-Mail fehlgeschlagen: {type(e).__name__}: {e}", exc_info=True)


def send_registration_email(username: str, email: str):
    try:
        smtp_host     = os.getenv("SMTP_HOST")
        smtp_port     = int(os.getenv("SMTP_PORT", 587))
        smtp_user     = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")
        notify_email  = os.getenv("NOTIFY_EMAIL")

        if not all([smtp_host, smtp_user, smtp_password, notify_email]):
            return
        from_address = _smtp_from()

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🏋️ IronBandit — Neuer User: {username}"
        msg["From"]    = from_address
        msg["To"]      = notify_email

        now = datetime.now().strftime("%d.%m.%Y um %H:%M Uhr")

        text = f"Neuer User registriert!\n\nBenutzername: {username}\nRegistriert: {now}\n\nironbandit.at"
        html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <h2 style="color:#34d399;margin-top:0;">🏋️ Neuer User auf IronBandit!</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="color:#94a3b8;padding:8px 0;width:140px;">Benutzername</td>
        <td style="color:#f1f5f9;font-weight:bold;">{_html.escape(username)}</td>
      </tr>
      <tr>
        <td style="color:#94a3b8;padding:8px 0;">Registriert am</td>
        <td style="color:#f1f5f9;">{now}</td>
      </tr>
    </table>
    <hr style="border-color:#334155;margin:24px 0;">
    <p style="color:#475569;font-size:12px;margin:0;">ironbandit.at</p>
  </div>
</body></html>"""

        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(from_address, notify_email, msg.as_string())

    except Exception as e:
        import logging
        logging.getLogger("ironbandit").error(f"E-Mail Benachrichtigung fehlgeschlagen: {type(e).__name__}: {e}", exc_info=True)


@router.post("/register", response_model=schemas.UserOut, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, data: schemas.UserRegister, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(status_code=400, detail="E-Mail bereits registriert")
    # Case-insensitiv prüfen — sonst könnten "Bob" und "bob" als zwei getrennte
    # Konten registriert werden, obwohl das Plan-Teilen Benutzernamen bereits
    # case-insensitiv auflöst (führt sonst zu nicht eindeutiger Zielauswahl).
    if db.query(models.User).filter(func.lower(models.User.username) == data.username.strip().lower()).first():
        raise HTTPException(status_code=400, detail="Benutzername bereits vergeben")

    user = models.User(
        email=data.email,
        username=data.username,
        hashed_password=auth.hash_password(data.password),
        is_verified=False
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Verifikations-Token erstellen (Login funktioniert bereits ohne Bestätigung)
    verify_token = secrets.token_urlsafe(32)
    verify_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    verify = models.EmailVerificationToken(
        user_id=user.id, token=verify_token, expires_at=verify_expires
    )
    db.add(verify)
    db.commit()

    # E-Mails non-blocking senden (no-op falls SMTP nicht konfiguriert)
    _executor.submit(send_verification_email, user.username, user.email, verify_token)
    _executor.submit(send_registration_email, user.username, user.email)
    return user


@router.post("/login", response_model=schemas.Token)
@limiter.limit("10/minute")
def login(request: Request, data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        # Dummy-Verify gegen konstanten Hash → gleiche Antwortzeit wie bei
        # existierendem Konto (Timing-Enumeration verhindern).
        auth.verify_password(data.password, _DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-Mail oder Passwort falsch")
    if not auth.verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-Mail oder Passwort falsch")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Konto deaktiviert")
    # Soft-Verifikation: unbestätigte E-Mail blockiert den Login NICHT,
    # der Nutzer sieht stattdessen einen Hinweis-Banner im Dashboard.
    return schemas.Token(
        access_token=auth.create_access_token(user.id),
        refresh_token=auth.create_refresh_token(user.id)
    )


@router.post("/refresh", response_model=schemas.Token)
def refresh(data: schemas.TokenRefresh, db: Session = Depends(get_db)):
    payload = auth.decode_refresh_payload(data.refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Ungültiger oder abgelaufener Refresh Token")
    user = db.query(models.User).filter(
        models.User.id == int(payload["sub"]), models.User.is_active == True
    ).first()
    if not user:
        raise HTTPException(status_code=401, detail="Benutzer nicht gefunden")
    # Refresh-Tokens von vor der letzten Passwortänderung sind ungültig — sonst
    # bliebe ein gestohlenes Refresh-Token nach einem Passwort-Reset 30 Tage nutzbar.
    if not auth.verify_token_age(user, payload.get("iat")):
        raise HTTPException(status_code=401, detail="Ungültiger oder abgelaufener Refresh Token")
    return schemas.Token(
        access_token=auth.create_access_token(user.id),
        refresh_token=auth.create_refresh_token(user.id)
    )


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


@router.put("/goals", response_model=schemas.UserOut)
def update_goals(
    data: schemas.WeeklyGoalUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    current_user.weekly_workout_goal = data.weekly_workout_goal
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, data: schemas.ForgotPassword, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    # Immer gleiche Antwort — verhindert User-Enumeration
    response = {"message": "Falls die E-Mail existiert, wurde ein Reset-Link gesendet"}
    if not user:
        return response

    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user.id,
        models.PasswordResetToken.used == False
    ).update({"used": True})

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=1)
    reset = models.PasswordResetToken(user_id=user.id, token=token, expires_at=expires)
    db.add(reset)
    db.commit()

    # Token als URL-Fragment (#) — siehe Begründung bei verify_url.
    reset_url = f"https://ironbandit.at/reset-password#token={token}"

    # Versand asynchron: die Antwortzeit darf nicht verraten, ob die E-Mail
    # existiert (Timing-Enumeration), und ein langsamer SMTP-Server soll den
    # Request-Worker nicht blockieren.
    # Nur Plain-Strings in den Thread geben — das ORM-Objekt ist nach Session-Ende
    # detached und würde beim Attributzugriff im Thread crashen.
    def _send_reset_mail(username, email):
      try:
        smtp_host     = os.getenv("SMTP_HOST")
        smtp_port     = int(os.getenv("SMTP_PORT", 587))
        smtp_user     = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")

        if all([smtp_host, smtp_user, smtp_password]):
            from_address = _smtp_from()
            msg = MIMEMultipart("alternative")
            msg["Subject"] = "🔑 IronBandit — Passwort zurücksetzen"
            msg["From"]    = from_address
            msg["To"]      = email

            text = f"Hallo {username},\n\nDu hast eine Passwortzurücksetzung angefordert.\n\nLink: {reset_url}\n\nDer Link ist 1 Stunde gültig.\n\nFalls du das nicht warst, ignoriere diese E-Mail."
            html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <h2 style="color:#34d399;margin-top:0;">🔑 Passwort zurücksetzen</h2>
    <p style="color:#94a3b8;">Hallo <strong style="color:#f1f5f9;">{_html.escape(username)}</strong>,</p>
    <p style="color:#94a3b8;">Du hast eine Passwortzurücksetzung für dein IronBandit Konto angefordert.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="{reset_url}" style="background:linear-gradient(to right,#34d399,#22d3ee);color:#0f172a;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:16px;">
        Passwort zurücksetzen
      </a>
    </div>
    <p style="color:#475569;font-size:12px;">Der Link ist <strong>1 Stunde</strong> gültig.<br>Falls du das nicht warst, ignoriere diese E-Mail.</p>
    <hr style="border-color:#334155;margin:24px 0;">
    <p style="color:#475569;font-size:11px;word-break:break-all;">Link: {reset_url}</p>
  </div>
</body></html>"""

            msg.attach(MIMEText(text, "plain"))
            msg.attach(MIMEText(html, "html"))

            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.sendmail(from_address, email, msg.as_string())
      except Exception as e:
        import logging
        logging.getLogger("ironbandit").error(f"Reset E-Mail fehlgeschlagen: {type(e).__name__}: {e}", exc_info=True)

    _executor.submit(_send_reset_mail, user.username, user.email)
    return response


@router.post("/verify-email")
def verify_email(data: schemas.VerifyEmail, db: Session = Depends(get_db)):
    """Bestätigt die E-Mail-Adresse. Der Token kommt im Body — als Query-Parameter
    stünde er im nginx-Access-Log."""
    return _verify_email_token(data.token, db)


@router.get("/verify-email", deprecated=True)
def verify_email_legacy(token: str, db: Session = Depends(get_db)):
    """Übergangsvariante für Links aus E-Mails, die vor dieser Änderung
    verschickt wurden (Gültigkeit 24 h), und für Browser mit noch gecachtem
    altem Frontend-Bundle. Kann entfernt werden, sobald keine Altlinks mehr
    im Umlauf sind. Achtung: Dieser Pfad schreibt den Token weiterhin ins
    Access-Log — deshalb NICHT für neue Links verwenden."""
    return _verify_email_token(token, db)


def _verify_email_token(token: str, db: Session):
    record = db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.token == token,
        models.EmailVerificationToken.used == False
    ).first()
    if not record:
        raise HTTPException(status_code=400, detail="Ungültiger oder bereits verwendeter Token")
    if record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token abgelaufen — bitte neu anfordern")
    user = db.query(models.User).filter(models.User.id == record.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    user.is_verified = True
    record.used = True
    db.commit()
    _executor.submit(send_welcome_email, user.username, user.email)
    return {"message": "E-Mail erfolgreich bestätigt"}


@router.post("/resend-verification")
@limiter.limit("3/minute")
def resend_verification(request: Request, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if current_user.is_verified:
        raise HTTPException(status_code=400, detail="E-Mail bereits verifiziert")
    db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.user_id == current_user.id,
        models.EmailVerificationToken.used == False
    ).update({"used": True})
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    verify = models.EmailVerificationToken(user_id=current_user.id, token=token, expires_at=expires)
    db.add(verify)
    db.commit()
    _executor.submit(send_verification_email, current_user.username, current_user.email, token)
    return {"message": "Verifikations-E-Mail erneut gesendet"}


@router.post("/feedback")
@limiter.limit("3/minute")
def send_feedback(request: Request, data: schemas.FeedbackCreate, current_user: models.User = Depends(auth.get_current_user)):
    def _send():
        try:
            smtp_host     = os.getenv("SMTP_HOST")
            smtp_port     = int(os.getenv("SMTP_PORT", 587))
            smtp_user     = os.getenv("SMTP_USER")
            smtp_password = os.getenv("SMTP_PASSWORD")
            notify_email  = os.getenv("NOTIFY_EMAIL", "trainer@ironbandit.at")
            if not all([smtp_host, smtp_user, smtp_password]):
                return
            from_address = _smtp_from()
            from datetime import datetime as dt
            now = dt.now().strftime("%d.%m.%Y um %H:%M Uhr")
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"💬 IronBandit Feedback von {current_user.username}"
            msg["From"]    = from_address
            msg["To"]      = notify_email
            text = f"Feedback von {current_user.username} ({current_user.email})\n\n{data.message}"
            html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <h2 style="color:#34d399;margin-top:0;">💬 Neues Feedback</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="color:#94a3b8;padding:8px 0;width:140px;">Benutzername</td><td style="color:#f1f5f9;font-weight:bold;">{_html.escape(current_user.username)}</td></tr>
      <tr><td style="color:#94a3b8;padding:8px 0;">E-Mail</td><td style="color:#f1f5f9;">{_html.escape(current_user.email)}</td></tr>
      <tr><td style="color:#94a3b8;padding:8px 0;">Gesendet am</td><td style="color:#f1f5f9;">{now}</td></tr>
    </table>
    <hr style="border-color:#334155;margin:24px 0;">
    <div style="background:#0f172a;border-radius:12px;padding:16px;color:#f1f5f9;line-height:1.7;white-space:pre-wrap;">{_html.escape(data.message)}</div>
    <hr style="border-color:#334155;margin:24px 0;">
    <p style="color:#475569;font-size:12px;margin:0;">ironbandit.at</p>
  </div>
</body></html>"""
            msg.attach(MIMEText(text, "plain"))
            msg.attach(MIMEText(html, "html"))
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.ehlo(); server.starttls()
                server.login(smtp_user, smtp_password)
                server.sendmail(from_address, notify_email, msg.as_string())
        except Exception as e:
            import logging
            logging.getLogger("ironbandit").error(f"Feedback-Mail fehlgeschlagen: {type(e).__name__}: {e}", exc_info=True)
    _executor.submit(_send)
    return {"message": "Feedback gesendet — danke!"}


@router.delete("/account")
def delete_account(
    data: schemas.DeleteAccount,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if not auth.verify_password(data.password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Passwort falsch")

    _delete_avatar_file(current_user.avatar_path)

    template_ids = [
        t.id for t in db.query(models.WorkoutTemplate.id).filter(
            models.WorkoutTemplate.user_id == current_user.id
        ).all()
    ]
    if template_ids:
        db.query(models.WorkoutTemplateItem).filter(
            models.WorkoutTemplateItem.template_id.in_(template_ids)
        ).delete(synchronize_session=False)

    log_ids = [
        l.id for l in db.query(models.WorkoutLog.id).filter(
            models.WorkoutLog.user_id == current_user.id
        ).all()
    ]
    if log_ids:
        db.query(models.WorkoutSet).filter(
            models.WorkoutSet.workout_log_id.in_(log_ids)
        ).delete(synchronize_session=False)

    db.query(models.EmailVerificationToken).filter(models.EmailVerificationToken.user_id == current_user.id).delete()
    db.query(models.PasswordResetToken).filter(models.PasswordResetToken.user_id == current_user.id).delete()
    db.query(models.UserExerciseStat).filter(models.UserExerciseStat.user_id == current_user.id).delete()
    db.query(models.WorkoutLog).filter(models.WorkoutLog.user_id == current_user.id).delete()
    db.query(models.WeightLog).filter(models.WeightLog.user_id == current_user.id).delete()
    db.query(models.ExerciseNote).filter(models.ExerciseNote.user_id == current_user.id).delete()
    db.query(models.WorkoutSession).filter(models.WorkoutSession.user_id == current_user.id).delete()
    # Plan-Freigaben von/an diesen Nutzer entfernen (FK auf templates/users)
    db.query(models.TemplateShare).filter(
        (models.TemplateShare.from_user_id == current_user.id) | (models.TemplateShare.to_user_id == current_user.id)
    ).delete(synchronize_session=False)
    db.query(models.WorkoutTemplate).filter(models.WorkoutTemplate.user_id == current_user.id).delete()
    # Exercises this user created stay alive for everyone else — only the
    # "creator can delete" permission is lost, leaving just the admin able to.
    db.query(models.Exercise).filter(models.Exercise.created_by_user_id == current_user.id).update(
        {"created_by_user_id": None}
    )
    db.delete(current_user)
    db.commit()
    return {"message": "Konto erfolgreich gelöscht"}


@router.put("/username", response_model=schemas.UserOut)
def change_username(
    data: schemas.UsernameChange,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Case-insensitiv prüfen — siehe Kommentar bei der Registrierung.
    existing = db.query(models.User).filter(
        func.lower(models.User.username) == data.username.strip().lower(),
        models.User.id != current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Benutzername bereits vergeben")
    current_user.username = data.username
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/avatar", response_model=schemas.UserOut)
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if file.content_type not in AVATAR_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Nur JPG, PNG oder WEBP erlaubt")

    # Content-Length früh prüfen (falls vom Client gesendet) — spart das
    # Einlesen großer Bodies, statt die Größe erst danach festzustellen.
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > AVATAR_MAX_SIZE_BYTES + 10_000:
        raise HTTPException(status_code=400, detail="Datei zu groß (max. 5MB)")

    contents = await file.read()
    if len(contents) > AVATAR_MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Datei zu groß (max. 5MB)")

    try:
        import io

        img = Image.open(io.BytesIO(contents))

        # Maßgeblich ist das ERKANNTE Format, nicht der Client-Header oben:
        # content_type kann frei gesetzt werden, img.format kommt aus dem
        # tatsächlichen Dateiinhalt. Fremde Formate scheitern zwar schon am
        # reduzierten Opener-Set (Image.OPEN, siehe oben), aber diese Prüfung
        # bleibt als zweiter Riegel stehen, falls dort je etwas nachrutscht.
        if img.format not in AVATAR_ALLOWED_FORMATS:
            raise HTTPException(status_code=400, detail="Nur JPG, PNG oder WEBP erlaubt")

        # Auflösung VOR dem vollen Decodieren prüfen (Decompression-Bomb-Schutz):
        # Image.open() liest nur den Header — .load()/.crop()/.resize() würden ein
        # winziges File mit absurd hohen Pixel-Maßen sonst komplett in den
        # Speicher entpacken.
        w0, h0 = img.size
        if w0 * h0 > 30_000_000:  # ~30 MP, weit über jedem sinnvollen Profilbild
            raise HTTPException(status_code=400, detail="Bildauflösung zu groß")

        img.load()  # verifiziert, dass es sich um ein echtes, dekodierbares Bild handelt

        # EXIF-Rotation korrigieren (Handyfotos sind oft "liegend" gespeichert)
        try:
            from PIL.ExifTags import TAGS
            exif = img._getexif()
            if exif:
                for tag, val in exif.items():
                    if TAGS.get(tag) == "Orientation":
                        if val == 3:   img = img.rotate(180, expand=True)
                        elif val == 6: img = img.rotate(270, expand=True)
                        elif val == 8: img = img.rotate(90,  expand=True)
        except Exception:
            pass

        # Quadratisch zuschneiden (zentriert) und auf 200x200 skalieren
        w, h = img.size
        size = min(w, h)
        left = (w - size) // 2
        top  = (h - size) // 2
        img = img.crop((left, top, left + size, top + size))
        img = img.resize((200, 200), Image.LANCZOS)

        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}.jpg"
        filepath = AVATAR_DIR / filename
        img.save(filepath, "JPEG", quality=85, optimize=True)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bild konnte nicht verarbeitet werden: {e}")

    # Row-Lock: serialisiert gleichzeitige Avatar-Uploads DESSELBEN Nutzers, damit
    # bei parallelen Requests nicht mehrere "alte" Dateien verwaist auf der Platte
    # zurückbleiben — jede Transaktion sieht garantiert den zuletzt committeten Pfad.
    # .populate_existing() ist entscheidend: `current_user` ist über die
    # Session-Identity-Map bereits als (u.U. veraltetes) Objekt geladen — ohne
    # populate_existing() würde SQLAlchemy trotz frischem SELECT FOR UPDATE die
    # gecachten Python-Attribute NICHT überschreiben, wodurch old_avatar_path
    # den Stand von Request-Beginn liefert statt den zuletzt committeten Pfad
    # (genau das hat den Datei-Leichen-Bug oben verursacht).
    locked_user = db.query(models.User).filter(
        models.User.id == current_user.id
    ).populate_existing().with_for_update().first()
    old_avatar_path = locked_user.avatar_path
    locked_user.avatar_path = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(locked_user)

    _delete_avatar_file(old_avatar_path)  # altes Avatar erst NACH dem Commit entfernen

    return locked_user


@router.delete("/avatar", response_model=schemas.UserOut)
def delete_avatar(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.avatar_path:
        _delete_avatar_file(current_user.avatar_path)
        current_user.avatar_path = None
        db.commit()
        db.refresh(current_user)
    return current_user


@router.post("/reset-password")
def reset_password(data: schemas.ResetPassword, db: Session = Depends(get_db)):
    reset = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == data.token,
        models.PasswordResetToken.used == False
    ).first()

    if not reset:
        raise HTTPException(status_code=400, detail="Ungültiger oder bereits verwendeter Token")

    if reset.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token abgelaufen — bitte neu anfordern")

    user = db.query(models.User).filter(models.User.id == reset.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    user.hashed_password = auth.hash_password(data.new_password)
    # Wichtig: auch der E-Mail-Reset muss password_changed_at setzen — sonst
    # bleiben vor dem Reset ausgestellte (evtl. gestohlene) Access-/Refresh-Tokens
    # bis zu 30 Tage gültig. Genau der Reset ist der Weg für ein kompromittiertes
    # Konto, also müssen hier alle Alt-Sessions entwertet werden.
    user.password_changed_at = datetime.now(timezone.utc)
    reset.used = True
    db.commit()

    return {"message": "Passwort erfolgreich geändert"}


@router.put("/password")
def change_password(
    data: schemas.PasswordChange,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if not auth.verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Aktuelles Passwort ist falsch")
    current_user.hashed_password = auth.hash_password(data.new_password)
    current_user.password_changed_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Passwort erfolgreich geändert"}


@router.get("/export")
def export_data(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    import csv, io
    from fastapi.responses import StreamingResponse
    from datetime import datetime as dt

    def s(val):
        """CSV-Formel-Injection abwehren: Übungsnamen sind nutzerübergreifend geteilt —
        ein Name wie '=cmd|...' würde beim Öffnen in Excel/LibreOffice als Formel
        ausgeführt. Zellen mit Formel-Startzeichen bekommen ein schützendes '."""
        text = str(val) if val is not None else ""
        if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
            return "'" + text
        return text

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["=== BENUTZERDATEN ==="])
    writer.writerow(["Benutzername", "E-Mail", "Registriert am", "Wochenziel (Workouts)"])
    writer.writerow([s(current_user.username), s(current_user.email),
                      current_user.created_at.strftime("%d.%m.%Y %H:%M") if current_user.created_at else "",
                      current_user.weekly_workout_goal])

    writer.writerow([])
    writer.writerow(["=== TRAININGSTAGEBUCH ==="])
    writer.writerow(["Datum", "Übung", "Satz", "Wiederholungen", "Gewicht (kg)", "Dauer (min)", "Distanz (km)", "Notizen"])
    logs = db.query(models.WorkoutLog).filter(models.WorkoutLog.user_id == current_user.id).order_by(models.WorkoutLog.date.desc()).all()
    for log in logs:
        date_str = log.date.strftime("%d.%m.%Y") if log.date else ""
        if log.sets:
            for st in log.sets:
                writer.writerow([
                    date_str, s(log.exercise_name), st.set_number, st.reps, st.weight_kg or "",
                    log.duration_min or "", log.distance_km or "", s(log.notes)
                ])
        else:
            writer.writerow([
                date_str, s(log.exercise_name), "", "", "",
                log.duration_min or "", log.distance_km or "", s(log.notes)
            ])

    writer.writerow([])
    writer.writerow(["=== GEWICHTSVERLAUF ==="])
    writer.writerow(["Datum", "Gewicht (kg)"])
    weights = db.query(models.WeightLog).filter(models.WeightLog.user_id == current_user.id).order_by(models.WeightLog.date.desc()).all()
    for w in weights:
        writer.writerow([w.date.strftime("%d.%m.%Y") if w.date else "", w.weight_kg])

    output.seek(0)
    filename = f"ironbandit_export_{dt.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.put("/reminder")
def set_reminder(
    data: schemas.ReminderUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Format wird vom Schema erzwungen (HH:MM oder None) — leerer String kommt
    # als None an und schaltet die Erinnerung ab.
    current_user.reminder_time = data.reminder_time
    db.commit()
    return {"message": "Erinnerung gespeichert", "reminder_time": data.reminder_time}


@router.put("/theme", response_model=schemas.UserOut)
def set_theme(
    data: schemas.ThemeUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Persist the user's UI theme choice server-side so it follows the account
    across devices. Erlaubte Werte erzwingt das Schema ("dark" | "light")."""
    current_user.theme = data.theme
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/rest-timer", response_model=schemas.UserOut)
def set_rest_timer(
    data: schemas.RestTimerUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Bevorzugte Standard-Pausendauer (Sekunden) serverseitig speichern, damit
    der Ruhezeiten-Timer geräteübergreifend mit dem Wunschwert startet."""
    current_user.rest_timer_seconds = data.rest_timer_seconds
    db.commit()
    db.refresh(current_user)
    return current_user
