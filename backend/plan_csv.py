"""CSV-Import/-Export für Trainingspläne — Parsing, Härtung, Validierung.

Bewusst OHNE pandas: reines stdlib-`csv`. Es gibt hier kein eval/exec, kein
`compile`, keinen dynamischen Import und keine Formel-Auswertung — jede Zelle
wird ausschließlich als Text behandelt. Das Modul ist absichtlich frei von
FastAPI-/DB-Abhängigkeiten, damit die gesamte Angriffsfläche isoliert testbar
bleibt (siehe tests/test_plan_import.py).

Erwartetes Format (feste Spalten, keine dynamische Interpretation):

    plan_name,exercise_name,order_index,notes

`notes` darf fehlen; alles andere ist Pflicht. Unbekannte Spalten werden
abgelehnt statt still ignoriert — sonst könnte eine manipulierte Datei
Felder einschleusen, die eine spätere Version versehentlich ausliest.
"""

import csv
import io
import re
import unicodedata

# ── Harte Grenzen ─────────────────────────────────────────────────────────────
# Alle Limits greifen VOR dem Parsen (Größe/Zeilen) bzw. pro Zelle — ein Upload
# darf niemals erst durch den Parser laufen, um dann als zu groß aufzufallen.

MAX_UPLOAD_BYTES     = 1 * 1024 * 1024   # 1 MB
MAX_ROWS             = 2000              # Datenzeilen ohne Header
MAX_PLAN_NAME_LEN    = 255               # = VARCHAR(255) in workout_templates.name
MAX_EXERCISE_NAME_LEN = 255              # = VARCHAR(255) in exercises.name
MAX_NOTES_LEN        = 500               # = VARCHAR(500) in workout_template_items.notes
MAX_PLANS_PER_IMPORT = 20
MAX_ITEMS_PER_PLAN   = 200               # deckt sich mit TemplateCreate.items (max_length=200)
MAX_ORDER_INDEX      = 10_000

# Eine einzelne Zelle größer als das ist immer ein Angriff oder Müll — der
# stdlib-Default (128 KB) ist für unsere Feldlängen um Größenordnungen zu groß.
csv.field_size_limit(64 * 1024)

REQUIRED_COLUMNS = ("plan_name", "exercise_name", "order_index")
OPTIONAL_COLUMNS = ("notes",)
ALL_COLUMNS      = REQUIRED_COLUMNS + OPTIONAL_COLUMNS

# Zeichen, mit denen eine Zelle beginnen darf, damit Excel/LibreOffice/Sheets sie
# als Formel auswerten. Identisch zur Export-Seite in routers/auth.py.
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

# Namens-Whitelist: Unicode-Buchstaben/Ziffern (also auch Umlaute) plus die
# Satzzeichen, die in echten Übungs-/Plannamen vorkommen ("Trizeps-Pushdown",
# "Rudern (vorgebeugt)", "Push/Pull"). Alles andere — insbesondere = @ ; | $ { }
# und sämtliche Steuerzeichen — wird abgelehnt, statt es zu "reparieren".
NAME_ALLOWED = re.compile(r"^[\w \-.,()&/+'’!°%]+$", re.UNICODE)

# Binär-Signaturen, die als .csv getarnt hochgeladen werden könnten.
BINARY_MAGIC = (
    (b"PK\x03\x04",     "ZIP/XLSX-Datei"),
    (b"\xd0\xcf\x11\xe0", "Excel-/Office-Binärdatei"),
    (b"%PDF",           "PDF-Datei"),
    (b"\x89PNG",        "PNG-Bild"),
    (b"\xff\xd8\xff",   "JPEG-Bild"),
    (b"GIF8",           "GIF-Bild"),
    (b"\x1f\x8b",       "GZIP-Archiv"),
    (b"\x7fELF",        "Programmdatei"),
    (b"<?xml",          "XML-Datei"),
    (b"<html",          "HTML-Datei"),
    (b"<!DOC",          "HTML-Datei"),
)

ACCEPTED_MIME_TYPES = {
    "text/csv",
    "application/csv",
    "text/plain",
    "text/comma-separated-values",
    # Windows/Excel meldet .csv je nach Registry als vnd.ms-excel — der
    # Inhalts-Check unten entscheidet ohnehin, der MIME-Typ ist nur die Vorstufe.
    "application/vnd.ms-excel",
    "application/octet-stream",
    "",
}


class CsvRejected(Exception):
    """Datei ist als Ganzes unbrauchbar — nutzerlesbarer Grund, kein Stacktrace."""


# ── Zell-Härtung ──────────────────────────────────────────────────────────────

def neutralize_cell(value) -> str:
    """Export-Seite: schützendes ' vor Zellen, die sonst als Formel starten."""
    text = "" if value is None else str(value)
    if text[:1] in FORMULA_PREFIXES:
        return "'" + text
    return text


def defuse_cell(value) -> str:
    """Import-Seite: entschärft eine Zelle, BEVOR sie gespeichert oder je wieder
    exportiert wird.

    Reihenfolge ist wichtig:
      1. NUL- und sonstige Steuerzeichen raus (die überleben sonst bis in Logs
         und CSV-Reader anderer Programme),
      2. unser eigener Export-Schutz (führendes ' vor einem Formelzeichen) wird
         einmalig abgestreift — sonst wächst der Name bei jedem
         Export→Import→Export-Durchlauf um ein weiteres ',
      3. Whitespace trimmen,
      4. neu entschärfen.

    Ergebnis: was in der DB landet, beginnt garantiert nicht mit einem
    Formelzeichen.
    """
    text = "" if value is None else str(value)
    # Steuerzeichen (inkl. NUL) entfernen, Tab/CR/LF eingeschlossen.
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Cc")
    if len(text) >= 2 and text[0] == "'" and text[1] in FORMULA_PREFIXES:
        text = text[1:]
    text = text.strip()
    if text[:1] in FORMULA_PREFIXES:
        text = "'" + text
    return text


def validate_name(raw, field_label: str, max_len: int):
    """→ (sauberer Name, Fehlertext). Genau eins der beiden ist gesetzt."""
    value = defuse_cell(raw)
    if not value:
        return None, f"{field_label} ist leer"
    if len(value) > max_len:
        return None, f"{field_label} ist länger als {max_len} Zeichen"
    if not NAME_ALLOWED.match(value):
        return None, f"{field_label} enthält unerlaubte Zeichen"
    return value, None


def validate_notes(raw):
    """Notizen sind Freitext und daher bewusst nicht zeichen-whitelisted —
    entschärft und längenbegrenzt wird trotzdem."""
    value = defuse_cell(raw)
    if len(value) > MAX_NOTES_LEN:
        return None, f"Notiz ist länger als {MAX_NOTES_LEN} Zeichen"
    return value, None


# ── Datei-Ebene ───────────────────────────────────────────────────────────────

def check_upload_meta(filename: str, content_type: str) -> None:
    """Erste Stufe: Dateiname + gemeldeter MIME-Typ. Beides ist vom Client frei
    wählbar, deshalb ist das nur die Vorprüfung — verlassen wird sich auf
    decode_csv() weiter unten."""
    name = (filename or "").strip()
    if not name.lower().endswith(".csv"):
        raise CsvRejected("Nur .csv-Dateien werden akzeptiert")
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in ACCEPTED_MIME_TYPES:
        raise CsvRejected("Dateityp wird nicht akzeptiert — bitte eine CSV-Datei hochladen")


def decode_csv(data: bytes) -> str:
    """Zweite Stufe: der tatsächliche Inhalt entscheidet. Erkennt getarnte
    Binärdateien und erzwingt UTF-8."""
    if not data:
        raise CsvRejected("Die Datei ist leer")
    if len(data) > MAX_UPLOAD_BYTES:
        raise CsvRejected(f"Die Datei ist größer als {MAX_UPLOAD_BYTES // 1024} KB")

    head = data[:8]
    for magic, label in BINARY_MAGIC:
        if data.startswith(magic):
            raise CsvRejected(f"Das ist keine CSV-Datei, sondern offenbar eine {label}")
    if b"\x00" in head:
        raise CsvRejected("Die Datei ist keine Textdatei")

    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CsvRejected("Die Datei ist nicht UTF-8-kodiert — bitte als UTF-8-CSV speichern")

    if "\x00" in text:
        raise CsvRejected("Die Datei ist keine Textdatei")
    return text


def _normalize_header(field: str) -> str:
    return (field or "").strip().lstrip("﻿").lower()


def parse_plan_csv(text: str):
    """Parst den bereits dekodierten Text.

    → (plans, errors)
      plans:  [{"plan_name": str, "rows": [{"row": int, "exercise_name": str,
                "order_index": int, "notes": str}]}]
      errors: [{"row": int|None, "reason": str}]

    Wirft CsvRejected nur, wenn die Datei als Ganzes unbrauchbar ist (Header
    fehlt/falsch, zu viele Zeilen). Einzelne kaputte Zeilen landen in `errors`,
    damit der Nutzer die gültigen trotzdem importieren kann.
    """
    reader = csv.reader(io.StringIO(text, newline=""))

    try:
        header = next(reader)
    except StopIteration:
        raise CsvRejected("Die Datei enthält keine Daten")
    except csv.Error:
        raise CsvRejected("Die Datei konnte nicht als CSV gelesen werden")

    columns = [_normalize_header(h) for h in header]
    missing = [c for c in REQUIRED_COLUMNS if c not in columns]
    if missing:
        raise CsvRejected(
            "Kopfzeile unvollständig — erwartet werden die Spalten "
            f"{', '.join(ALL_COLUMNS)} (fehlt: {', '.join(missing)})"
        )
    unknown = [c for c in columns if c and c not in ALL_COLUMNS]
    if unknown:
        raise CsvRejected(
            f"Unbekannte Spalte(n): {', '.join(unknown[:5])} — erlaubt sind nur "
            f"{', '.join(ALL_COLUMNS)}"
        )
    if len(columns) != len(set(columns)):
        raise CsvRejected("Kopfzeile enthält doppelte Spaltennamen")

    idx = {name: columns.index(name) for name in ALL_COLUMNS if name in columns}

    plans: dict = {}
    errors: list = []
    data_rows = 0

    while True:
        try:
            row = next(reader)
        except StopIteration:
            break
        except csv.Error:
            # Defekte Quoting-Sequenz o.ä. — Zeilennummer ist hier nicht mehr
            # verlässlich, also brechen wir mit generischem Hinweis ab.
            raise CsvRejected("Die Datei konnte nicht als CSV gelesen werden")

        line_no = reader.line_num
        if not any((cell or "").strip() for cell in row):
            continue  # Leerzeile überspringen

        data_rows += 1
        if data_rows > MAX_ROWS:
            raise CsvRejected(f"Die Datei hat mehr als {MAX_ROWS} Datenzeilen")

        def cell(name: str) -> str:
            pos = idx.get(name)
            if pos is None or pos >= len(row):
                return ""
            return row[pos]

        plan_name, err = validate_name(cell("plan_name"), "Planname", MAX_PLAN_NAME_LEN)
        if err:
            errors.append({"row": line_no, "reason": err})
            continue

        exercise_name, err = validate_name(cell("exercise_name"), "Übungsname", MAX_EXERCISE_NAME_LEN)
        if err:
            errors.append({"row": line_no, "reason": err})
            continue

        raw_order = defuse_cell(cell("order_index"))
        if not raw_order:
            order_index = 0  # ohne Angabe zählt die Dateireihenfolge
        else:
            try:
                order_index = int(raw_order)
            except ValueError:
                errors.append({"row": line_no, "reason": "order_index ist keine ganze Zahl"})
                continue
            if not 0 <= order_index <= MAX_ORDER_INDEX:
                errors.append({
                    "row": line_no,
                    "reason": f"order_index muss zwischen 0 und {MAX_ORDER_INDEX} liegen",
                })
                continue

        notes, err = validate_notes(cell("notes"))
        if err:
            errors.append({"row": line_no, "reason": err})
            continue

        bucket = plans.setdefault(plan_name, [])
        if len(bucket) >= MAX_ITEMS_PER_PLAN:
            errors.append({
                "row": line_no,
                "reason": f"Plan '{plan_name}' hat mehr als {MAX_ITEMS_PER_PLAN} Übungen",
            })
            continue
        if len(plans) > MAX_PLANS_PER_IMPORT:
            raise CsvRejected(f"Die Datei enthält mehr als {MAX_PLANS_PER_IMPORT} verschiedene Pläne")

        bucket.append({
            "row": line_no,
            "exercise_name": exercise_name,
            "order_index": order_index,
            "notes": notes,
        })

    if not plans:
        if errors:
            return [], errors
        raise CsvRejected("Die Datei enthält keine gültigen Datenzeilen")

    result = []
    for name, rows in plans.items():
        # Stabil nach order_index sortieren; bei Gleichstand entscheidet die
        # Reihenfolge in der Datei (enumerate-Index als zweites Kriterium).
        ordered = [r for _, r in sorted(enumerate(rows), key=lambda p: (p[1]["order_index"], p[0]))]
        result.append({"plan_name": name, "rows": ordered})

    return result, errors


# ── Beispiel-/Export-Erzeugung ────────────────────────────────────────────────

def write_plan_csv(plans) -> str:
    """Schreibt Pläne im Import-Format. `plans` ist eine Liste von
    (plan_name, [(exercise_name, order_index, notes), …]).

    Jede Zelle läuft durch neutralize_cell — der Export darf niemals eine
    Formel produzieren, auch nicht aus Namen, die andere Nutzer angelegt haben
    (Übungen sind nutzerübergreifend geteilt)."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(list(ALL_COLUMNS))
    for plan_name, items in plans:
        for exercise_name, order_index, notes in items:
            writer.writerow([
                neutralize_cell(plan_name),
                neutralize_cell(exercise_name),
                int(order_index),
                neutralize_cell(notes),
            ])
    return out.getvalue()


SAMPLE_CSV = write_plan_csv([
    ("Push Day", [
        ("Bankdrücken", 1, "Aufwärmsatz nicht vergessen"),
        ("Schulterdrücken", 2, ""),
        ("Trizeps-Pushdown", 3, "langsam ablassen"),
    ]),
    ("Pull Day", [
        ("Klimmzüge", 1, ""),
        ("Rudern vorgebeugt", 2, ""),
        ("Bizeps-Curls", 3, ""),
    ]),
])
