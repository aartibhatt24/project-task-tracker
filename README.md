# Project & Task Tracker

A full-stack project/task tracking application: role-based (Manager/Member) projects, tasks
with a validated lifecycle, dependencies, multi-assignee support, immutable history and
comments, server-side search/filter/sort/pagination, bulk operations, CSV export, overdue
alerts, and dashboard analytics.

Built end to end against `PROJECT_SPEC.md`. See `docs/` for architecture, schema, the
implementation plan, engineering decisions (including a couple of genuine reversals), the
real AI prompts used during development, and the final requirement audit.

## Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + React Router + TanStack Query + Recharts
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite via Prisma ORM
- **Validation**: Zod (every request body/query/param)
- **Tests**: Vitest + Supertest (backend, 155 tests against a real database) + React Testing Library (frontend)

**Why SQLite instead of the spec's recommended PostgreSQL:** this was built in an
environment with no admin rights, no Docker, and no WSL — there was no way to install or run
a PostgreSQL server. The user was asked directly and chose SQLite via Prisma as the
pragmatic substitute; it's the same ORM, same schema/migration workflow, and every
aggregation/filter/pagination query still happens at the database layer. Full reasoning in
`docs/decisions.md` #1.

## Prerequisites

- Node.js 20+ (developed and tested against Node 22.14.0 / npm 10.9.2)
- No external database server required — SQLite is a local file.

## Setup (fresh clone)

```bash
# Backend
cd backend
npm install
cp .env.example .env          # defaults work as-is for local dev
npm run prisma:migrate        # creates backend/prisma/dev.db and applies migrations
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
| `npm test` | Vitest (155 tests, integration + unit) |
| `npm run prisma:migrate` | Apply/create migrations against `dev.db` |
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

- `DATABASE_URL` — SQLite file path (relative to `backend/prisma/`, see the comment in
  `.env.example` — Prisma resolves it relative to `schema.prisma`'s directory, not the cwd)
- `JWT_SECRET` — must be a long random string in production
- `CORS_ORIGIN` — the frontend's origin
- `COOKIE_SAME_SITE` — `lax` (default, for same-site deployments) or `none` (cross-domain
  frontend/API deployments — automatically forces `secure: true`, so both sides need HTTPS)

The frontend has one: `VITE_API_URL`, baked in at build time.

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
    integration/    Supertest against a real SQLite test database
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
also driven end to end with a real headless-Chromium browser (Playwright) — see
`docs/decisions.md` #15 for a real bug that browser testing caught and unit/typecheck could
not have. See `docs/plan.md` for the phase-by-phase breakdown and `docs/interview-notes.md`
for a grounded walkthrough of where each business rule actually lives in the code.
