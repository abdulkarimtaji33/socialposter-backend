# SocialPoster Backend

NestJS + TypeORM + MySQL API that generates a daily AI marketing image + LinkedIn
caption from your business details (via OpenAI) and publishes it to LinkedIn.

## Setup

1. Copy `.env.example` to `.env` and fill in values (MySQL, OpenAI, LinkedIn app
   credentials).
2. Create the MySQL database (matches `MYSQL_DATABASE` in `.env`):
   ```sql
   CREATE DATABASE socialposter CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Install dependencies and run:
   ```bash
   npm install
   npm run start:dev
   ```

The API listens on `PORT` (default `4200`) under the `/api` prefix. Generated
images are served statically from `/uploads`.

## LinkedIn app setup

Create an app at https://www.linkedin.com/developers/apps with the "Sign In
with LinkedIn using OpenID Connect" and "Share on LinkedIn" products enabled,
then set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and
`LINKEDIN_REDIRECT_URI` (must match a redirect URL configured on the app).

## Key endpoints

- `GET /api/business` / `PUT /api/business` — business profile
- `POST /api/posts/generate` — generate a new image + caption (can take ~1-2 min)
- `GET /api/posts` — list generated posts
- `POST /api/posts/:id/publish` — publish a post to LinkedIn
- `GET /api/linkedin/auth-url`, `GET /api/linkedin/callback`, `GET /api/linkedin/status`

A daily cron job (`DAILY_POST_CRON`, default `0 8 * * *`) automatically
generates a post; set `AUTO_PUBLISH_ON_GENERATE=true` and enable
`autoPublish` on the business profile to also auto-publish it.
