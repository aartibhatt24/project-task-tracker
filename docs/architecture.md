# Architecture

## Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + React Router + TanStack Query.
- **Backend**: Node.js + Express + TypeScript.
- **Database**: SQLite via Prisma ORM (see "Database choice" below).
- **Validation**: Zod, on every request body/query/params.
- **Auth**: Session via signed httpOnly JWT cookie (no client-stored role).
- **Backend tests**: Vitest + Supertest, hitting a real (file-based, reset-per-suite) SQLite database — no mocking of the ORM.
- **Frontend tests**: Vitest + React Testing Library for key flows.
- **API style**: REST, JSON, consistent `{ error: { code, message } }` shape on failure.

## Database choice: SQLite instead of PostgreSQL

The spec recommends PostgreSQL. This build environment has no admin rights, no Docker,
no WSL, and no way to install/run a PostgreSQL server or service. Node.js itself had to be
installed as a portable, no-admin-required binary. Given that constraint, the user was asked
and chose SQLite through Prisma as the pragmatic substitute (documented in `docs/decisions.md`).

This is a deliberate, disclosed substitution, not a silent shortcut:
- Prisma is still the ORM, so schema, migrations, relations, and unique/foreign-key
  constraints are expressed identically to how they would be in Postgres.
- All aggregation queries required by the dashboard (goal 8) and all filtering/sorting/pagination
  queries (goal 6) are still done at the database layer via Prisma, never in application code
  over a fully-loaded table, so the "never load the entire dataset into the browser" and
  "aggregate server/database-side" rules are honored regardless of which SQL engine sits
  underneath.
- Switching the real deployment target to PostgreSQL later is a `datasource` provider change
  in `prisma/schema.prisma` plus re-running `prisma migrate`; no application code depends on
  SQLite-specific syntax.

## High-level layout

```
backend/
  src/
    app.ts              # express app wiring (no listen())
    server.ts            # process entrypoint, calls app.listen
    routes/               # thin: parse params, call controller
    controllers/          # HTTP <-> service glue, no business rules
    services/              # business rules (auth, projects, tasks, lifecycle, bulk, csv, dashboard, alerts)
    domain/                 # pure rule modules with no I/O (lifecycle transition table, dependency rules)
    repositories/            # Prisma queries, isolated so services don't import PrismaClient directly everywhere
    middleware/               # auth, requireRole, error handler, async wrapper
    validators/                # zod schemas per resource
    utils/
  prisma/
    schema.prisma
    seed.ts
  tests/
    integration/            # supertest, full HTTP stack against a real db
    unit/                    # domain/service unit tests (lifecycle, dependency rules)

frontend/
  src/
    pages/                  # one per route in section 6 of the spec
    components/
    layouts/
    hooks/
    services/                # fetch wrappers per resource, all querying goes through here
    types/
    lib/                      # api client, query client
```

## Where business rules live

All business rules (lifecycle legality, blocker-prevents-DONE, dependency validity,
assignment eligibility, membership cascade unassignment, alert dismissal versioning,
bulk per-task evaluation) live in `backend/src/domain` (pure, unit-testable, no I/O) and
`backend/src/services` (orchestration + I/O, calls domain for decisions). Controllers only
translate HTTP <-> service calls, and never re-implement or duplicate rule checks. Bulk
operations reuse the exact same service/domain functions as their single-task counterparts.

The frontend never enforces authorization or lifecycle legality as the source of truth. It
mirrors legal transitions to keep the UI clear (disable illegal buttons), but every mutation
is re-validated on the server.

## Auth model

Login issues a signed JWT (`{ userId, role }` — but the server always re-reads the user's
current role from the database on every request; the JWT is only used to identify *who*,
never to assert *what role they have*) stored in an httpOnly, sameSite=lax cookie. This
avoids trusting a client-supplied role, satisfying section 5 of the spec. `requireAuth`
middleware loads the user record fresh from the DB per request and attaches it to
`req.user`; `requireRole('MANAGER')` checks that freshly-loaded record.

## Authorization / IDOR prevention

Every project- or task-scoped route loads the resource, then checks membership/ownership
against `req.user.id` before returning or mutating anything — never trusts a project/task
id in the URL as sufficient on its own. Members only ever see projects they belong to and
tasks within those projects; this scope is applied at the query layer (an SQL `WHERE`
joined against `ProjectMember`), not filtered client-side after a broader fetch.

## Testing strategy

- Unit tests for the lifecycle domain module (every legal transition, representative
  illegal ones, blocker-prevents-DONE, unblock-restores-prior-state) with no DB.
- Integration tests (Supertest + real SQLite test DB, reset between test files) for every
  mandatory item in the spec's test matrix (auth, authorization, lifecycle over HTTP,
  assignment, querying, bulk, CSV, dashboard, history, alerts).
- Frontend RTL tests for a handful of high-value flows (login redirect, task status
  transition control, bulk selection).

## What was intentionally not built

- Cycle detection for dependencies (explicitly optional per spec) — rejected only for
  self-dependency and cross-project blockers, which are the mandatory checks.
- Real email/notification delivery for alerts — alerts are in-app only.
- WebSocket/live-update push — the app is request/response only.
- Multi-tenant/organization layer — single flat user/project/task space as specified.
