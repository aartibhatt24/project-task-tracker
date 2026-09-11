# Project & Task Tracker

A full-stack project/task tracking application: role-based (Manager/Member) projects, tasks
with a validated lifecycle, dependencies, multi-assignee support, immutable history and
comments, server-side search/filter/sort/pagination, bulk operations, CSV export, overdue
alerts, and dashboard analytics.

## Live deployment

| | |
|---|---|
| **App** | **https://project-task-tracker-sage.vercel.app** |
| **API** | https://project-task-tracker-xeim.onrender.com |
| **Repo** | https://github.com/aartibhatt24/project-task-tracker |

Demo accounts (password `Password123!` for all):

| Role | Email |
|---|---|
| Manager | `manager@example.com` |
| Member | `member1@example.com` (also `member2` … `member7`) |

> The API runs on Render's free tier, which spins the service down after 15 minutes of no
> traffic. If the app has been idle, the *first* request can take 30-60 seconds while it
> wakes back up — that's expected, not a bug.

Built end to end against `PROJECT_SPEC.md`. See `docs/` for architecture, schema, the
implementation plan, engineering decisions (including several genuine reversals), the real
AI prompts used during development, and the final requirement audit.

## Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + React Router + TanStack Query + Recharts — deployed on **Vercel**
- **Backend**: Node.js + Express + TypeScript — deployed on **Render**
- **Database**: PostgreSQL via Prisma ORM — hosted free on **Neon**
- **Validation**: Zod (every request body/query/param)
- **Tests**: Vitest + Supertest (backend, 156 tests against a real database) + React Testing Library (frontend)

**Why Neon Postgres instead of a locally-installed PostgreSQL:** this was built in an
environment with no admin rights, no Docker, and no WSL — there was no way to install or run
a *local* PostgreSQL server. SQLite was used as a stopgap during initial development
(`docs/decisions.md` #1), then the project switched to a real, hosted PostgreSQL (Neon) once
a live deployment was needed — a hosted database needs no local install at all, which
resolved the original constraint directly rather than working around it a second time. Full
reasoning in `docs/decisions.md` #1 and #18.

## Prerequisites

- Node.js 20+ (developed and tested against Node 22.14.0 / npm 10.9.2)
- A PostgreSQL database reachable over the network. A free one at
  [neon.tech](https://neon.tech) takes about two minutes to set up and needs no local
  install — that's what this project itself uses in both development and production.

## Setup (fresh clone)

```bash
# Backend
cd backend
npm install
cp .env.example .env          # then set DATABASE_URL to your own Postgres connection string
npm run prisma:migrate        # applies migrations to your database
npm run seed                  # seeds realistic demo data (idempotent — safe to rerun)
npm run dev                   # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env          # defaults to http://localhost:4000/api
npm run dev                   # http://localhost:5173
```

Open http://localhost:5173 and sign in with one of the demo accounts below.

## Demo credentials

All seeded accounts use the password `Password123!`.

| Role    | Email                  |
|---------|-------------------------|
| Manager | manager@example.com     |
| Member  | member1@example.com     |
| Member  | member2@example.com … member7@example.com |

The seed creates 8 users, 8 projects (one archived), 87 tasks spanning every status and
priority, overdue and due-soon tasks, multi-assignee tasks, same-project dependencies, and
286 history entries — enough for the dashboard and every filter to show real, non-trivial
data immediately.

## Scripts

### Backend (`backend/`)

| Script | Purpose |
|---|---|
| `npm run dev` | Start the API with hot reload |
| `npm run build` | Compile to `dist/` (production) |
| `npm start` | Run the compiled build (`dist/server.js`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Vitest (156 tests, integration + unit — needs `DATABASE_URL` to point at a real reachable Postgres database; see `backend/.env.test`) |
| `npm run prisma:migrate` | Apply/create migrations against your database |
| `npm run prisma:deploy` | Apply existing migrations without prompting (CI/production) |
| `npm run seed` | Reset and reseed demo data |

### Frontend (`frontend/`)

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | oxlint |
| `npm test` | Vitest + React Testing Library |

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full, commented list. The
backend ones that matter for a real deployment:

- `DATABASE_URL` — PostgreSQL connection string (a free [Neon](https://neon.tech) database
  works well; use the plain, non-pooled connection string from its dashboard)
- `JWT_SECRET` — must be a long random string in production
- `CORS_ORIGIN` — the frontend's origin (e.g. your Vercel URL)
- `COOKIE_SAME_SITE` — `lax` (default, for same-site deployments) or `none` (needed when the
  frontend and API are on different domains, as in this project's own Vercel + Render setup —
  automatically forces `secure: true`, so both sides must be served over HTTPS)

The frontend has one: `VITE_API_URL`, baked in at build time (set to the deployed API's
`/api` path on Vercel).

## Deploying your own copy

This is exactly how the live deployment above was set up, using only free tiers with no
credit card required:

1. **Database** — create a free project at [neon.tech](https://neon.tech), copy its
   connection string into `DATABASE_URL`.
2. **Backend** — on [render.com](https://render.com), create a **Web Service** from this
   repo with root directory `backend`, build command
   `npm install --include=dev && npm run build && npx prisma migrate deploy`, start command
   `npm start`, and the environment variables listed above (`NODE_ENV=production`,
   `COOKIE_SAME_SITE=none`). The `--include=dev` flag matters: Render sets `NODE_ENV` during
   the build step too, and plain `npm install` skips devDependencies (including TypeScript
   itself) whenever `NODE_ENV=production` is set.
3. **Frontend** — on [vercel.com](https://vercel.com), import this repo with root directory
   `frontend` and set `VITE_API_URL` to your Render URL + `/api`.
4. Update the backend's `CORS_ORIGIN` to your real Vercel URL once you have it, and redeploy.

## Project structure

```
backend/
  src/
    routes/        thin: parse params, call controller
    controllers/    HTTP <-> service glue
    services/       business rules + Prisma queries
    domain/         pure rule modules, no I/O (lifecycle, dependencies, assignment diff)
    middleware/      auth, requireRole, error handler
    validators/       Zod schemas per resource
  prisma/
    schema.prisma
    seed.ts
  tests/
    integration/    Supertest against a real Postgres test database
    unit/           domain-only, no I/O

frontend/
  src/
    pages/          one per route
    components/      shared UI (badges, tables, dialogs, states)
    layouts/          app shell (sidebar, alert badge)
    hooks/            useAuth
    services/          one API client module per resource
    types/

docs/
  architecture.md, schema.md, plan.md, decisions.md, ai-prompts.md, interview-notes.md
```

## What was intentionally not built

- **Cycle detection for task dependencies** — the spec marks this optional; only the two
  mandatory checks (no self-dependency, blocker must share a project) are enforced.
  (`docs/decisions.md` #4)
- **Real email/push notifications for alerts** — in-app only.
- **WebSocket/live updates** — request/response only; the alert badge polls every 60s.
- **Multi-tenant/organization layer** — a single flat user/project/task space, as specified.

## Verification

Every implementation phase in this project's git history was verified before moving on:
typecheck, lint, the phase's automated tests, and a direct HTTP smoke test against the
running dev server with real seeded data (not just "the tests pass"). The full frontend was
also driven end to end with a real headless-Chromium browser (Playwright) — both locally
during development and again against the actual live deployment above, which caught a real
TypeScript build-config bug and a Render devDependencies gotcha that only showed up once
deployed. See `docs/decisions.md` for the full list of real issues found and fixed this way,
`docs/plan.md` for the phase-by-phase breakdown, and `docs/interview-notes.md` for a
grounded walkthrough of where each business rule actually lives in the code.
