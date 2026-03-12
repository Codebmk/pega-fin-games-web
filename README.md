# Crash Game MVP

Monorepo with Fastify backend and React frontend.

## Structure
- apps/server
- apps/web
- packages/shared
- db/migrations

## Dev
1. Copy `.env.example` to `.env` and set values.
2. Install deps: `npm install`
3. Run: `npm run dev`

## Run With Docker
1. Install Docker Desktop (Windows/Mac) or Docker Engine (Linux).
2. Copy `.env.example` to `.env` and set Supabase values:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `SUPABASE_STORAGE_BUCKET`
3. Start all services:
   - `docker compose up --build`
4. Access services:
   - Web: `http://localhost:5173`
   - API: `http://localhost:4000/health`
   - Postgres: `localhost:5432`
   - Redis: `localhost:6379`

### Notes
- Docker runs Postgres + Redis locally and the app containers.
- You can stop with `Ctrl+C` and remove containers with `docker compose down`.

## Supabase Migrations (CLI)
We keep SQL migrations in `db/migrations`. Supabase CLI expects them in `supabase/migrations`.

1. Install the Supabase CLI and login:
   - `npx supabase login`
2. Initialize Supabase config in this repo:
   - `npx supabase init`
3. Link your Supabase project:
   - `npx supabase link --project-ref <your-project-ref>`
4. Copy migration files:
   - Create `supabase/migrations` and copy files from `db/migrations` into it.
5. Push migrations to Supabase:
   - `npx supabase db push`

To confirm you're linked to the correct project, use:
- `npx supabase status`

## Infrastructure Notes
- Recommended DB: Supabase Postgres (or Render Postgres).
- KYC images: Supabase Storage bucket (set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET`).
