"""CSV-Import für Trainingspläne — Zwei-Schritt-Verfahren mit Vorschau.

    POST /api/plans/import/preview   Datei rauf, prüfen, Vorschau + Session-ID
    POST /api/plans/import/confirm   Session-ID + Korrekturen → Pläne anlegen
    GET  /api/plans/import/sample    Beispieldatei im erwarteten Format
    GET  /api/plans/export           Eigene Pläne im selben Format (Round-Trip)

Warum zweistufig: Schritt 1 schreibt garantiert nichts in die DB. Die geprüften
Daten liegen zwischen den Schritten serverseitig (plan_import_sessions) — der
Client bekommt nur eine nicht erratbare Session-ID. Würde die Vorschau im
Browser gehalten und beim Bestätigen zurückgeschickt, ließe sie sich dazwischen
austauschen und die gesamte Validierung wäre wirkungslos.

Der Import legt Pläne IMMER für den Aufrufer aus dem JWT an. Es gibt bewusst
keinen Parameter, über den ein Zielnutzer angegeben werden könnte.
"""

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from difflib import get_close_matches
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from sqlalchemy import func
from sqlalchemy.orm import Session

import auth
import models
import plan_csv
from database import get_db
from plan_csv import CsvRejected

router = APIRouter(prefix="/api/plans", tags=["plan-import"])
logger = logging.getLogger("ironbandit")

# Lebensdauer der Vorschau. Lang genug, um die Zuordnung in Ruhe zu erledigen,
# kurz genug, dass geprüfte Daten nicht dauerhaft herumliegen.
SESSION_TTL_MINUTES = 10

# Mehr offene Vorschauen braucht niemand — deckelt das Vollschreiben der Tabelle
# über wiederholte Uploads, die nie bestätigt werden.
MAX_OPEN_SESSIONS_PER_USER = 5

# Fuzzy-Vorschläge sind O(unbekannte Zeilen × Übungen) — ohne Deckel wäre eine
# Datei aus 2000 frei erfundenen Namen ein CPU-Fresser.
MAX_FUZZY_ROWS = 200
FUZZY_CUTOFF = 0.72
FUZZY_MAX_SUGGESTIONS = 3


def _user_rate_key(request: Request) -> str:
    """Rate-Limit-Schlüssel ist der NUTZER, nicht die IP.

    Der Auftrag verlangt „5 Importversuche pro User pro Stunde": hinter NAT
    (Studio-WLAN, Mobilfunk) teilen sich sonst mehrere Nutzer ein Kontingent,
    und umgekehrt setzt ein IP-Wechsel das Limit zurück. Fällt kein gültiges
    Token an, wird auf die IP zurückgefallen — sonst hätten unauthentifizierte
    Anfragen gar keinen Schlüssel.
    """
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        payload = auth.decode_access_payload(header[7:].strip())
        if payload and payload.get("sub"):
            return f"user:{payload['sub']}"
    return f"ip:{auth.get_client_ip(request)}"


limiter = Limiter(key_func=_user_rate_key)
IMPORT_RATE_LIMIT = "5/hour"


# ── Schemas ───────────────────────────────────────────────────────────────────

class PreviewRow(BaseModel):
    row:           int
    exercise_name: str
    order_index:   int
    notes:         str
    exercise_id:   Optional[int] = None
    matched:       bool
    suggestions:   List[Dict] = []


class PreviewPlan(BaseModel):
    plan_name:      str
    rows:           List[PreviewRow]
    already_exists: bool


class RowError(BaseModel):
    row:    Optional[int] = None
    reason: str


class PreviewResult(BaseModel):
    session_id:    str
    expires_at:    datetime
    plans:         List[PreviewPlan]
    errors:        List[RowError]
    total_rows:    int
    matched_rows:  int
    unmatched_rows: int


class Resolution(BaseModel):
    """Manuelle Zuordnung einer nicht erkannten Zeile."""
    row:         int
    exercise_id: int


class ConfirmRequest(BaseModel):
    session_id: str = Field(..., min_length=36, max_length=36)
    # Obergrenzen analog zu MAX_ROWS — ohne die wäre der Body selbst der DoS-Vektor.
    resolutions: List[Resolution] = Field(default_factory=list, max_length=plan_csv.MAX_ROWS)
    skip_rows:   List[int] = Field(default_factory=list, max_length=plan_csv.MAX_ROWS)
    # None = alle Pläne der Vorschau importieren
    import_plans: Optional[List[str]] = Field(default=None, max_length=plan_csv.MAX_PLANS_PER_IMPORT)


class ConfirmedPlan(BaseModel):
    id:             int
    name:           str
    exercise_count: int


class ConfirmResult(BaseModel):
    message:       str
    created_plans: List[ConfirmedPlan]
    skipped_rows:  int


# ── Helfer ────────────────────────────────────────────────────────────────────

def _fail(status: int, message: str):
    """Einheitlicher Fehlerausgang. Nach außen geht nur `message` — niemals ein
    Stacktrace, Dateisystempfad oder DB-Detail."""
    return HTTPException(status_code=status, detail=message)


async def _read_upload_limited(upload: UploadFile, request: Request) -> bytes:
    """Liest den Upload mit laufender Größenprüfung.

    Zwei Stufen, beide VOR dem Parsen:
      1. Content-Length (falls gesetzt) — spart das Hochladen komplett,
      2. laufende Summe beim Lesen — der Header ist frei fälschbar, also wird
         mitgezählt und beim Überschreiten sofort abgebrochen, statt erst die
         ganze Datei in den Speicher zu nehmen.
    """
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > plan_csv.MAX_UPLOAD_BYTES * 2:
        # Faktor 2, weil Content-Length den gesamten multipart-Rahmen umfasst.
        raise CsvRejected(f"Die Datei ist größer als {plan_csv.MAX_UPLOAD_BYTES // 1024} KB")

    chunks: List[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > plan_csv.MAX_UPLOAD_BYTES:
            raise CsvRejected(f"Die Datei ist größer als {plan_csv.MAX_UPLOAD_BYTES // 1024} KB")
        chunks.append(chunk)
    return b"".join(chunks)


def _purge_expired(db: Session) -> None:
    db.query(models.PlanImportSession).filter(
        models.PlanImportSession.expires_at < datetime.now(timezone.utc)
    ).delete(synchronize_session=False)


def _load_session(db: Session, token: str, user_id: int) -> models.PlanImportSession:
    """Holt die Vorschau-Session — gefiltert auf Token UND Besitzer.

    Der user_id-Filter ist der eigentliche Schutz: selbst wer eine fremde
    Session-ID kennt, bekommt hier 404. Die Antwort ist für „gibt es nicht",
    „gehört jemand anderem" und „abgelaufen" identisch, damit sich daraus nichts
    über fremde Sessions ableiten lässt.
    """
    try:
        uuid.UUID(token)
    except (ValueError, AttributeError, TypeError):
        raise _fail(404, "Vorschau nicht gefunden oder abgelaufen — bitte Datei erneut hochladen")

    session = db.query(models.PlanImportSession).filter(
        models.PlanImportSession.token == token,
        models.PlanImportSession.user_id == user_id,
    ).first()

    if not session:
        raise _fail(404, "Vorschau nicht gefunden oder abgelaufen — bitte Datei erneut hochladen")

    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        raise _fail(404, "Vorschau nicht gefunden oder abgelaufen — bitte Datei erneut hochladen")

    return session


# ── Endpunkte ─────────────────────────────────────────────────────────────────

@router.get("/import/sample")
def download_sample(current_user: models.User = Depends(auth.get_current_user)):
    """Beispieldatei im exakt erwarteten Format — identisch zum Export, damit
    Export → Import ohne Nachbearbeitung durchläuft."""
    return StreamingResponse(
        iter([plan_csv.SAMPLE_CSV]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=ironbandit_plan_vorlage.csv"},
    )


@router.get("/export")
def export_plans(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Eigene Pläne im Import-Format. Gegenstück zum Import (Round-Trip)."""
    templates = db.query(models.WorkoutTemplate).filter(
        models.WorkoutTemplate.user_id == current_user.id
    ).order_by(models.WorkoutTemplate.name).all()

    payload = [
        (t.name, [(item.exercise.name, item.position, item.notes or "") for item in t.items])
        for t in templates
    ]
    filename = f"ironbandit_plaene_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([plan_csv.write_plan_csv(payload)]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/import/preview", response_model=PreviewResult)
@limiter.limit(IMPORT_RATE_LIMIT)
async def preview_import(
    request: Request,
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Schritt 1: prüfen und anzeigen. Schreibt NICHTS an Plandaten in die DB —
    angelegt wird ausschließlich die kurzlebige Vorschau-Session."""
    try:
        plan_csv.check_upload_meta(file.filename, file.content_type)
        raw = await _read_upload_limited(file, request)
        text = plan_csv.decode_csv(raw)
        parsed, errors = plan_csv.parse_plan_csv(text)
    except CsvRejected as e:
        raise _fail(400, str(e))
    except HTTPException:
        raise
    except Exception:
        # Alles Unerwartete landet im Log, der Client bekennt nur den generischen
        # Text — kein Stacktrace, kein Pfad, kein Bibliotheksdetail.
        logger.exception("Unerwarteter Fehler beim CSV-Import-Preview (user=%s)", current_user.id)
        raise _fail(400, "Die Datei konnte nicht verarbeitet werden — bitte Format prüfen")
    finally:
        await file.close()

    # ── Übungen zuordnen ──────────────────────────────────────────────────────
    # Übungen sind nutzerübergreifend geteilt (siehe models.Exercise) — daher
    # kein Besitzer-Filter, aber auch keine Neuanlage: der Import darf die
    # gemeinsame Übungsdatenbank nicht mit Tippfehlern aus fremden CSVs fluten.
    all_exercises = db.query(models.Exercise.id, models.Exercise.name).all()
    by_lower: Dict[str, tuple] = {}
    for ex_id, ex_name in all_exercises:
        by_lower.setdefault((ex_name or "").strip().lower(), (ex_id, ex_name))
    known_names = [name for _, name in all_exercises if name]

    existing_plan_names = {
        name.lower()
        for (name,) in db.query(models.WorkoutTemplate.name).filter(
            models.WorkoutTemplate.user_id == current_user.id
        ).all()
    }

    preview_plans: List[PreviewPlan] = []
    stored_plans: List[Dict] = []
    total_rows = matched_rows = unmatched_rows = 0
    fuzzy_budget = MAX_FUZZY_ROWS

    for plan in parsed:
        rows_out: List[PreviewRow] = []
        rows_stored: List[Dict] = []
        for row in plan["rows"]:
            total_rows += 1
            hit = by_lower.get(row["exercise_name"].lower())
            suggestions: List[Dict] = []
            if hit:
                exercise_id = hit[0]
                matched_rows += 1
            else:
                exercise_id = None
                unmatched_rows += 1
                if fuzzy_budget > 0:
                    fuzzy_budget -= 1
                    for candidate in get_close_matches(
                        row["exercise_name"], known_names,
                        n=FUZZY_MAX_SUGGESTIONS, cutoff=FUZZY_CUTOFF,
                    ):
                        cand = by_lower.get(candidate.strip().lower())
                        if cand:
                            suggestions.append({"exercise_id": cand[0], "name": cand[1]})

            rows_out.append(PreviewRow(
                row=row["row"], exercise_name=row["exercise_name"],
                order_index=row["order_index"], notes=row["notes"],
                exercise_id=exercise_id, matched=exercise_id is not None,
                suggestions=suggestions,
            ))
            rows_stored.append({
                "row": row["row"], "exercise_name": row["exercise_name"],
                "order_index": row["order_index"], "notes": row["notes"],
                "exercise_id": exercise_id,
            })

        preview_plans.append(PreviewPlan(
            plan_name=plan["plan_name"], rows=rows_out,
            already_exists=plan["plan_name"].lower() in existing_plan_names,
        ))
        stored_plans.append({"plan_name": plan["plan_name"], "rows": rows_stored})

    # ── Vorschau-Session anlegen ──────────────────────────────────────────────
    _purge_expired(db)
    open_count = db.query(func.count(models.PlanImportSession.id)).filter(
        models.PlanImportSession.user_id == current_user.id
    ).scalar() or 0
    if open_count >= MAX_OPEN_SESSIONS_PER_USER:
        oldest = db.query(models.PlanImportSession).filter(
            models.PlanImportSession.user_id == current_user.id
        ).order_by(models.PlanImportSession.created_at).first()
        if oldest:
            db.delete(oldest)

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)
    session = models.PlanImportSession(
        token=str(uuid.uuid4()),
        user_id=current_user.id,
        payload=json.dumps({"plans": stored_plans}, ensure_ascii=False),
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()

    return PreviewResult(
        session_id=session.token,
        expires_at=expires_at,
        plans=preview_plans,
        errors=[RowError(**e) for e in errors],
        total_rows=total_rows,
        matched_rows=matched_rows,
        unmatched_rows=unmatched_rows,
    )


@router.post("/import/confirm", response_model=ConfirmResult)
@limiter.limit(IMPORT_RATE_LIMIT)
def confirm_import(
    request: Request,
    data: ConfirmRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Schritt 2: erst hier entstehen Pläne — gebunden an current_user."""
    session = _load_session(db, data.session_id, current_user.id)

    try:
        payload = json.loads(session.payload)
        stored_plans = payload["plans"]
    except (ValueError, KeyError, TypeError):
        db.delete(session)
        db.commit()
        logger.error("Vorschau-Session %s hat unlesbaren Payload", session.id)
        raise _fail(400, "Vorschau nicht mehr lesbar — bitte Datei erneut hochladen")

    # Nutzer-Korrekturen einsammeln. Zugeordnet wird nur auf tatsächlich
    # existierende Übungs-IDs — eine erfundene ID darf keinen FK-Fehler (500)
    # auslösen, sondern muss ein sauberer 400er sein.
    resolution_map = {r.row: r.exercise_id for r in data.resolutions}
    skip_set = set(data.skip_rows)

    if resolution_map:
        valid_ids = {
            ex_id for (ex_id,) in db.query(models.Exercise.id).filter(
                models.Exercise.id.in_(set(resolution_map.values()))
            ).all()
        }
        unknown = set(resolution_map.values()) - valid_ids
        if unknown:
            raise _fail(400, "Mindestens eine manuell zugeordnete Übung existiert nicht")

    wanted = None if data.import_plans is None else {n for n in data.import_plans}

    created: List[ConfirmedPlan] = []
    skipped = 0

    for plan in stored_plans:
        if wanted is not None and plan["plan_name"] not in wanted:
            skipped += len(plan["rows"])
            continue

        items = []
        for row in plan["rows"]:
            if row["row"] in skip_set:
                skipped += 1
                continue
            exercise_id = resolution_map.get(row["row"]) or row.get("exercise_id")
            if not exercise_id:
                # Weiterhin unzugeordnet → still überspringen statt raten.
                skipped += 1
                continue
            items.append((exercise_id, row.get("notes") or None))

        if not items:
            continue
        if len(items) > plan_csv.MAX_ITEMS_PER_PLAN:
            items = items[:plan_csv.MAX_ITEMS_PER_PLAN]

        template = models.WorkoutTemplate(user_id=current_user.id, name=plan["plan_name"])
        db.add(template)
        db.flush()
        for position, (exercise_id, notes) in enumerate(items, start=1):
            db.add(models.WorkoutTemplateItem(
                template_id=template.id, exercise_id=exercise_id,
                position=position, notes=notes,
            ))
        db.flush()
        created.append(ConfirmedPlan(
            id=template.id, name=template.name, exercise_count=len(items)
        ))

    if not created:
        db.rollback()
        raise _fail(400, "Keine gültigen Zeilen zum Importieren — bitte Zuordnung prüfen")

    # Vorschau ist verbraucht: löschen, damit dieselbe Session-ID nicht ein
    # zweites Mal dieselben Pläne anlegen kann.
    db.delete(session)
    db.commit()

    logger.info(
        "CSV-Import: user=%s, %d Plan/Pläne, %d Zeilen übersprungen",
        current_user.id, len(created), skipped
    )
    return ConfirmResult(
        message=f"{len(created)} Plan/Pläne importiert",
        created_plans=created,
        skipped_rows=skipped,
    )
