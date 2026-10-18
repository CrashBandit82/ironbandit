# IronBandit — Installation & Setup Guide

A self-hosted workout/exercise tracker. FastAPI + PostgreSQL backend, React + Vite + Tailwind frontend, deployed via Docker Compose behind an external Nginx Proxy Manager.

## 🚀 Quick Start

```bash
cd /opt/ironbandit
docker-compose up -d --build
```

The app listens on port 80 of this host (bound to all interfaces so an external reverse proxy — e.g. Nginx Proxy Manager on `ironbandit.at` — can reach it). This container's own nginx does **not** handle TLS; that's the external proxy's job.

- App: `http://<this-host>/`
- API docs: `http://<this-host>/api/docs` (schema/redoc are intentionally disabled)
- Health check: `http://<this-host>/api/health`

## 🔑 Before Registration/Reset Emails Work

`.env` ships with generated database and JWT secrets, but the SMTP fields are **left empty on purpose** — the app runs fine without them (registration/login always work; only the confirmation/reset emails silently don't send). Fill these in when you have real credentials, no code changes needed:

- `SMTP_HOST`
- `SMTP_PORT` (defaults to 587)
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_ADDRESS` — the visible "From" address (e.g. `noreply@ironbandit.at`), kept separate from `SMTP_USER` so you can authenticate with one mailbox but send as another
- `NOTIFY_EMAIL` — receives new-registration and feedback notifications

After editing `.env`, restart the backend: `docker-compose up -d backend`.

## 👤 Promoting a User to Admin

There's no self-service admin signup. After registering a normal account, promote it directly in Postgres:

```bash
docker exec -it ironbandit-db psql -U ironbandit -d ironbandit \
  -c "UPDATE users SET is_admin = true WHERE email = 'you@example.com';"
```

The admin panel (users, broadcast email, inactivity warnings, wger.de exercise import) becomes available in the account header once `is_admin` is set.

## 🏋️ Importing Exercises from wger.de

The ~21 hand-seeded exercises are a starting point. From the admin panel's "Import" tab, you can pull in wger.de's full public exercise database (CC-BY-SA licensed) — it dedupes against already-imported exercises, so it's safe to run more than once.

## 🔒 Email Verification

Verification is **soft**: registering always creates a usable account and login is never blocked by an unverified email — an "unverified" banner with a resend button shows in the dashboard instead. This means the app is fully usable even before SMTP is configured.

## 📊 Key API Endpoints

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`
- `GET/POST /api/workouts/exercises`, `POST /api/workouts`, `GET /api/workouts/today`, `GET /api/workouts/weekly`
- `GET/POST /api/templates`, `POST /api/templates/{id}/apply`
- `POST/GET/DELETE /api/weight`, `GET /api/weight/history`
- `GET /api/admin/users`, `POST /api/admin/broadcast`, `POST /api/admin/notify-inactive`, `POST /api/admin/import-wger`
- `GET /api/auth/export` — CSV export of your own data

## 🗄️ Data Backup

Postgres data lives in the `ironbandit-db-data` Docker volume. Backup with:

```bash
docker exec ironbandit-db pg_dump -U ironbandit ironbandit > backup_$(date +%Y%m%d).sql
```

Restore with:

```bash
cat backup_20260101.sql | docker exec -i ironbandit-db psql -U ironbandit -d ironbandit
```

## 🔢 Versionierung & Update-Hinweis

Die App-Version folgt Semantic Versioning und wird an **genau einer Stelle** gepflegt:
das Feld `version` in `frontend/package.json`.

| Änderungsumfang | Stelle | Beispiel |
| --- | --- | --- |
| Bugfix, Textänderung, kleine UI-Korrektur | PATCH | 1.3.0 → 1.3.1 |
| neues kleineres Feature, spürbarer Umbau eines Bereichs | MINOR | 1.3.1 → 1.4.0 |
| Strukturumbau, Architektur-/Datenmodell-Änderung, großer neuer Bereich | MAJOR | 1.4.0 → 2.0.0 |

Woher die Nummer überall kommt:

* `vite.config.js` injiziert sie als `__APP_VERSION__` → `frontend/src/version.js` → dezent
  im Dashboard-Footer (`Dashboard.jsx`, unter dem IronBandit-Wortmarke-Button).
* Dasselbe Plugin (`ironbandit-version-stamp`) stempelt sie nach dem Build in
  `dist/sw.js` und schreibt `dist/version.json` (`curl localhost/version.json` zeigt,
  welche Version tatsächlich deployt ist).
* Weil sich `sw.js` dadurch bei jedem Bump ändert, erkennt der Browser einen neuen
  Service Worker — **ohne Bump gibt es keine Update-Meldung.**

**Update-Hinweis:** `frontend/src/hooks/useAppUpdate.js` prüft alle 60 s (und beim
Zurückkehren in den Vordergrund) auf einen neuen Worker. Der neue Worker ruft
absichtlich *kein* `skipWaiting`, bleibt also im Zustand `waiting`; das Frontend zeigt
daraufhin `UpdateBanner.jsx` ("Version X verfügbar" + "Jetzt aktualisieren"). Erst der
Klick schickt `SKIP_WAITING` und lädt neu — nie automatisch, damit niemand mitten in
einer Eingabe die Seite unter den Fingern verliert.

**Nach `sw.js`-Änderungen prüfen:** `location = /sw.js` in `nginx.conf` muss
`no-store` liefern (sonst frisst die 1-Jahr-Regel für `*.js` die Update-Erkennung).

E2E-Test des ganzen Ablaufs (echtes Chromium, echter Service Worker):

```bash
apt-get install -y --no-install-recommends chromium   # einmalig
cd frontend && npm install --no-save puppeteer-core   # nicht in package.json
node test/sw-update.test.mjs                          # ~2,5 min
SWTEST_SHOTS=/tmp/shots node test/sw-update.test.mjs  # zusätzlich Screenshots
```

Der Test baut 1.2.2 / 1.3.0 / 1.3.1, deployt sie in einen eigenen Static-Server und prüft
Erkennung, Versionsanzeige im Banner, "kein Reload ohne Klick" und das Update per Klick.
Er nutzt den Harness `frontend/swtest.html` + `frontend/src/__swtest__/` +
`frontend/vite.swtest.config.mjs` (rendern nur den Banner, kein Login nötig) — diese
Dateien landen **nicht** im Produktions-Build, dessen Einstiegspunkt `index.html` ist.

## 📜 Changelog

### 1.8.0 — Training abbrechen

Neuer Knopf „Training abbrechen“ (mit Rückfrage) unter dem laufenden Training.
`DELETE /api/sessions/{id}` verwirft die Session — es wird keine Trainingsdauer gespeichert.
Plan-Übungen ohne jeden Eintrag (keine Sätze, keine Dauer) werden mit entfernt, bereits
erfasste Sätze bleiben im Verlauf. 2 zusätzliche Tests in `test_sessions_notes.py`.

### 1.7.0 — Pausen-Ende als Benachrichtigung (Smartwatch)

Am Ende des Pausen-Timers kann eine System-Benachrichtigung erscheinen ("⏱ Pause vorbei –
Bankdrücken, Satz 3"). Eine gekoppelte Smartwatch (Garmin, Apple Watch, Wear OS, …)
vibriert dadurch mit — die Web-App steuert keine Uhr direkt, die Begleit-App der Uhr leitet
die Handy-Benachrichtigung weiter. Länge/Stärke der Vibration bestimmt die Uhr.

* Einstellung unter Konto → Pausendauer (`RestNotifySettings.jsx`), **pro Gerät** in
  localStorage (`ironbandit_rest_notify`), weil die Mitteilungs-Erlaubnis gerätegebunden ist.
  Mit Test-Button. iPhone: nur in der installierten Home-Bildschirm-App (iOS ≥ 16.4).
* Ausgelöst über `registration.showNotification` (`utils/restNotify.js`) — Android-Chrome
  erlaubt `new Notification()` nicht. `tag` + `renotify`, damit jede Pause erneut meldet.
* `sw.js`: `notificationclick` holt das offene IronBandit-Fenster nach vorne.
* `RestTimer.jsx` zählt jetzt gegen eine feste Endzeit statt sekundenweise herunter;
  gedrosselte Timer verschieben nur die Anzeige, nicht das Pausenende.

### 1.6.0 — Dauernotiz pro Übung und Trainingsdauer

**Dauernotiz.** Die Notiz im aktiven Training hing bisher am einzelnen `WorkoutLog`, also
an einer Übung an *einem* Tag — beim nächsten Training derselben Übung war das Feld leer.
Neu ist die Tabelle `exercise_notes` (genau eine Zeile je Nutzer + Übung, Unique-Constraint):
die Notiz erscheint bei jedem Training dieser Übung wieder, bis man sie ändert. Endpunkte
`GET/PUT /api/workouts/exercises/{id}/note`; eine leere Notiz löscht die Zeile.
`ActiveExerciseCard.jsx` speichert automatisch ~1 s nach dem Tippen, beim Verlassen des
Feldes und beim Schließen/Wechseln der Übung (vorher nur per `onBlur`).
`WorkoutLog.notes` bleibt für Bestandsdaten (Historie, CSV-Export) unverändert erhalten.

**Datenbank-Migration (einmalig).** Beim ersten Start mit 1.6.0 wird `exercise_notes`
per `create_all` angelegt und aus der jeweils jüngsten Log-Notiz pro (Nutzer, Übung)
befüllt (`_seed_exercise_notes_from_logs` in `main.py`). Das läuft nur, wenn die Tabelle
in diesem Start neu entstanden ist — später gelöschte Notizen kommen nicht zurück.

**Trainingsdauer.** Neue Tabelle `workout_sessions` + Router `routers/sessions.py`.
Plan starten legt eine Session an (bzw. hängt an eine laufende an, die Uhr läuft dann
weiter); „Workout abschließen“/„Fertig“ setzt `finished_at` und `duration_sec`. Das
Dashboard zeigt während des Trainings eine laufende Uhr (`SessionTimer.jsx`, korrigiert
um die Abweichung der Geräte-Uhr per `server_now`) und im Tagesverlauf die Dauer jedes
abgeschlossenen Trainings. Die laufende Session übersteht jetzt einen Reload/App-Wechsel
(`GET /api/sessions/active`). Nie abgeschlossene Sessions verfallen nach 12 h
(`ACTIVE_MAX_AGE`) und erscheinen weder als aktiv noch im Verlauf.

**Tests.** `backend/tests/test_sessions_notes.py` (9 Tests: Persistenz über Trainings,
pro Nutzer getrennt, Leeren, Validierung, Übung löschen, Dauer messen, Anhängen,
Verfall, Fremdzugriff).

### 1.5.1 — Icon-Safe-Zone plattformübergreifend korrigiert

Icon-Safe-Zone plattformübergreifend korrigiert (Android maskable + iOS apple-touch-icon),
verhindert Randbeschnitt auf allen getesteten Launcher-Maskenformen.

**Ursache.** Im Manifest zeigte `purpose: "maskable"` auf dieselbe Datei wie `purpose: "any"`
(`icon-512.png`). Deren Kreis-Emblem füllt die Canvas zu **100,4 %**. Chrome nimmt bei einem
maskable-Icon an, die äußeren 20 % seien Rand, und zoomt entsprechend hinein — dadurch
schnitten Android-Launcher sichtbar ins Motiv (Hantel oben, Bizeps rechts). Auf einem
MIUI-Squircle war das am deutlichsten.

**Fix.** Neue Datei `frontend/public/icon-512-maskable.png`: das Artwork proportional auf
**79,2 %** der Canvas verkleinert und zentriert auf vollflächigem `#0f172a` platziert — exakt
die Hintergrundfarbe des Originals (außerhalb des Kreises genau eine einzige Farbe über
48 289 Pixel gemessen), daher entsteht keine sichtbare Kante. Damit liegt das komplette Motiv
innerhalb des zentrierten 80-%-Kreises (ø 410 px), der strengsten aller Android-Maskenformen —
Kreis, Squircle, Rundrechteck und Teardrop schneiden nichts mehr ab.

| | Motiv-Durchmesser | Pixel außerhalb der Safe Zone |
|---|---|---|
| vorher (`icon-512.png` als maskable) | 514,0 px = **100,4 %** | 73 940 |
| nachher (`icon-512-maskable.png`) | 405,3 px = **79,2 %** | **0** |

**Unverändert — und das ist korrekt so:**
* `icon-512.png` / `icon-192.png` (`purpose: "any"`) bleiben randfüllend. Windows-/Desktop-PWA
  maskiert nicht, dort ist randfüllend richtig.
* `apple-touch-icon.png` (180×180) bleibt randfüllend und **ohne** eigene Rundung. iOS
  unterstützt kein maskable und legt seine eigene Superellipse an; ein bereits gerundetes oder
  gepaddetes Bild ergäbe dort einen doppelten Rand. Gegengeprüft: Alpha durchgehend 255, alle
  vier Ecken deckend, Rand 0 px auf allen Seiten, Motiv füllt 100 % der Breite. Zum Vergleich
  hätte das maskable-Icon auf iOS nur 78,9 % gefüllt — genau der „zu klein mit Rahmen"-Effekt.

**Service-Worker.** Kein manueller Eingriff nötig: `sw.js` bildet den Cache-Namen als
`ironbandit-${APP_VERSION}`, und `APP_VERSION` wird beim Build aus `package.json` gestempelt.
Der Versionssprung auf 1.5.1 zählt den Cache-Namen also mit hoch, der `activate`-Handler löscht
alle abweichenden Caches. Die neue Datei hat ohnehin einen neuen Namen und kann daher nicht
aus einem alten Cache stammen.

**Hinweis für Nutzer.** Launcher cachen Homescreen-Icons und aktualisieren sie nicht von
selbst. Wer die PWA installiert hat, muss das Icon vom Homescreen entfernen und die App neu
installieren (iOS: „Zum Home-Bildschirm hinzufügen" erneut ausführen).

### 1.5.0 — CSV-Import für Trainingspläne (mit Vorschau)

Trainingspläne lassen sich jetzt als CSV importieren und exportieren. Der Import läuft
zweistufig: erst Vorschau, dann Bestätigung.

**Datenbank-Migration.** Zwei Änderungen, beide idempotent in
`_migrate_plan_and_exercise_ownership_schema()` bzw. über `create_all`:
* `workout_template_items.notes VARCHAR(500)` (nullable) — Trägerspalte der `notes`-Spalte
  im CSV-Format. Ohne sie würde ein Export→Import-Durchlauf Notizen still verlieren.
* neue Tabelle `plan_import_sessions` — kurzlebiger Zwischenspeicher der Vorschau.

**Ablauf.** `POST /api/plans/import/preview` nimmt die Datei, prüft und parst sie, gleicht
Übungsnamen gegen die geteilte `exercises`-Tabelle ab (exakt, sonst Fuzzy-Vorschläge per
`difflib`) und schreibt **nichts** an Plandaten. Zurück kommt eine Vorschau plus eine
Session-ID mit 10 Minuten TTL. `POST /api/plans/import/confirm` legt die Pläne erst dann an
— gebunden an `current_user` aus dem JWT, mit den Korrekturen des Nutzers (manuelle
Zuordnung, Zeilen überspringen). Danach wird die Session gelöscht, dieselbe ID kann nicht
zweimal importieren.

**Erwartetes Format** (`plan_name, exercise_name, order_index, notes`; `notes` optional).
`GET /api/plans/import/sample` liefert eine Beispieldatei, `GET /api/plans/export` die
eigenen Pläne im selben Format — Export → Import läuft ohne Nachbearbeitung durch.

**Härtung.** Größe (1 MB) und Zeilenzahl (2000) werden vor dem Parsen abgewiesen, mit
laufender Prüfung beim Lesen statt nur per `Content-Length`. Dateityp wird dreifach geprüft
(Endung, MIME-Typ, tatsächlicher Inhalt inkl. Binär-Signaturen wie ZIP/XLSX, PNG, PDF).
Zellen, die mit `=`, `+`, `-`, `@`, Tab oder CR beginnen, werden beim Parsen entschärft,
bevor sie gespeichert werden; Plan- und Übungsnamen laufen zusätzlich gegen eine
Zeichen-Whitelist. Parsing ist reines stdlib-`csv` — kein `eval`, kein `exec`, keine
Formelauswertung. Rate-Limit 5 Importe pro Stunde, gezählt **pro Nutzer** (nicht pro IP,
sonst teilen sich NAT-Nutzer ein Kontingent). Vorschau-Sessions tragen ein UUID4 und werden
bei jeder Abfrage zusätzlich auf `user_id` gefiltert — eine fremde Session-ID ist auch bei
Kenntnis wertlos. Fehlermeldungen sind generisch, ohne Stacktrace oder Pfade.

**Tests.** Neu: `backend/tests/` (25 Tests) — CSV-Injection in Notizen und Namensfeldern,
übergroße Datei, Zeilenlimit, falscher MIME-Typ, falsche Endung, als CSV getarnte
Binärdatei, erfolgreicher Import, Fuzzy-Zuordnung, Round-Trip, Fremdzugriff auf
Vorschau-Sessions, abgelaufene/verbrauchte Session, Rate-Limit. Ausführen:
`pip install -r backend/requirements-dev.txt && pytest backend/tests -q`.

**Frontend.** Neue Komponente `PlanImport.jsx` im Trainingsplan-Bereich: Datei wählen →
Vorschau mit Trefferliste, Dropdown zum manuellen Zuordnen nicht erkannter Übungen und
Möglichkeit, einzelne Zeilen abzuwählen → „Import bestätigen". Fehlerhafte Zeilen werden
gelistet, blockieren die gültigen aber nicht. Landingpage: der bestehende Feature-Punkt
„Trainingspläne" nennt jetzt Export und Import.

### 1.4.0 — Sicherheitsaudit umgesetzt (Bildverarbeitung, Token-Handling, Limits)

Abarbeitung des zweiten Sicherheitsaudits (Report: `/root/sicherheitsluecken-ironbandit-2026-07-26.txt`).
**Keine Datenbank-Migration** — kein Schema wurde geändert, keine Zeile angefasst. Vor dem
Durchlauf wurde trotzdem ein Dump gezogen (`backups/ironbandit-db-20260726-104350.sql`).

**Bildverarbeitung (HOCH-1).** Der Avatar-Upload prüfte nur `file.content_type` — einen vom
Client gesetzten Header. Pillow bestimmt das Format aber am Dateiinhalt, also erreichte ein
als `image/png` deklariertes PSD/FITS/JPEG2000/PDF den jeweiligen Decoder; genau dort saßen
die Speicherfehler der 24 offenen Pillow-Advisories. Jetzt: `pillow==12.3.0`, beim Import
werden alle Decoder außer JPEG/PNG/WEBP deregistriert (`Image.OPEN` **und** `Image.ID` —
nur eines von beiden zu leeren, endet in einem `KeyError` statt in sauberer Ablehnung), und
nach `Image.open()` wird zusätzlich `img.format` geprüft. Bestehende Avatare unberührt.

**Einmal-Tokens nicht mehr im Access-Log (MITTEL-1).** Verifikations- und Reset-Links
übergaben ihren Token als Query-Parameter; nginx protokolliert `$request` samt Query, wodurch
gültige Tokens im Klartext in `logs/nginx/access.log` standen. Links nutzen jetzt ein
URL-Fragment (`#token=…`), das der Browser nie an den Server sendet, und die Bestätigung
läuft über `POST /api/auth/verify-email` mit Token im Body. Das Frontend liest `#token=`
bevorzugt und `?token=` weiterhin als Fallback (Altlinks), entfernt den Token nach dem
Einlesen aus der Adresszeile. Der alte `GET`-Endpunkt bleibt als `deprecated` erhalten,
solange Altlinks und gecachte Bundles im Umlauf sind.

**Übungen sind nicht mehr fremdzerstörbar (MITTEL-3).** Das Löschen einer Übung entfernt die
Plan-Einträge *aller* Nutzer. Wer eine viel genutzte Übung angelegt hatte, konnte damit fremde
Trainingspläne beschneiden, per Umbenennung auch nachträglich fremde Pläne verändern. Beides
ist jetzt mit `409` gesperrt, sobald die Übung in mindestens einem fremden Plan steht —
bewusst ohne Ausnahme für Admins.

**Grenzen und Pagination (MITTEL-4/5).** Plan-Name ≤ 255 Zeichen, ≤ 200 Übungen je Plan,
≤ 100 Sätze je Log, `GET /weight/history?days=` auf 1–3650 begrenzt (vorher `OverflowError`
→ 500). `GET /workouts/exercises` ist paginiert (`limit`, Default 100, max. 1000; `offset`);
das Dashboard holt die Seiten nacheinander, damit die Relevanzsuche weiter den Gesamtbestand
sieht. Neu höchstens 200 selbst angelegte Übungen je Konto — bestehende bleiben unangetastet.

**Dependencies (MITTEL-6, NIEDRIG-1).** FastAPI 0.115.6 → 0.140.0, Starlette 0.41.3 → 1.3.1
(behebt u. a. den Range-Header-DoS in `FileResponse`, der über `/uploads/` ohne Login
erreichbar war), Pydantic 2.5.0 → 2.13.4, python-multipart 0.0.18 → 0.0.31, PyJWT 2.10.1 →
2.13.0, cryptography 48.0.0 → 48.0.1. `bcrypt` bleibt bewusst auf 4.0.1 (passlib 1.7.4).

**Infrastruktur.** Log-Verzeichnisse von 0777 auf 0750 (sie waren für jeden beschreibbar,
und der Ban-Watcher leitet aus ihnen ab, welche IPs gesperrt werden). `npm ci` mit Lockfile
statt `npm install` im Frontend-Build, damit der nächtliche Auto-Rebuild reproduzierbar ist.
`gcc` wird nach dem pip-Install wieder aus dem Backend-Image entfernt. `server_tokens off`,
`limit_req`/`limit_conn` als generische Bremse in nginx, und der Ban-Watcher bannt jetzt auch
404-Fluten (30/min → 1 h) — im Log standen Scanner mit hunderten Anfragen, die keine der
bekannten Pfad-Signaturen trafen und deshalb nie gebannt wurden.

**Kleinigkeiten.** Benutzernamen sind auf `[A-Za-z0-9_-]` beschränkt (`str.isalnum()` ließ
kyrillische Homoglyphen zu — bestehende Namen sind nicht betroffen, es gab ohnehin keine).
Höchstens 20 offene Plan-Freigaben je Empfänger. `PUT /auth/reminder` und `PUT /auth/theme`
nehmen ein Pydantic-Schema statt eines rohen `dict`. Das Feld `image_url` an Übungen ist aus
API und UI entfernt: es erlaubte beliebige externe Bild-URLs, die bei allen Nutzern geladen
worden wären (IP-Abfluss an fremde Server) und an der CSP ohnehin scheiterten — die
Datenbankspalte bleibt mit Inhalt bestehen, sie wird nur nicht mehr verwendet.

### 1.3.1 — Übungssuche findet selbst angelegte Übungen wieder

Fix: In den Übungs-Auswahldialogen (Plan-Editor „Übung hinzufügen" und Workout-Picker im
Dashboard) tauchten selbst angelegte Übungen bei der Suche oft nicht auf. Ursache war kein
Sichtbarkeits-/Owner-Filter im Backend, sondern die Frontend-Filterung: ein reiner
Substring-Match auf der alphabetisch sortierten Liste, hart gekürzt auf 8 Einträge
(`filter(...).slice(0, 8)`). Bei ~880 wger-Importen belegten alphabetisch frühere Treffer
(„Bulgarische Kniebeuge …", „Einbeinige Kniebeuge") alle 8 Plätze — der exakte Treffer
„Kniebeuge" stand auf Rang 14 und war unerreichbar.

Neu: `frontend/src/utils/exerciseSearch.js` sortiert nach Relevanz (exakt → beginnt mit →
Wortanfang → irgendwo; bei Gleichstand eigene Übungen zuerst, dann alphabetisch), zeigt bis
zu 25 Treffer und blendet „… und N weitere Treffer" ein, statt still abzuschneiden.
Beide Picker nutzen dieselbe Funktion. Backend und Datenmodell blieben unverändert —
Übungen sind per Design für alle sichtbar (`models.Exercise`, kein `is_global`-Flag), ein
Backfill war deshalb nicht nötig. Datenpflege: die durch wiederholte Anlegeversuche
entstandenen Dubletten „Kniebeugen" (889) und „Kniebeuge" (890) wurden entfernt; behalten
wurde 891, die den Trainingseintrag hat.

## 🧭 Reference Pack

`/opt/ironbandit/reference_pack/` contains the Macrobandit source files this app's structure was modeled on (auth pattern, router layout, component conventions, Docker setup). It's left in place for future reference and is not part of the running app.

## 🛠️ Manual (non-Docker) Development

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://ironbandit:<password>@localhost:5432/ironbandit
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to localhost:8000
```

## 🐛 Troubleshooting

- **Backend won't start / restarts in a loop**: check `docker-compose logs backend` — usually means Postgres wasn't ready yet or `DATABASE_URL` is wrong; `restart: unless-stopped` will retry automatically.
- **Login always fails**: verify `SECRET_KEY`/`REFRESH_SECRET_KEY` are set in `.env` and the backend container was restarted after any `.env` change (env vars are read at container start, not live-reloaded).
- **No emails sending**: expected until the `SMTP_*` fields above are filled in — check `docker exec ironbandit-api tail -50 /var/log/ironbandit/app.log` for the specific silently-caught error once SMTP is configured.
- **External proxy can't reach the app**: confirm `docker-compose.yml`'s frontend port mapping is `0.0.0.0:80:80` (not `127.0.0.1:80:80`) and that the LXC's firewall allows the proxy's network in.

## License

Copyright (C) 2026 CrashBandit82

IronBandit is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License v3.0** as published by the Free Software Foundation. If you run a modified version as a network service, you must make its source code available to its users. See [LICENSE](LICENSE) for the full text.
