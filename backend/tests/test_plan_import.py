"""Sicherheits- und Funktionstests für den Plan-CSV-Import."""

import io

import plan_csv
import models

PREVIEW = "/api/plans/import/preview"
CONFIRM = "/api/plans/import/confirm"

HEADER = "plan_name,exercise_name,order_index,notes\n"

# Der klassische Excel-/LibreOffice-Formel-Payload: beim Öffnen einer
# unbehandelten CSV würde das als DDE-Aufruf ausgeführt.
INJECTION_PAYLOAD = "=cmd|'/c calc'!A1"


def _upload(client, text, filename="plaene.csv", mime="text/csv"):
    data = text.encode("utf-8") if isinstance(text, str) else text
    return client.post(
        PREVIEW, files={"file": (filename, io.BytesIO(data), mime)}
    )


# ── 1. CSV-Injection ──────────────────────────────────────────────────────────

def test_csv_injection_in_notes_wird_entschaerft(client, db_session, seeded):
    """Der Payload darf die DB nur entschärft erreichen — mit führendem ',
    damit ein späterer Export ihn nicht als Formel wieder ausgibt."""
    csv_text = HEADER + f'Push Day,Bankdrücken,1,{INJECTION_PAYLOAD}\n'
    res = _upload(client, csv_text)
    assert res.status_code == 200, res.text

    body = res.json()
    stored_note = body["plans"][0]["rows"][0]["notes"]
    assert stored_note.startswith("'"), f"Notiz nicht entschärft: {stored_note!r}"
    assert not stored_note.startswith("=")

    confirm = client.post(CONFIRM, json={"session_id": body["session_id"]})
    assert confirm.status_code == 200, confirm.text

    item = db_session.query(models.WorkoutTemplateItem).one()
    assert item.notes == "'" + INJECTION_PAYLOAD
    assert not item.notes.startswith("=")


def test_csv_injection_als_uebungsname_wird_abgelehnt(client):
    """In Namensfeldern greift zusätzlich die Zeichen-Whitelist: die Zeile wird
    gar nicht erst importiert, sondern als Fehlerzeile gemeldet."""
    csv_text = HEADER + f'Push Day,{INJECTION_PAYLOAD},1,\nPush Day,Bankdrücken,2,\n'
    res = _upload(client, csv_text)
    assert res.status_code == 200

    body = res.json()
    assert len(body["errors"]) == 1
    assert body["errors"][0]["row"] == 2
    assert "unerlaubte Zeichen" in body["errors"][0]["reason"]

    # Die gültige Zeile bleibt importierbar
    namen = [r["exercise_name"] for p in body["plans"] for r in p["rows"]]
    assert namen == ["Bankdrücken"]


def test_export_erzeugt_keine_formelzelle():
    """Gegenprobe auf der Ausgabeseite: ein bösartiger Name darf den Export
    nicht als Formel verlassen."""
    out = plan_csv.write_plan_csv([("Plan", [(INJECTION_PAYLOAD, 1, "=1+1")])])
    for line in out.strip().splitlines()[1:]:
        for cell in line.split(","):
            assert not cell.lstrip('"').startswith(("=", "+", "@")), cell


def test_injection_roundtrip_waechst_nicht(client):
    """Export→Import→Export darf den Namen nicht bei jedem Durchlauf um ein
    weiteres ' verlängern."""
    once = plan_csv.defuse_cell(plan_csv.neutralize_cell(INJECTION_PAYLOAD))
    twice = plan_csv.defuse_cell(plan_csv.neutralize_cell(once))
    assert once == twice == "'" + INJECTION_PAYLOAD


# ── 2. Übergroße Datei ────────────────────────────────────────────────────────

def test_zu_grosse_datei_wird_abgelehnt(client, db_session):
    big = HEADER + ("Push Day,Bankdrücken,1,x\n" * 60_000)
    assert len(big.encode()) > plan_csv.MAX_UPLOAD_BYTES

    res = _upload(client, big)
    assert res.status_code == 400
    assert "größer als" in res.json()["detail"]
    # Nichts angelegt — auch keine Vorschau-Session
    assert db_session.query(models.PlanImportSession).count() == 0
    assert db_session.query(models.WorkoutTemplate).count() == 0


def test_zu_viele_zeilen_werden_abgelehnt(client):
    """Zeilen-Limit greift unabhängig von der Byte-Größe."""
    many = HEADER + ("P,Bankdrücken,1,\n" * (plan_csv.MAX_ROWS + 10))
    res = _upload(client, many)
    assert res.status_code == 400
    assert "Datenzeilen" in res.json()["detail"]


# ── 3. Falscher Dateityp ──────────────────────────────────────────────────────

def test_falscher_mime_type_wird_abgelehnt(client):
    res = _upload(client, HEADER + "P,Bankdrücken,1,\n",
                  filename="plaene.csv", mime="application/x-msdownload")
    assert res.status_code == 400
    assert "Dateityp" in res.json()["detail"]


def test_falsche_endung_wird_abgelehnt(client):
    res = _upload(client, HEADER + "P,Bankdrücken,1,\n",
                  filename="plaene.exe", mime="text/csv")
    assert res.status_code == 400
    assert ".csv" in res.json()["detail"]


def test_getarnte_binaerdatei_wird_am_inhalt_erkannt(client):
    """Endung .csv und MIME text/csv sind korrekt — nur der Inhalt verrät die
    xlsx-Datei. Genau dafür ist die Inhaltsprüfung da."""
    res = _upload(client, b"PK\x03\x04\x14\x00\x00\x00 irgendwas",
                  filename="plaene.csv", mime="text/csv")
    assert res.status_code == 400
    assert "CSV" in res.json()["detail"]


# ── 4. Erfolgreicher Import ───────────────────────────────────────────────────

def test_erfolgreicher_import(client, db_session, seeded):
    csv_text = (
        HEADER
        + "Push Day,Bankdrücken,1,ruhig ablassen\n"
        + "Push Day,Schulterdrücken,2,\n"
        + "Pull Day,Klimmzüge,1,\n"
    )
    res = _upload(client, csv_text)
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["total_rows"] == 3
    assert body["matched_rows"] == 3
    assert body["unmatched_rows"] == 0
    assert body["errors"] == []
    assert {p["plan_name"] for p in body["plans"]} == {"Push Day", "Pull Day"}
    # Schritt 1 legt noch keine Pläne an
    assert db_session.query(models.WorkoutTemplate).count() == 0

    confirm = client.post(CONFIRM, json={"session_id": body["session_id"]})
    assert confirm.status_code == 200, confirm.text
    result = confirm.json()
    assert len(result["created_plans"]) == 2

    plans = db_session.query(models.WorkoutTemplate).all()
    assert {p.name for p in plans} == {"Push Day", "Pull Day"}
    for p in plans:
        assert p.user_id == seeded["user_a"].id      # immer der Aufrufer
        assert [i.position for i in p.items] == list(range(1, len(p.items) + 1))

    push = next(p for p in plans if p.name == "Push Day")
    assert [i.exercise.name for i in push.items] == ["Bankdrücken", "Schulterdrücken"]
    assert push.items[0].notes == "ruhig ablassen"

    # Session ist nach dem Import verbraucht
    assert db_session.query(models.PlanImportSession).count() == 0


def test_unbekannte_uebung_mit_fuzzy_vorschlag_und_manueller_zuordnung(client, db_session, seeded):
    csv_text = HEADER + "Push Day,Bankdrucken,1,\nPush Day,Klimmzüge,2,\n"
    res = _upload(client, csv_text)
    body = res.json()

    unmatched = [r for p in body["plans"] for r in p["rows"] if not r["matched"]]
    assert len(unmatched) == 1
    assert "Bankdrücken" in [s["name"] for s in unmatched[0]["suggestions"]]

    confirm = client.post(CONFIRM, json={
        "session_id": body["session_id"],
        "resolutions": [{"row": unmatched[0]["row"],
                         "exercise_id": seeded["exercises"]["Bankdrücken"]}],
    })
    assert confirm.status_code == 200

    plan = db_session.query(models.WorkoutTemplate).one()
    assert [i.exercise.name for i in plan.items] == ["Bankdrücken", "Klimmzüge"]


def test_ungueltige_zeilen_blockieren_die_gueltigen_nicht(client, db_session):
    csv_text = (
        HEADER
        + "Push Day,Bankdrücken,1,\n"
        + "Push Day,Klimmzüge,keine-zahl,\n"     # Fehlerzeile
        + "Push Day,Schulterdrücken,3,\n"
    )
    res = _upload(client, csv_text)
    body = res.json()
    assert len(body["errors"]) == 1
    assert body["matched_rows"] == 2

    confirm = client.post(CONFIRM, json={"session_id": body["session_id"]})
    assert confirm.status_code == 200
    plan = db_session.query(models.WorkoutTemplate).one()
    assert [i.exercise.name for i in plan.items] == ["Bankdrücken", "Schulterdrücken"]


def test_zeilen_ueberspringen(client, db_session):
    csv_text = HEADER + "Push Day,Bankdrücken,1,\nPush Day,Klimmzüge,2,\n"
    body = _upload(client, csv_text).json()
    zweite = body["plans"][0]["rows"][1]["row"]

    confirm = client.post(CONFIRM, json={
        "session_id": body["session_id"], "skip_rows": [zweite],
    })
    assert confirm.status_code == 200
    assert confirm.json()["skipped_rows"] == 1
    plan = db_session.query(models.WorkoutTemplate).one()
    assert [i.exercise.name for i in plan.items] == ["Bankdrücken"]


def test_roundtrip_export_import(client, db_session, seeded):
    """Der Export muss ohne Nachbearbeitung wieder importierbar sein."""
    body = _upload(client, HEADER + "Push Day,Bankdrücken,1,Notiz\n").json()
    client.post(CONFIRM, json={"session_id": body["session_id"]})

    export = client.get("/api/plans/export")
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")

    again = _upload(client, export.text)
    assert again.status_code == 200
    reimported = again.json()
    assert reimported["unmatched_rows"] == 0
    assert reimported["errors"] == []
    assert reimported["plans"][0]["rows"][0]["notes"] == "Notiz"
    assert reimported["plans"][0]["already_exists"] is True


def test_beispieldatei_ist_selbst_importierbar(client):
    sample = client.get("/api/plans/import/sample")
    assert sample.status_code == 200
    res = _upload(client, sample.text)
    assert res.status_code == 200
    assert res.json()["errors"] == []


# ── 5. Session-Bindung an den Nutzer ──────────────────────────────────────────

def test_fremde_session_id_ist_unbrauchbar(client, client_factory, db_session, seeded):
    """Kernschutz: User B darf mit der Session-ID von User A nichts anfangen —
    auch wenn er sie kennt."""
    body = _upload(client, HEADER + "Push Day,Bankdrücken,1,\n").json()
    fremde_id = body["session_id"]

    client_b = client_factory(seeded["user_b"])
    res = client_b.post(CONFIRM, json={"session_id": fremde_id})
    assert res.status_code == 404
    assert db_session.query(models.WorkoutTemplate).count() == 0

    # Für den Eigentümer funktioniert dieselbe ID weiterhin
    assert client.post(CONFIRM, json={"session_id": fremde_id}).status_code == 200


def test_session_id_ist_uuid_nicht_hochzaehlend(client):
    import uuid
    ids = set()
    for _ in range(3):
        body = _upload(client, HEADER + "P,Bankdrücken,1,\n").json()
        uuid.UUID(body["session_id"])          # wirft, wenn kein gültiges UUID
        ids.add(body["session_id"])
    assert len(ids) == 3


def test_erratene_session_id_liefert_404(client):
    import uuid
    res = client.post(CONFIRM, json={"session_id": str(uuid.uuid4())})
    assert res.status_code == 404


def test_session_ist_nach_import_verbraucht(client, db_session):
    body = _upload(client, HEADER + "P,Bankdrücken,1,\n").json()
    assert client.post(CONFIRM, json={"session_id": body["session_id"]}).status_code == 200
    # Zweiter Aufruf darf den Plan nicht erneut anlegen
    assert client.post(CONFIRM, json={"session_id": body["session_id"]}).status_code == 404
    assert db_session.query(models.WorkoutTemplate).count() == 1


def test_abgelaufene_session_wird_abgelehnt(client, db_session):
    from datetime import datetime, timedelta, timezone
    body = _upload(client, HEADER + "P,Bankdrücken,1,\n").json()

    session = db_session.query(models.PlanImportSession).one()
    session.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    res = client.post(CONFIRM, json={"session_id": body["session_id"]})
    assert res.status_code == 404
    assert db_session.query(models.WorkoutTemplate).count() == 0


def test_erfundene_exercise_id_wird_abgelehnt(client, db_session):
    """Manuelle Zuordnung auf eine nicht existierende Übung muss ein sauberer
    400er sein — kein FK-Fehler mit 500 und Stacktrace."""
    body = _upload(client, HEADER + "P,Gibtsnicht,1,\n").json()
    row = body["plans"][0]["rows"][0]["row"]

    res = client.post(CONFIRM, json={
        "session_id": body["session_id"],
        "resolutions": [{"row": row, "exercise_id": 999_999}],
    })
    assert res.status_code == 400
    assert "existiert nicht" in res.json()["detail"]
    assert db_session.query(models.WorkoutTemplate).count() == 0


# ── 6. Fehlerausgabe ohne Interna ─────────────────────────────────────────────

def test_fehlermeldungen_enthalten_keine_interna(client):
    """Kein Stacktrace, kein Dateisystempfad, kein Modulname nach außen."""
    proben = [
        (b"\x89PNG\r\n\x1a\n", "plaene.csv", "text/csv"),
        ("völlig,anderes,format\n1,2,3\n", "plaene.csv", "text/csv"),
        (b"\xff\xfe\xfd binaer", "plaene.csv", "text/csv"),
    ]
    for data, name, mime in proben:
        res = _upload(client, data, filename=name, mime=mime)
        assert res.status_code == 400
        detail = res.json()["detail"]
        for verboten in ("Traceback", "/opt/", "/usr/lib", "plan_csv.py", "File \""):
            assert verboten not in detail, f"{verboten!r} steckt in: {detail!r}"


def test_leere_datei_wird_abgelehnt(client):
    res = _upload(client, b"")
    assert res.status_code == 400


# ── 7. Rate-Limiting ──────────────────────────────────────────────────────────

def test_rate_limit_greift(seeded, client_factory):
    """5 Versuche pro Stunde — der sechste muss 429 liefern.

    Der Limiter ist in den übrigen Tests abgeschaltet (conftest), damit die
    fachlichen Fälle nicht am Kontingent scheitern; hier wird er gezielt
    eingeschaltet und der Zähler vorher geleert.
    """
    from routers import plan_import

    client = client_factory(seeded["user_a"])
    plan_import.limiter.enabled = True
    try:
        plan_import.limiter._storage.reset()
        codes = [
            _upload(client, HEADER + "P,Bankdrücken,1,\n").status_code
            for _ in range(6)
        ]
    finally:
        plan_import.limiter.enabled = False
        plan_import.limiter._storage.reset()

    assert codes[:5] == [200] * 5, codes
    assert codes[5] == 429, codes


def test_rate_limit_konfiguration():
    """Der Limiter ist in den Funktionstests abgeschaltet (conftest), damit die
    fachlichen Fälle nicht am Kontingent scheitern. Hier wird belegt, dass das
    Limit konfiguriert ist und am Nutzer hängt — nicht an der IP."""
    from routers import plan_import

    assert plan_import.IMPORT_RATE_LIMIT == "5/hour"

    class FakeRequest:
        def __init__(self, token=None):
            self.headers = {"authorization": f"Bearer {token}"} if token else {}
            self.client = type("C", (), {"host": "10.0.0.1"})()

    import auth
    token = auth.create_access_token(42)
    assert plan_import._user_rate_key(FakeRequest(token)) == "user:42"
    # Ohne gültiges Token wird auf die IP zurückgefallen
    assert plan_import._user_rate_key(FakeRequest()).startswith("ip:")
    assert plan_import._user_rate_key(FakeRequest("kaputt")).startswith("ip:")
