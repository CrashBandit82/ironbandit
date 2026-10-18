from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional
from datetime import datetime, date
import re
# Alias for use as a field TYPE where the field is also *named* `date`: a
# `date: Optional[date] = None` field leaves a class attribute `date = None` that
# shadows the imported type during annotation resolution (Pydantic v2 collapses it
# to NoneType). Using DateT for those annotations avoids the shadowing.
DateT = date


def _check_strong_password(v: str) -> str:
    """Gemeinsame Passwort-Regel für Registrierung, Reset UND Passwort-Ändern —
    vorher hatte PasswordChange eine abgeschwächte Kopie (nur Mindestlänge),
    wodurch ein bereits eingeloggter Nutzer sein Passwort auf z.B. "aaaaaaaa"
    ändern konnte, obwohl Registrierung/Reset das ablehnen würden."""
    if len(v) < 8:
        raise ValueError("Passwort muss mindestens 8 Zeichen lang sein")
    if not any(c.isupper() for c in v):
        raise ValueError("Passwort muss mindestens einen Großbuchstaben enthalten")
    if not any(c.islower() for c in v):
        raise ValueError("Passwort muss mindestens einen Kleinbuchstaben enthalten")
    if not any(c.isdigit() for c in v):
        raise ValueError("Passwort muss mindestens eine Zahl enthalten")
    return v


def _check_username(v: str) -> str:
    """Gemeinsame Regel für Registrierung und spätere Umbenennung.

    Bewusst ASCII-only statt str.isalnum(): isalnum() ist auch für kyrillische
    oder vollbreite Zeichen True, womit sich ein Konto „Gerаld" (kyrillisches а)
    anlegen ließe, das optisch von „Gerald" nicht zu unterscheiden ist. Da Pläne
    per exaktem Benutzernamen geteilt werden, wäre das eine Vorlage für
    Verwechslung. Bereits bestehende Namen sind davon nicht betroffen — die
    Regel greift nur bei neuen Eingaben (aktuell hat ohnehin kein Konto
    Zeichen außerhalb dieses Bereichs)."""
    v = v.strip()
    if len(v) < 3 or len(v) > 50:
        raise ValueError("Username muss 3–50 Zeichen lang sein")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", v):
        raise ValueError("Username darf nur Buchstaben (A–Z, a–z), Zahlen, _ und - enthalten")
    return v


class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v):
        return _check_username(v)

    @field_validator("password")
    @classmethod
    def password_strong(cls, v):
        return _check_strong_password(v)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id:                  int
    email:               str
    username:            str
    is_active:           bool
    created_at:          datetime
    weekly_workout_goal: int
    is_verified:         bool
    is_admin:            bool
    reminder_time:       Optional[str] = None
    theme:               str = "dark"
    avatar_path:         Optional[str] = None
    rest_timer_seconds:  int = 90

    class Config:
        from_attributes = True


class RestTimerUpdate(BaseModel):
    rest_timer_seconds: int = Field(..., ge=5, le=3600)   # 5s bis 60min


class ReminderUpdate(BaseModel):
    """Erinnerungszeit als "HH:MM" oder None (= keine Erinnerung). Vorher nahm der
    Endpunkt ein rohes dict entgegen und prüfte die Uhrzeit per assert — ein
    Nicht-String landete damit ungeprüft in einer VARCHAR(5)-Spalte."""
    reminder_time: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class ThemeUpdate(BaseModel):
    theme: str = Field(..., pattern="^(dark|light)$")


class WeeklyGoalUpdate(BaseModel):
    weekly_workout_goal: int

    @field_validator("weekly_workout_goal")
    @classmethod
    def goal_range(cls, v):
        if v < 1 or v > 14:
            raise ValueError("Wochenziel muss zwischen 1 und 14 liegen")
        return v


class Token(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


class ForgotPassword(BaseModel):
    email: EmailStr


class VerifyEmail(BaseModel):
    """Token im Request-BODY statt im Query-String — ein Query-Parameter landet
    über $request im nginx-Access-Log, ein Body nicht."""
    token: str = Field(..., min_length=1, max_length=128)


class ResetPassword(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strong(cls, v):
        return _check_strong_password(v)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strong(cls, v):
        return _check_strong_password(v)


class UsernameChange(BaseModel):
    username: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v):
        return _check_username(v)


class FeedbackCreate(BaseModel):
    message: str

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v):
        if len(v.strip()) < 5:
            raise ValueError("Feedback muss mindestens 5 Zeichen lang sein")
        if len(v) > 2000:
            raise ValueError("Feedback darf maximal 2000 Zeichen lang sein")
        return v.strip()


class DeleteAccount(BaseModel):
    password: str


# ── Exercises ─────────────────────────────────────────────────────────────────

# Hinweis zu `image_url`: Das Feld ist bewusst NICHT mehr Teil der API. Es
# erlaubte beliebige externe Bild-URLs, die bei jedem Nutzer als <img src>
# gerendert wurden — über die Ladeanfrage hätte der Einsteller die IP-Adressen
# aller anderen Nutzer an einen fremden Server abfließen lassen können. Die
# strikte CSP (img-src 'self' data:) blockierte solche Bilder ohnehin, das
# Feature war also faktisch tot. Die Datenbankspalte bleibt samt Inhalt
# unverändert bestehen (keine Migration, kein Datenverlust); sie wird nur nicht
# mehr gelesen, geschrieben oder ausgeliefert.
class ExerciseCreate(BaseModel):
    name:         str = Field(..., min_length=1, max_length=255)
    category:     Optional[str] = Field(None, max_length=20)
    equipment:    Optional[str] = Field(None, max_length=100)
    muscle_group: Optional[str] = Field(None, max_length=50)
    is_cardio:    bool = False
    notes:        Optional[str] = Field(None, max_length=500)


class ExerciseOut(BaseModel):
    id:                  int
    created_by_user_id:  Optional[int] = None
    name:         str
    category:     Optional[str] = None
    equipment:    Optional[str] = None
    muscle_group: Optional[str] = None
    is_cardio:    bool
    notes:        Optional[str] = None
    use_count:    Optional[int] = 0
    can_edit:     bool = False   # set per-request: admin or creator

    class Config:
        from_attributes = True


# ── Workout Logs ──────────────────────────────────────────────────────────────

class WorkoutSetIn(BaseModel):
    reps:      int   = Field(..., gt=0, le=1000)
    weight_kg: Optional[float] = Field(None, ge=0, le=2000)


class WorkoutSetOut(BaseModel):
    id:         int
    set_number: int
    reps:       int
    weight_kg:  Optional[float] = None

    class Config:
        from_attributes = True


class LastSetsOut(BaseModel):
    """Letzte protokollierte Sätze zu einer Übung — Basis für die 'Letztes
    Training: 65kg × 8'-Platzhalter beim erneuten Ausführen eines Plans."""
    date: Optional[DateT] = None
    sets: list[WorkoutSetOut] = []


class WorkoutLogCreate(BaseModel):
    exercise_id:  int
    # max_length: ein Log mit zehntausenden Sätzen war bisher möglich (nur durch
    # die 20-MB-Body-Grenze begrenzt) und hätte DB und Auswertungen belastet.
    # Realistische Trainingseinheiten liegen im einstelligen Bereich.
    sets:         Optional[list[WorkoutSetIn]] = Field(None, max_length=100)
    duration_min: Optional[float] = Field(None, ge=0, le=1440)   # max. 24h
    distance_km:  Optional[float] = Field(None, ge=0, le=1000)
    notes:        Optional[str]   = Field(None, max_length=500)
    date:         Optional[DateT] = None

    @model_validator(mode="after")
    def strength_or_cardio(self):
        # sets=[] is valid on its own — it means "strength exercise, live session
        # started, no set logged yet" (sets get appended one at a time afterward).
        has_strength = self.sets is not None
        has_cardio   = self.duration_min is not None
        if not has_strength and not has_cardio:
            raise ValueError("Entweder Sätze (auch leer, für eine laufende Session) oder eine Dauer müssen angegeben werden")
        return self


class WorkoutLogUpdate(BaseModel):
    sets:         Optional[list[WorkoutSetIn]] = Field(None, max_length=100)
    duration_min: Optional[float] = Field(None, ge=0, le=1440)
    distance_km:  Optional[float] = Field(None, ge=0, le=1000)
    notes:        Optional[str]   = Field(None, max_length=500)


class WorkoutLogOut(BaseModel):
    id:            int
    exercise_id:   Optional[int] = None
    exercise_name: str
    sets:          list[WorkoutSetOut] = []
    duration_min:  Optional[float] = None
    distance_km:   Optional[float] = None
    total_sets:    int = 0
    total_reps:    int = 0
    volume_kg:     Optional[float] = None
    notes:         Optional[str]   = None
    created_at:    datetime
    date:          date

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def compute_aggregates(self):
        if self.sets:
            self.total_sets = len(self.sets)
            self.total_reps = sum(s.reps for s in self.sets)
            if any(s.weight_kg is not None for s in self.sets):
                self.volume_kg = round(sum(s.reps * (s.weight_kg or 0) for s in self.sets), 1)
        return self


class WorkoutDayTotals(BaseModel):
    entries:          int
    total_sets:       int
    total_volume_kg:  float
    total_duration_min: float
    workout_done:     bool


class WorkoutDayOverview(BaseModel):
    date:          date
    day_name:      str
    workout_done:  bool
    sessions:      int


class WorkoutWeeklyStats(BaseModel):
    week_start:            date
    week_end:               date
    days:                   list[WorkoutDayOverview]
    weekly_total_sessions:  int
    weekly_goal:            int
    avg_daily_sessions:     float
    # Volumen (Σ reps × weight über alle Sätze) dieser Woche und der Vorwoche,
    # plus prozentuale Veränderung für den "+15% ggü. letzter Woche"-Vergleich.
    weekly_total_volume_kg:   float = 0
    prev_week_total_volume_kg: float = 0
    prev_week_total_sessions:  int = 0
    # None, wenn die Vorwoche kein Volumen hatte (Prozentänderung undefiniert).
    volume_change_pct:        Optional[float] = None


class StagnatingExercise(BaseModel):
    """Eine Übung, die über die letzten Trainingseinheiten keine Steigerung
    (Gewicht bzw. Volumen) zeigt — neutral als Hinweis gedacht, nicht als Warnung."""
    exercise_id:   int
    exercise_name: str
    sessions:      int          # betrachtete Einheiten (>= MIN_SESSIONS)
    weeks_span:    int          # Zeitspanne der betrachteten Einheiten in Wochen
    metric:        str          # "weight" | "volume"
    first_value:   float        # Wert der ältesten betrachteten Einheit
    last_value:    float        # Wert der jüngsten betrachteten Einheit
    unit:          str          # "kg" für weight/volume


class StagnatingExercisesOut(BaseModel):
    exercises: list[StagnatingExercise] = []


# ── Dauernotiz pro Übung ──────────────────────────────────────────────────────

class ExerciseNoteIn(BaseModel):
    notes: Optional[str] = Field(None, max_length=500)


class ExerciseNoteOut(BaseModel):
    exercise_id: int
    notes:       Optional[str] = None
    updated_at:  Optional[datetime] = None
