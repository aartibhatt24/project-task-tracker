# Submission summary

## What this is

A complete implementation of the Project & Task Tracker described in `PROJECT_SPEC.md`:
React + TypeScript + Vite frontend, Node + Express + TypeScript backend, Prisma ORM over
SQLite (substituted for the spec's recommended PostgreSQL — see below), all ten mandatory
goals implemented, tested, and verified against a running instance with real seeded data.

## Setup

See `README.md` for full instructions. Short version:

```bash
cd backend && npm install && cp .env.example .env && npm run prisma:migrate && npm run seed && npm run dev
cd frontend && npm install && cp .env.example .env && npm run dev
```

Then open http://localhost:5173 and sign in as `manager@example.com` / `Password123!` (or
`member1@example.com` / `Password123!`).

## The one deliberate substitution: SQLite instead of PostgreSQL

The build environment had no admin rights, no Docker, and no WSL — there was no way to
install or run a PostgreSQL server. Node.js itself wasn't present and had to be installed as
a portable, no-admin binary. The user was asked directly and chose SQLite via Prisma. This
is disclosed, not hidden: same ORM, same schema/migration workflow, same server-side
aggregation for every query the spec cares about. Full reasoning in `docs/decisions.md` #1
and `docs/architecture.md`.

## Ten-goal status

All ten mandatory goals are implemented, backend-enforced, and covered by automated tests.
See the detailed requirement-by-requirement audit table in `docs/interview-notes.md` and the
final adversarial audit results below. In short:

1. **Accounts and roles** — httpOnly JWT-cookie auth, role re-read from the database on
   every request (never trusted from an old token), manager/member enforced server-side.
2. **Projects** — create/edit/archive/restore (manager-only), archive is soft and preserves
   all data, unique keys.
3. **Tasks** — full CRUD, scoped to project membership, manager-only create/edit/delete per
   a documented reading of section 1.1.
4. **Lifecycle** — centralized domain rule table (`backend/src/domain/lifecycle.ts`), every
   transition from the spec implemented exactly, blocker-prevents-DONE, exact-state unblock
   restoration, DONE reopens to IN_REVIEW.
5. **Assignment** — many-to-many, eligibility restricted to current project members,
   removing a member atomically unassigns them from every task in that project (one Prisma
   transaction) with history written per affected task.
6. **Finding things** — server-side search/filter/sort/pagination on `GET /api/tasks`, never
   loads the full table into the browser, authorization scope applied inside the query.
7. **Bulk + CSV** — bulk status/assignee/due-date changes evaluate each task independently
   (reusing the exact same domain-backed logic as single-task endpoints) with per-task
   success/failure reasons; CSV export reuses the same filtered/sorted query, unpaginated.
8. **Dashboard** — headline metrics, status/assignee breakdowns, 8-week completion trend,
   all aggregated server/database-side and scoped by visibility.
9. **History** — append-only `TaskHistory`, written inside the same transaction as every
   mutation, no update/delete route exists anywhere for it (proven by a test that PATCH/PUT/
   DELETE against a history entry 404, including as a manager).
10. **Alerts** — overdue = past due date and not DONE, dismissal snapshots the due date so a
    later due-date change makes the alert reappear automatically, only an assigned user can
    dismiss.

## Testing

- **155 backend tests** (Vitest + Supertest) against a real SQLite test database — no ORM
  mocking. Covers every item in the spec's mandatory test matrix (section 9): auth,
  authorization/IDOR, lifecycle (every legal/illegal transition, blocker, unblock, reopen),
  assignment, querying (search/every filter/sort/pagination/scope), bulk (mixed
  success/failure with per-task reasons), CSV (filters respected), dashboard (checked
  against direct database queries, not just "looks plausible"), history (immutability
  proven, not assumed), alerts (the full dismiss/due-date-change/reappear lifecycle).
- **4 frontend tests** (React Testing Library) covering the auth/redirect flow.
- **A real headless-Chromium walkthrough** (Playwright) driving the actual running app —
  manager login through every page, a live status transition, filters/pagination/CSV link,
  alerts, sign-out, member login with role-scoped UI confirmed. This caught a real bug (a
  post-login navigation race — see `docs/decisions.md` #15) that no static check would have.

## Documentation

- `docs/architecture.md` — stack, structure, where business rules live, auth model, IDOR
  prevention, what was intentionally not built.
- `docs/schema.md` — every entity, field, relationship, and constraint, and which layer
  (database vs. application) enforces what.
- `docs/plan.md` — the phase-by-phase implementation plan, written before implementation and
  not edited retroactively to look more prescient.
- `docs/decisions.md` — 17 genuine engineering decisions in the order they came up,
  including two real reversals (a `DATABASE_URL` path bug, and the login-redirect race
  condition + its follow-up UX reversal).
- `docs/ai-prompts.md` — the actual driving prompt and three concrete cases of incorrect AI
  output found and corrected during this session, with how each was found.
- `docs/interview-notes.md` — grounded answers to the interview-readiness questions, with
  file/line references into the actual code.

## What was intentionally not built

- Cycle detection for task dependencies (spec marks this optional).
- Real email/push notifications for alerts (in-app only).
- WebSocket/live updates (the alert badge polls every 60s instead).
- A multi-tenant/organization layer (single flat space, as specified).

No deployment claim is made — this was built and verified locally (dev servers + production
builds run and smoke-tested), not deployed to a live host. `README.md` documents exact setup
and deployment-relevant env vars (`COOKIE_SAME_SITE` in particular, for a frontend/API
split across different domains).
