<p align="right"><b>English</b> · <a href="README.de.md">Deutsch</a></p>

<p align="center"><img src="frontend/public/icon-192.png" width="96" alt="IronBandit"></p>

<h1 align="center">IronBandit</h1>

<p align="center">
  Free digital workout log for strength training – installable as a PWA.<br>
  Live at <a href="https://ironbandit.at">ironbandit.at</a>
</p>

---

## Features

- **Own exercises & training plans** – build plans like "Push Day", share them, import/export as CSV
- **Set by set** – log weight and reps live in the gym, swipe to the next exercise, screen stays awake
- **Rest timer** – optional notification when the rest is over (also on a paired smartwatch)
- **Progress** – history, personal records, charts, weekly overview and a hint when an exercise stalls
- **Body-weight tracker** right next to your training
- **Workout duration** – a running clock during training, stored per session
- **Notes per exercise** that stay with the exercise across workouts
- **Accounts** – soft e-mail verification, password reset, avatar, CSV export of your own data
- **Admin panel** – users, broadcast e-mail, inactivity reminders, exercise import from wger.de
- **PWA** with update banner, German & English, light & dark theme

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS, i18next, Service Worker |
| Backend | Python, FastAPI, SQLAlchemy |
| Database | PostgreSQL 16 |
| Deployment | Docker Compose (frontend container with nginx, backend, database) behind an external reverse proxy for TLS |

## Quick start

```bash
cp .env.example .env      # then fill in the values
docker compose up -d --build
```

The app listens on port 80 of the host. The container's own nginx does **not** handle TLS – put a reverse proxy (e.g. Nginx Proxy Manager) with a certificate in front.

- App: `http://<host>/`
- API docs: `http://<host>/api/docs`
- Health check: `http://<host>/api/health`

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | database |
| `SECRET_KEY`, `REFRESH_SECRET_KEY` | JWT signing keys – long random values, never reuse across apps |
| `ALLOWED_ORIGINS` | comma-separated origins allowed to call the API |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | e-mail for verification and password reset |
| `SMTP_FROM_ADDRESS` | visible sender address, separate from the SMTP login |
| `NOTIFY_EMAIL` | receives new-registration and feedback notifications |

The SMTP fields may stay empty: registration and login always work, only the e-mails are skipped. Verification is **soft** – an unverified account is fully usable and sees a banner with a resend button. After changing `.env` run `docker compose up -d backend`.

## Making a user admin

There is no self-service admin signup. Register a normal account, then:

```bash
docker exec -it ironbandit-db psql -U ironbandit -d ironbandit \
  -c "UPDATE users SET is_admin = true WHERE email = 'you@example.com';"
```

## Importing exercises from wger.de

About 21 exercises are seeded. In the admin panel's "Import" tab you can pull in the public wger.de exercise database (CC-BY-SA). Already imported exercises are skipped, so it is safe to run more than once.

## Versioning & update banner

The version lives in **one place**: `version` in `frontend/package.json` (semantic versioning – PATCH for fixes, MINOR for features, MAJOR for big structural changes).

- `vite.config.js` injects it as `__APP_VERSION__`; it is shown in the dashboard footer.
- After the build it is stamped into `dist/sw.js` and written to `dist/version.json`.
- Because `sw.js` changes with every bump, browsers detect a new service worker. **Without a version bump there is no update banner.**
- The new worker waits; the app shows "Version X available – update now". It only reloads after the click, so nobody loses an input mid-typing.

`nginx.conf` must serve `/sw.js` with `no-store`, otherwise caching would hide updates. An end-to-end test with real Chromium lives in `frontend/test/sw-update.test.mjs`.

## Backups

```bash
docker exec ironbandit-db pg_dump -U ironbandit ironbandit > backup_$(date +%Y%m%d).sql
cat backup_20260101.sql | docker exec -i ironbandit-db psql -U ironbandit -d ironbandit   # restore
```

## Development without Docker

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://ironbandit:<password>@localhost:5432/ironbandit
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm ci
npm run dev   # http://localhost:5173, proxies /api to localhost:8000
```

Tests: `pip install -r backend/requirements-dev.txt && pytest backend/tests -q`

## Troubleshooting

- **Backend restarts in a loop** – `docker compose logs backend`; usually Postgres was not ready yet or `DATABASE_URL` is wrong.
- **Login always fails** – check `SECRET_KEY` / `REFRESH_SECRET_KEY` and restart the backend after editing `.env`.
- **No e-mails** – expected until the `SMTP_*` fields are filled in.
- **Reverse proxy can't reach the app** – the frontend port must be published on `0.0.0.0:80` and the host firewall must allow the proxy.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) (German).

## License

Copyright (C) 2026 CrashBandit82

IronBandit is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License v3.0** as published by the Free Software Foundation. If you run a modified version as a network service, you must make its source code available to its users. See [LICENSE](LICENSE) for the full text.
