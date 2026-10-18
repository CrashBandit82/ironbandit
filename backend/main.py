from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from pathlib import Path
import logging
import logging.handlers
import os

from sqlalchemy import text, inspect

from database import engine
import models
from routers import auth, workouts, weight, admin, templates, plan_import, sessions

# ── Logging ───────────────────────────────────────────────────────────────────

LOG_DIR = Path("/var/log/ironbandit")
LOG_DIR.mkdir(parents=True, exist_ok=True)

def setup_logging():
    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    file_handler = logging.handlers.RotatingFileHandler(
        LOG_DIR / "app.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8"
    )
    file_handler.setFormatter(fmt)
    file_handler.setLevel(logging.INFO)

    error_handler = logging.handlers.RotatingFileHandler(
        LOG_DIR / "error.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8"
    )
    error_handler.setFormatter(fmt)
    error_handler.setLevel(logging.ERROR)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(fmt)
    console_handler.setLevel(logging.INFO)

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(file_handler)
    root.addHandler(error_handler)
    root.addHandler(console_handler)

setup_logging()
logger = logging.getLogger("ironbandit")
logger.info("IronBandit Backend starting...")

# ── DB Tables ─────────────────────────────────────────────────────────────────
# No Alembic in this project — schema evolves via create_all (new tables/columns
# on a fresh install) plus this small idempotent migration for renamed/dropped
# columns and tables on an already-running database.

def _migrate_plan_and_exercise_ownership_schema():
    inspector = inspect(engine)
    with engine.begin() as conn:
        if "exercises" in inspector.get_table_names():
            cols = {c["name"] for c in inspector.get_columns("exercises")}
            if "user_id" in cols and "created_by_user_id" not in cols:
                conn.execute(text("ALTER TABLE exercises RENAME COLUMN user_id TO created_by_user_id"))
            if "muscle_group" not in cols:
                conn.execute(text("ALTER TABLE exercises ADD COLUMN muscle_group VARCHAR(50)"))
            if "image_url" not in cols:
                conn.execute(text("ALTER TABLE exercises ADD COLUMN image_url VARCHAR(1000)"))

        if "workout_template_items" in inspector.get_table_names():
            cols = {c["name"] for c in inspector.get_columns("workout_template_items")}
            if "position" not in cols:
                conn.execute(text("ALTER TABLE workout_template_items ADD COLUMN position INTEGER"))
                conn.execute(text("""
                    UPDATE workout_template_items AS wti SET position = ordered.rn
                    FROM (
                        SELECT id, ROW_NUMBER() OVER (PARTITION BY template_id ORDER BY id) AS rn
                        FROM workout_template_items
                    ) AS ordered
                    WHERE wti.id = ordered.id
                """))
                conn.execute(text("ALTER TABLE workout_template_items ALTER COLUMN position SET NOT NULL"))
            for col in ("planned_duration_min", "planned_distance_km"):
                if col in cols:
                    conn.execute(text(f"ALTER TABLE workout_template_items DROP COLUMN {col}"))
            # Freitext-Notiz pro Plan-Übung — Trägerspalte der notes-Spalte im
            # CSV-Import/-Export. Nullable, damit Bestandspläne unberührt bleiben.
            if "notes" not in cols:
                conn.execute(text("ALTER TABLE workout_template_items ADD COLUMN notes VARCHAR(500)"))

        conn.execute(text("DROP TABLE IF EXISTS workout_template_sets"))

        if "users" in inspector.get_table_names():
            cols = {c["name"] for c in inspector.get_columns("users")}
            if "theme" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN theme VARCHAR(10) NOT NULL DEFAULT 'dark'"))
            if "avatar_path" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar_path VARCHAR(500)"))
            if "rest_timer_seconds" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN rest_timer_seconds INTEGER NOT NULL DEFAULT 90"))

_migrate_plan_and_exercise_ownership_schema()
_had_exercise_notes = "exercise_notes" in inspect(engine).get_table_names()
models.Base.metadata.create_all(bind=engine)


def _seed_exercise_notes_from_logs():
    """Einmalig beim Anlegen der Tabelle exercise_notes: die jeweils jüngste
    Log-Notiz pro (Nutzer, Übung) wird zur Dauernotiz — sonst wären bisher
    erfasste Notizen im Training plötzlich unsichtbar. Läuft nur, wenn die
    Tabelle gerade neu entstanden ist; später gelöschte Notizen kommen dadurch
    beim nächsten Neustart nicht zurück."""
    if _had_exercise_notes or engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        n = conn.execute(text("""
            INSERT INTO exercise_notes (user_id, exercise_id, notes, updated_at)
            SELECT DISTINCT ON (user_id, exercise_id) user_id, exercise_id, btrim(notes), now()
            FROM workout_logs
            WHERE notes IS NOT NULL AND btrim(notes) <> '' AND exercise_id IS NOT NULL
            ORDER BY user_id, exercise_id, date DESC, created_at DESC, id DESC
            ON CONFLICT (user_id, exercise_id) DO NOTHING
        """)).rowcount
    logging.getLogger("ironbandit").info("exercise_notes: %s Notizen aus workout_logs übernommen", n)

_seed_exercise_notes_from_logs()

# ── Rate Limiter ──────────────────────────────────────────────────────────────
# Key = echte Client-IP aus X-Forwarded-For (Backend ist nur über den nginx-Proxy
# erreichbar) — sonst zählen alle Nutzer gemeinsam auf die Proxy-IP ein und einer
# könnte per Absicht das Limit für alle ausschöpfen.

from auth import get_client_ip

limiter = Limiter(
    key_func=get_client_ip,
    default_limits=["50/minute"],
    storage_uri="memory://"
)

# ── App ───────────────────────────────────────────────────────────────────────

# Swagger/OpenAPI legen alle Endpunkte (inkl. Admin-Routen) offen — standardmäßig
# aus, nur per expliziter Env-Variable für lokales Debugging einschaltbar.
API_DOCS_ENABLED = os.getenv("ENABLE_API_DOCS", "false").lower() == "true"

app = FastAPI(
    title="IronBandit API",
    version="1.0.0",
    # FastAPI only registers docs_url's route when openapi_url is also set —
    # so docs and the raw schema are reachable together; only redoc is disabled.
    openapi_url="/api/openapi.json" if API_DOCS_ENABLED else None,
    docs_url="/api/docs" if API_DOCS_ENABLED else None,
    redoc_url=None
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# Setzt durch, dass `default_limits` (siehe Limiter oben) für JEDEN Endpunkt
# gilt, der keine eigene @limiter.limit()-Dekoration hat — vorher war das
# Limit nur totes Konfigurationsobjekt ohne Wirkung.
app.add_middleware(SlowAPIMiddleware)

# ── Request Logging Middleware ────────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    client = get_client_ip(request)  # echte Client-IP statt Proxy-IP
    if response.status_code >= 400:
        logger.warning(f"{request.method} {request.url.path} → {response.status_code} [{client}]")
    elif request.method in ("POST", "PUT", "DELETE"):
        logger.info(f"{request.method} {request.url.path} → {response.status_code} [{client}]")
    return response

# ── CORS ──────────────────────────────────────────────────────────────────────

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost,http://localhost:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static Files (Avatar-Uploads) ──────────────────────────────────────────────
# Persistiert über einen Host-Bind-Mount (docker-compose), damit hochgeladene
# Avatare jeden Image-Rebuild überleben.

UPLOAD_DIR = Path("/opt/ironbandit/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "avatars").mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(workouts.router)
app.include_router(weight.router)
app.include_router(admin.router)
app.include_router(templates.router)
app.include_router(plan_import.router)
app.include_router(sessions.router)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


# ── Seed ─────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def seed_global_exercises():
    from database import SessionLocal
    db = SessionLocal()
    try:
        count = db.query(models.Exercise).filter(models.Exercise.created_by_user_id == None).count()
        if count == 0:
            defaults = [
                ("Bankdrücken",             "Push",  "Barbell",    False),
                ("Schulterdrücken",        "Push",  "Barbell",    False),
                ("Liegestütze",            "Push",  "Bodyweight", False),
                ("Dips",                   "Push",  "Bodyweight", False),
                ("Trizeps-Pushdown",       "Push",  "Machine",    False),
                ("Klimmzüge",              "Pull",  "Bodyweight", False),
                ("Latzug",                 "Pull",  "Machine",    False),
                ("Rudern vorgebeugt",      "Pull",  "Barbell",    False),
                ("Kreuzheben",             "Pull",  "Barbell",    False),
                ("Bizeps-Curls",           "Pull",  "Dumbbell",   False),
                ("Kniebeugen",             "Legs",  "Barbell",    False),
                ("Beinpresse",             "Legs",  "Machine",    False),
                ("Ausfallschritte",        "Legs",  "Dumbbell",   False),
                ("Wadenheben",             "Legs",  "Machine",    False),
                ("Rumänisches Kreuzheben", "Legs",  "Barbell",    False),
                ("Plank",                  "Core",  "Bodyweight", False),
                ("Crunches",               "Core",  "Bodyweight", False),
                ("Russian Twists",         "Core",  "Bodyweight", False),
                ("Laufen",                 "Cardio","None",       True),
                ("Radfahren",              "Cardio","None",       True),
                ("Rudergerät",             "Cardio","Machine",    True),
                ("Springseil",             "Cardio","Bodyweight", True),
            ]
            for name, category, equipment, is_cardio in defaults:
                db.add(models.Exercise(
                    name=name, category=category, equipment=equipment,
                    is_cardio=is_cardio, created_by_user_id=None
                ))
            db.commit()
            logger.info(f"Seeded {len(defaults)} globale Übungen")
    finally:
        db.close()
