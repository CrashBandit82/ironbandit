from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_verified = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)

    weekly_workout_goal = Column(Integer, default=4)

    reminder_time = Column(String(5), nullable=True)  # Format: "18:00"
    theme = Column(String(10), nullable=False, default="dark", server_default="dark")  # "dark" | "light"
    avatar_path = Column(String(500), nullable=True)  # z.B. "/uploads/avatars/3_a1b2c3d4.jpg"
    rest_timer_seconds = Column(Integer, nullable=False, default=90, server_default="90")  # bevorzugte Pausendauer
    password_changed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    created_exercises = relationship("Exercise", back_populates="created_by")
    workout_logs = relationship("WorkoutLog", back_populates="user")
    exercise_stats = relationship("UserExerciseStat", back_populates="user")
    weight_logs  = relationship("WeightLog", back_populates="user")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    token      = Column(String(64), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used       = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    token      = Column(String(64), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used       = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WeightLog(Base):
    __tablename__ = "weight_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    weight_kg  = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    date       = Column(Date, index=True)

    user = relationship("User", back_populates="weight_logs")


class WorkoutTemplate(Base):
    __tablename__ = "workout_templates"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name       = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user  = relationship("User", backref="workout_templates")
    items = relationship(
        "WorkoutTemplateItem", back_populates="template",
        cascade="all, delete-orphan", order_by="WorkoutTemplateItem.position"
    )


class WorkoutTemplateItem(Base):
    """A plan is pure exercise grouping + order — no planned sets/weight/reps.
    Those numbers only ever exist on WorkoutSet, live, during an actual workout.

    `notes` ist reiner Freitext pro Übung ("langsam ablassen") und bewusst KEINE
    Zahlenvorgabe — die Regel oben bleibt damit unberührt. Das Feld existiert,
    weil das CSV-Import-/Export-Format eine notes-Spalte führt; ohne die Spalte
    würde ein Export→Import-Durchlauf die Notizen still verlieren."""
    __tablename__ = "workout_template_items"

    id          = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("workout_templates.id"), nullable=False, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=False)
    position    = Column(Integer, nullable=False)
    notes       = Column(String(500), nullable=True)

    template = relationship("WorkoutTemplate", back_populates="items")
    exercise = relationship("Exercise")


class PlanImportSession(Base):
    """Zwischenspeicher zwischen Import-Vorschau und Bestätigung.

    Warum eine Tabelle statt Redis: das Projekt fährt kein Redis, und der
    Datensatz ist kurzlebig und winzig. Warum überhaupt serverseitig: würde die
    Vorschau im Client gehalten und beim Bestätigen zurückgeschickt, könnte ein
    Nutzer die geprüften Daten zwischen den Schritten austauschen — sämtliche
    Validierung wäre wertlos. Der Client schickt nur eine Session-ID plus
    Korrekturen; die Nutzdaten kommen aus dieser Zeile.

    `token` ist ein UUID4 (nicht hochzählend, nicht erratbar). Jede Abfrage
    filtert ZUSÄTZLICH auf user_id — eine fremde Session-ID ist damit auch bei
    Kenntnis wertlos."""
    __tablename__ = "plan_import_sessions"

    id         = Column(Integer, primary_key=True, index=True)
    token      = Column(String(36), unique=True, index=True, nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    payload    = Column(Text, nullable=False)   # JSON: geprüfte Plan-/Zeilenstruktur
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)

    user = relationship("User")


class TemplateShare(Base):
    """Ausstehende Plan-Freigabe von einem Nutzer an einen anderen (adressiert
    über den exakten Benutzernamen). Annehmen erzeugt eine eigene Kopie beim
    Empfänger und löscht die Zeile; Ablehnen löscht sie nur. Es gibt bewusst
    keine Nutzersuche — wer teilen will, muss den Benutzernamen kennen."""
    __tablename__ = "template_shares"

    id           = Column(Integer, primary_key=True, index=True)
    template_id  = Column(Integer, ForeignKey("workout_templates.id"), nullable=False, index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    to_user_id   = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    template  = relationship("WorkoutTemplate")
    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user   = relationship("User", foreign_keys=[to_user_id])


class Exercise(Base):
    """Exercises are shared, not private: every exercise (hand-seeded, wger-imported,
    or user-created) is visible and usable by all registered users alike.
    created_by_user_id only tracks authorship for delete-permission checks — it is
    NULL for hand-seeded/wger-imported exercises (admin-only deletable), and is set
    to NULL (not cascaded) if the creating user's account is later deleted, so the
    exercise itself survives for everyone else."""
    __tablename__ = "exercises"

    id = Column(Integer, primary_key=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    category = Column(String(20), nullable=True)     # "Push" | "Pull" | "Legs" | "Cardio" | "Core"
    equipment = Column(String(100), nullable=True)    # "Barbell" | "Dumbbell" | "Bodyweight" | "Machine" | "Kettlebell" | "None"
    is_cardio = Column(Boolean, default=False, nullable=False, server_default="false")
    muscle_group = Column(String(50), nullable=True)   # freitext, z.B. "Brust", "Bizeps"
    image_url = Column(String(1000), nullable=True)
    notes = Column(String(500), nullable=True)
    wger_id = Column(Integer, unique=True, nullable=True, index=True)  # dedupe key for wger.de import
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    created_by   = relationship("User", back_populates="created_exercises")
    workout_logs = relationship("WorkoutLog", back_populates="exercise")
    user_stats   = relationship("UserExerciseStat", back_populates="exercise")


class UserExerciseStat(Base):
    __tablename__ = "user_exercise_stats"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=False, index=True)
    use_count   = Column(Integer, default=1)
    last_used   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user     = relationship("User", back_populates="exercise_stats")
    exercise = relationship("Exercise", back_populates="user_stats")


class WorkoutLog(Base):
    __tablename__ = "workout_logs"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    exercise_id   = Column(Integer, ForeignKey("exercises.id"), nullable=True)
    exercise_name = Column(String(255))

    duration_min  = Column(Float, nullable=True)
    distance_km   = Column(Float, nullable=True)
    notes         = Column(String(500), nullable=True)

    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    date          = Column(Date, index=True)

    user     = relationship("User", back_populates="workout_logs")
    exercise = relationship("Exercise", back_populates="workout_logs")
    sets = relationship(
        "WorkoutSet", back_populates="log",
        cascade="all, delete-orphan", order_by="WorkoutSet.set_number"
    )


class WorkoutSet(Base):
    __tablename__ = "workout_sets"

    id              = Column(Integer, primary_key=True, index=True)
    workout_log_id  = Column(Integer, ForeignKey("workout_logs.id"), nullable=False, index=True)
    set_number      = Column(Integer, nullable=False)
    reps            = Column(Integer, nullable=False)
    weight_kg       = Column(Float, nullable=True)

    log = relationship("WorkoutLog", back_populates="sets")


class ExerciseNote(Base):
    """Dauerhafte Notiz eines Nutzers zu einer Übung ("Sitz Stufe 4, Griff eng").

    Bewusst NICHT am WorkoutLog: die Log-Notiz galt nur für einen Trainingstag,
    beim nächsten Training derselben Übung war das Feld wieder leer. Diese Notiz
    gehört dem Nutzer und der Übung und erscheint bei jedem Training wieder, bis
    er sie ändert. Genau eine Zeile pro (user, exercise); eine leere Notiz wird
    gelöscht statt als Leerstring gespeichert.

    WorkoutLog.notes bleibt für Bestandsdaten (Historie, CSV-Export) erhalten."""
    __tablename__ = "exercise_notes"
    __table_args__ = (UniqueConstraint("user_id", "exercise_id", name="uq_exercise_notes_user_exercise"),)

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=False, index=True)
    notes       = Column(String(500), nullable=False)
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkoutSession(Base):
    """Ein Training von "Plan starten" bis "Training abschließen".

    Hält Start-/Endzeit für die Trainingsdauer und die Liste der Session-Übungen
    (`entries`, JSON: [{log_id, exercise_id, exercise_name, is_cardio}]), damit
    die laufende Session einen Reload/App-Wechsel übersteht — vorher lebte sie
    nur im React-State und war nach einem Neuladen weg.

    finished_at/duration_sec bleiben NULL, solange trainiert wird. Eine nie
    abgeschlossene Session gilt nach ACTIVE_MAX_AGE (routers/sessions.py) als
    verworfen und taucht weder als aktiv noch im Verlauf auf."""
    __tablename__ = "workout_sessions"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    template_name = Column(String(255), nullable=True)
    started_at    = Column(DateTime(timezone=True), nullable=False)
    finished_at   = Column(DateTime(timezone=True), nullable=True)
    duration_sec  = Column(Integer, nullable=True)
    date          = Column(Date, index=True)
    entries       = Column(Text, nullable=False, default="[]")
