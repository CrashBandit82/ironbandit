<p align="right"><a href="README.md">English</a> · <b>Deutsch</b></p>

<p align="center"><img src="frontend/public/icon-192.png" width="96" alt="IronBandit"></p>

<h1 align="center">IronBandit</h1>

<p align="center">
  Kostenloses digitales Trainingstagebuch fürs Krafttraining – als PWA installierbar.<br>
  Online unter <a href="https://ironbandit.at">ironbandit.at</a>
</p>

---

## Funktionen

- **Eigene Übungen & Trainingspläne** – Pläne wie „Push Day“ anlegen, teilen, als CSV importieren/exportieren
- **Satz für Satz** – Gewicht und Wiederholungen live im Studio eintragen, zur nächsten Übung wischen, Bildschirm bleibt an
- **Pausen-Timer** – auf Wunsch Benachrichtigung am Pausenende (auch auf der gekoppelten Smartwatch)
- **Fortschritt** – Verlauf, Bestleistungen, Diagramme, Wochenübersicht und Hinweis, wenn eine Übung stagniert
- **Körpergewicht-Tracker** direkt neben dem Training
- **Trainingsdauer** – laufende Uhr während des Trainings, gespeichert pro Einheit
- **Notizen pro Übung**, die bei jedem Training dieser Übung wieder erscheinen
- **Konto** – sanfte E-Mail-Bestätigung, Passwort zurücksetzen, Profilbild, CSV-Export der eigenen Daten
- **Admin-Bereich** – Nutzer, Rundmail, Inaktivitäts-Erinnerungen, Übungs-Import von wger.de
- **PWA** mit Update-Hinweis, Deutsch & Englisch, helles & dunkles Design

## Technik

| Teil | Technologie |
|---|---|
| Frontend | React, Vite, Tailwind CSS, i18next, Service Worker |
| Backend | Python, FastAPI, SQLAlchemy |
| Datenbank | PostgreSQL 16 |
| Betrieb | Docker Compose (Frontend-Container mit nginx, Backend, Datenbank) hinter einem externen Reverse Proxy für TLS |

## Schnellstart

```bash
cp .env.example .env      # danach die Werte eintragen
docker compose up -d --build
```

Die App lauscht auf Port 80 des Hosts. Das nginx im Container macht **kein** TLS – davor gehört ein Reverse Proxy (z. B. Nginx Proxy Manager) mit Zertifikat.

- App: `http://<host>/`
- API-Doku: `http://<host>/api/docs`
- Gesundheitsprüfung: `http://<host>/api/health`

## Konfiguration (`.env`)

| Variable | Zweck |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Datenbank |
| `SECRET_KEY`, `REFRESH_SECRET_KEY` | Schlüssel für die JWT-Anmeldung – lange Zufallswerte, nie zwischen Apps wiederverwenden |
| `ALLOWED_ORIGINS` | kommagetrennte Liste der Adressen, die die API aufrufen dürfen |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | E-Mail für Bestätigung und Passwort zurücksetzen |
| `SMTP_FROM_ADDRESS` | sichtbare Absenderadresse, getrennt vom SMTP-Login |
| `NOTIFY_EMAIL` | bekommt Meldungen zu neuen Registrierungen und Feedback |

Die SMTP-Felder dürfen leer bleiben: Registrierung und Login funktionieren immer, nur die E-Mails entfallen. Die Bestätigung ist **sanft** – ein unbestätigtes Konto ist voll nutzbar und sieht einen Hinweis mit „erneut senden“. Nach Änderungen an `.env`: `docker compose up -d backend`.

## Nutzer zum Admin machen

Eine Admin-Registrierung gibt es nicht. Normales Konto anlegen, dann:

```bash
docker exec -it ironbandit-db psql -U ironbandit -d ironbandit \
  -c "UPDATE users SET is_admin = true WHERE email = 'du@beispiel.at';"
```

## Übungen von wger.de importieren

Rund 21 Übungen sind vorbelegt. Im Admin-Bereich unter „Import“ lässt sich die öffentliche Übungsdatenbank von wger.de (CC-BY-SA) übernehmen. Bereits importierte Übungen werden übersprungen, mehrfaches Ausführen ist also unbedenklich.

## Versionierung & Update-Hinweis

Die Version steht an **genau einer Stelle**: `version` in `frontend/package.json` (Semantic Versioning – PATCH für Korrekturen, MINOR für neue Funktionen, MAJOR für große Umbauten).

- `vite.config.js` fügt sie als `__APP_VERSION__` ein; sie erscheint in der Dashboard-Fußzeile.
- Nach dem Build wird sie in `dist/sw.js` gestempelt und in `dist/version.json` geschrieben.
- Weil sich `sw.js` bei jeder Erhöhung ändert, erkennt der Browser einen neuen Service Worker. **Ohne neue Versionsnummer gibt es keinen Update-Hinweis.**
- Der neue Worker wartet; die App zeigt „Version X verfügbar – jetzt aktualisieren“. Neu geladen wird erst nach dem Klick, damit niemand mitten im Tippen etwas verliert.

`nginx.conf` muss `/sw.js` mit `no-store` ausliefern, sonst versteckt der Cache die Updates. Ein End-to-End-Test mit echtem Chromium liegt in `frontend/test/sw-update.test.mjs`.

## Sicherung

```bash
docker exec ironbandit-db pg_dump -U ironbandit ironbandit > backup_$(date +%Y%m%d).sql
cat backup_20260101.sql | docker exec -i ironbandit-db psql -U ironbandit -d ironbandit   # wiederherstellen
```

## Entwicklung ohne Docker

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://ironbandit:<passwort>@localhost:5432/ironbandit
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm ci
npm run dev   # http://localhost:5173, leitet /api an localhost:8000 weiter
```

Tests: `pip install -r backend/requirements-dev.txt && pytest backend/tests -q`

## Fehlersuche

- **Backend startet ständig neu** – `docker compose logs backend`; meist war Postgres noch nicht bereit oder `DATABASE_URL` stimmt nicht.
- **Login schlägt immer fehl** – `SECRET_KEY` / `REFRESH_SECRET_KEY` prüfen und das Backend nach Änderungen an `.env` neu starten.
- **Keine E-Mails** – normal, solange die `SMTP_*`-Felder leer sind.
- **Reverse Proxy erreicht die App nicht** – der Frontend-Port muss auf `0.0.0.0:80` veröffentlicht sein und die Firewall des Hosts den Proxy durchlassen.

## Änderungsprotokoll

Siehe [CHANGELOG.md](CHANGELOG.md).

## Lizenz

Copyright (C) 2026 CrashBandit82

IronBandit ist freie Software: Du darfst sie unter den Bedingungen der **GNU Affero General Public License v3.0** der Free Software Foundation weitergeben und verändern. Wer eine veränderte Version als Online-Dienst betreibt, muss den Nutzern den Quellcode zur Verfügung stellen. Der vollständige Text steht in [LICENSE](LICENSE) (rechtlich gilt die englische Fassung).
