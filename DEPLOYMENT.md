# Socialposter production deploy

## Servers

| Host | URL | SSH |
|------|-----|-----|
| **Primary** | http://72.60.223.25:4600/ | `ssh root@72.60.223.25` |

Layout on the host:

| | |
|---|---|
| **Frontend path** | `/var/www/socialposter-frontend` |
| **Backend path** | `/var/www/socialposter-backend` |
| **API (NestJS)** | PM2 process `socialposter-api` → `dist/main.js`, listens on port **4601** |
| **Web (Next.js)** | PM2 process `socialposter-web` → `next start -p 4602` |
| **Public URL** | **:4600** only (**not** bare port 80 on the main IP) |
| **Port 80** | Do **not** serve Socialposter on the main IP. This app is isolated on **4600**. |
| **Web** | Nginx **:4600**: `/api/` and `/uploads/` → `http://127.0.0.1:4601`; all other paths → `http://127.0.0.1:4602` |
| **Nginx site** | `/etc/nginx/sites-available/socialposter` (symlink `sites-enabled/socialposter`) |

## Git remotes (on server)

- Frontend: `https://github.com/abdulkarimtaji33/socialposter-frontend.git` — branch `main`
- Backend: `https://github.com/abdulkarimtaji33/socialposter-backend.git` — branch `main`

Push from your machine first, then deploy on the server.

---

## Deploy frontend (after `git push` to `socialposter-frontend`)

```bash
ssh root@72.60.223.25
cd /var/www/socialposter-frontend
git pull origin main
npm ci   # or: npm install
npm run build
pm2 restart socialposter-web
pm2 list   # confirm socialposter-web online
```

Ensure `.env.local` on the server includes:

```bash
NEXT_PUBLIC_API_URL=http://72.60.223.25:4600/api
```

After changing nginx: `sudo nginx -t && sudo systemctl reload nginx`. Open firewall if needed: `sudo ufw allow 4600/tcp`.

---

## Deploy backend (after `git push` to `socialposter-backend`)

```bash
ssh root@72.60.223.25
cd /var/www/socialposter-backend
git pull origin main
npm ci   # or: npm install
npm run build
pm2 restart socialposter-api --update-env
pm2 list   # confirm socialposter-api online
```

**Schema:** TypeORM uses `synchronize: true` — there is no separate migration step. Restart the API after entity changes so the schema can update.

**Required server `.env` keys** (values live only on the VPS; see `.env.example` locally):

- `PORT=4601`
- `FRONTEND_ORIGIN=http://72.60.223.25:4600`
- `MYSQL_*` — MariaDB on `127.0.0.1:3306`, database `socialposter`
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`
- `APP_ACCESS_KEY` — set in production; frontend sends it as `x-access-key`
- Optional: `DAILY_POST_CRON`, `AUTO_PUBLISH_ON_GENERATE`

---

## Quick verify

```bash
nginx -t
pm2 show socialposter-api
pm2 show socialposter-web
curl -sI http://127.0.0.1:4600/ | head -5
curl -sI http://127.0.0.1:4601/api/business | head -5   # expect 401 without x-access-key
```

Use the browser at http://72.60.223.25:4600/ for end-to-end checks.

---

## Notes

- **Other PM2 apps** on the same host (clearearth, lunchboxai, zgames, etc.) — only restart `socialposter-api` / `socialposter-web` for Socialposter changes.
- Uploaded images are stored under `/var/www/socialposter-backend/uploads/` and served via nginx at `/uploads/`.
- Keep `.env` and `.env.local` only on the server; do not commit them.
