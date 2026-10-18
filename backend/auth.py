from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from jwt import PyJWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import os
import ipaddress

from database import get_db
import models

import secrets as _secrets
import logging as _logging

def _require_secret(env_name: str) -> str:
    """Nie mit einem hartkodierten Default-Secret laufen: fehlt die Env-Variable,
    wird ein zufälliges Ephemeral-Secret erzeugt (Dev funktioniert weiter, Tokens
    überleben dann nur keinen Neustart) und laut gewarnt — statt eines für alle
    Installationen identischen, erratbaren Werts."""
    val = os.getenv(env_name)
    if val and val not in ("CHANGE_THIS_IN_PRODUCTION", "CHANGE_THIS_REFRESH_SECRET"):
        return val
    _logging.getLogger("ironbandit").critical(
        f"{env_name} nicht gesetzt — verwende zufälliges Ephemeral-Secret (Sessions überleben keinen Neustart)!"
    )
    return _secrets.token_urlsafe(48)

SECRET_KEY         = _require_secret("SECRET_KEY")
REFRESH_SECRET_KEY = _require_secret("REFRESH_SECRET_KEY")
ALGORITHM                    = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES  = 60       # 1 Stunde — Frontend refresht bei 401 automatisch
REFRESH_TOKEN_EXPIRE_DAYS    = 30

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "iat": datetime.now(timezone.utc).timestamp(), "type": "access"},
        SECRET_KEY, algorithm=ALGORITHM
    )

def create_refresh_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "iat": datetime.now(timezone.utc).timestamp(), "type": "refresh"},
        REFRESH_SECRET_KEY, algorithm=ALGORITHM
    )

def _decode(token: str, key: str, expected_type: str) -> Optional[dict]:
    """Gibt das Payload zurück (inkl. iat), damit Aufrufer das Token-Alter gegen
    password_changed_at prüfen können — oder None bei ungültigem Token."""
    try:
        payload = jwt.decode(token, key, algorithms=[ALGORITHM])
        if payload.get("type") != expected_type or not payload.get("sub"):
            return None
        return payload
    except PyJWTError:
        return None

def decode_access_token(token: str) -> Optional[int]:
    payload = _decode(token, SECRET_KEY, "access")
    return int(payload["sub"]) if payload else None

def decode_access_payload(token: str) -> Optional[dict]:
    return _decode(token, SECRET_KEY, "access")

def decode_refresh_token(token: str) -> Optional[int]:
    payload = _decode(token, REFRESH_SECRET_KEY, "refresh")
    return int(payload["sub"]) if payload else None

def decode_refresh_payload(token: str) -> Optional[dict]:
    return _decode(token, REFRESH_SECRET_KEY, "refresh")


def verify_token_age(user, issued_at: float) -> bool:
    """Prüft ob Token vor Passwortänderung ausgestellt wurde."""
    if user.password_changed_at and issued_at:
        changed = user.password_changed_at.replace(tzinfo=timezone.utc).timestamp()
        if issued_at < changed:
            return False
    return True


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_payload(token)
    if payload is None:
        raise credentials_exception

    user = db.query(models.User).filter(
        models.User.id == int(payload["sub"]),
        models.User.is_active == True
    ).first()

    if user is None:
        raise credentials_exception

    # Tokens, die vor der letzten Passwortänderung ausgestellt wurden, sind ungültig
    # (sonst bliebe ein gestohlenes Token nach einem Passwort-Reset weiter nutzbar).
    if not verify_token_age(user, payload.get("iat")):
        raise credentials_exception

    return user


def get_client_ip(request) -> str:
    """Echte Client-IP hinter dem Proxy-Gespann NPM → web-nginx → Backend.

    Bevorzugt X-Real-IP: das setzt UNSER web-nginx aus $remote_addr, nachdem
    dessen real_ip-Modul den X-Forwarded-For nur vom vertrauenswürdigen NPM
    ausgewertet hat. Der erste XFF-Eintrag wäre dagegen vom externen Client
    frei wählbar (Spoofing des Rate-Limiter-Keys / fail2ban-Poisoning).

    Beide Header-Werte werden zusätzlich als gültige IP validiert, bevor sie als
    Rate-Limit-Key oder Log-Eintrag verwendet werden — ein fehlkonfigurierter
    oder kompromittierter Proxy-Layer könnte sonst beliebigen (überlangen,
    nicht-IP-förmigen) Text einschleusen, der Log-Parsing/fail2ban-Regexe
    durcheinanderbringt oder den Rate-Limiter mit nicht-IP-Keys überflutet."""
    real_ip = request.headers.get("x-real-ip")
    if real_ip and _is_valid_ip(real_ip.strip()):
        return real_ip.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if _is_valid_ip(first):
            return first
    return request.client.host if request.client else "unknown"


def _is_valid_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False
