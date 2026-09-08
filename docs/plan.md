# Implementation plan

**Status: all 21 phases below were completed and verified.** Final state: 156 backend
tests (Vitest + Supertest against a real SQLite database), 4 frontend tests (React Testing
Library), a full nine-page frontend verified with a real headless-Chromium walkthrough
(Playwright), both production builds passing, and the final requirement audit in
`docs/final-audit.md` showing all ten mandatory goals DONE.

## Phases (executed in this order, each verified before moving on)

1. Docs skeleton (this phase) — architecture, schema, plan, decisions.
2. Project foundation: backend (Express+TS) and frontend (React+TS+Vite+Tailwind) scaffolds,
   health endpoint, error-handling middleware, env handling, lint/format/typecheck scripts.
3. Prisma schema (all 8 entities) + migration + seed script with realistic data.
4. Auth: password hashing (bcrypt), login/logout/me, JWT cookie session, `requireAuth` and
   `requireRole` middleware, protected frontend routing.
5. Projects + membership: CRUD, archive/restore, add/remove member (transactional cascade
   unassignment).
6. Task CRUD: create/read/update/delete scoped to project membership, initial history entry.
7. Lifecycle domain service: centralized transition table, blocker-prevents-DONE, unit tests.
8. Dependencies + assignments: validation rules, history entries, member-removal cascade
   re-verified against tasks.
9. Global task list: search/filter/sort/paginate, all server-side, with authorization scope
   applied at the query layer.
10. Bulk operations: per-task evaluation reusing the same services as single-task endpoints,
    partial-success response shape.
11. CSV export: backend-generated from the same filtered query as the task list.
12. Immutable history + comments: append-only writes from every mutating service call.
13. Overdue alerts: query + dismiss with due-date-snapshot versioning + badge count.
14. Dashboard analytics: server-side aggregation for headline metrics, breakdowns, 8-week
    completion trend.
15. Frontend pages: Login, Dashboard, Projects, Project detail, Task detail, All Tasks,
    My Tasks, Alerts, Project/member management — wired to the real API, no client-side
    business rule enforcement as source of truth.
16. UI polish: loading/empty/error states, toasts, confirmation dialogs, responsive layout,
    role-aware controls.
17. Comprehensive test pass against the full mandatory test matrix (spec section 9).
18. Documentation pass (this file, decisions, ai-prompts, README, SUBMISSION).
19. Production-readiness pass: env var audit, CORS, build verification, no secrets committed.
20. Adversarial self-audit against the spec, fix high/critical findings, final 10-goal table.
21. Interview-readiness notes grounded in the actual code.

## Testing strategy

- Backend: Vitest + Supertest against a real SQLite test database (migrated fresh, reset
  between test files), no ORM mocking. Domain unit tests for lifecycle/dependency rules run
  with zero I/O.
- Frontend: Vitest + React Testing Library for a focused set of behaviorally important flows.
- Every phase in the list above ends with: typecheck, lint, relevant test run, and where
  applicable a direct API smoke check (curl/HTTP) before moving to the next phase.

## Risks identified up front

- **No PostgreSQL available in this environment** (no admin rights, no Docker, no WSL) —
  mitigated by using SQLite through Prisma; see `docs/decisions.md`.
- **Blocked-state restoration correctness** — `blockedFromStatus` must be set exactly once
  when transitioning into BLOCKED and cleared on the way out; covered by dedicated unit
  tests for both `IN_PROGRESS -> BLOCKED -> IN_PROGRESS` and `IN_REVIEW -> BLOCKED -> IN_REVIEW`.
- **Bulk partial failure must not partially apply a single task's change** — each task's
  change is applied in its own transaction; a failure on task A must not roll back or affect
  task B.
- **Alert dismissal versioning** — must snapshot `dueDate` at dismissal time and compare on
  read, not just store a boolean dismissed flag.
- **N+1 queries in dashboard/list endpoints** — use Prisma `groupBy`/aggregate queries and
  `include` rather than per-row follow-up queries.
- **IDOR** — every task/project fetch must filter by the requesting user's membership at the
  query level, not fetch-then-filter in application code, and not fetch-then-check-and-401
  only after the data already left the database (both are acceptable, but the tests must
  prove a 403/404 is actually returned, not just that the UI hides a link).

## Decisions still open at plan time

Captured with resolutions in `docs/decisions.md` as they were actually made during
implementation (this file is not updated retroactively to look more prescient than it was):
- Database engine (Postgres vs. SQLite) given environment constraints.
- Auth transport (JWT cookie vs. server session store).
- Reopen-from-DONE target state (spec explicitly says `DONE -> IN_REVIEW` as chosen default;
  implemented as-is).
- CSV library vs. hand-rolled generation.
- Whether to build cycle detection for dependencies (spec marks it optional; decision below).
