# Interview / readiness notes

Grounded in the actual code as it exists at the end of this build, not aspirational. File
paths are relative to the repo root.

## 1. Why this architecture?

A conventional three-layer backend (`routes` -> `controllers` -> `services`, with a
separate `domain` layer for pure business rules) and a page-per-route React frontend backed
by TanStack Query. Nothing exotic, because nothing about this problem calls for it — the
hard parts are business-rule correctness (lifecycle, dependencies, authorization) and
query-shape correctness (scoped, paginated, aggregated), not architectural novelty. Keeping
controllers thin (`backend/src/controllers/*.ts` are ~5-15 lines each: parse, call service,
respond) means the same rule-checking code is what both the HTTP layer and the tests
exercise — there's nowhere for a controller to accidentally reimplement or slightly diverge
from a rule.

## 2. Why this database schema?

Eight tables, one per spec-defined entity (`backend/prisma/schema.prisma`), with join tables
(`ProjectMember`, `TaskAssignee`, `TaskDependency`) modeling every many-to-many relationship
explicitly rather than as loose arrays, so the database itself enforces uniqueness (e.g.
`@@unique([taskId, userId])` on `TaskAssignee`) and referential integrity via foreign keys.
`TaskHistory` is a single append-only table with a `type` discriminator rather than separate
tables per event type, because every event type shares the same shape (actor, timestamp,
optional field/old/new, optional metadata) and a unified timeline query
(`historyService.listTaskHistory`) is simpler than a UNION across tables. The one
non-obvious column is `Task.priorityRank` (`docs/decisions.md` #14) — a denormalized integer
kept in sync with the `priority` string, purely so "sort by priority" reflects severity
order instead of SQLite sorting the string alphabetically.

## 3. Where are business rules enforced?

Exclusively in `backend/src/domain/` (pure, I/O-free, unit-tested directly) and
`backend/src/services/` (orchestration + Prisma calls, which call `domain/` for any
yes/no rule decision). Concretely:
- Lifecycle legality: `domain/lifecycle.ts` (`validateTransition`), called by
  `services/lifecycleService.ts`.
- Dependency validity: `domain/dependencies.ts` (`validateDependency`), called by
  `services/dependencyService.ts`.
- Assignment diffing: `domain/assignment.ts` (`computeAssigneeDiff`), called by
  `services/assignmentService.ts`.

Controllers never contain an `if` that decides whether an action is legal — they parse,
delegate, and translate the result to HTTP. The frontend mirrors legal transitions for UX
(`frontend/src/utils/lifecycle.ts` disables illegal status buttons) but that file has a
comment stating explicitly it is not the source of truth, and every mutation still goes
through the real API, which re-validates regardless of what the UI allowed the user to
click.

## 4. How does authorization prevent IDOR?

Every project- or task-scoped read/write loads the resource by id, then checks the
requesting user's membership/role against it *before* returning or mutating anything —
`services/projectService.ts:assertProjectVisible` and
`services/taskService.ts:assertTaskAccessible` are the two chokepoints almost everything
else calls through. A member who isn't on a project gets 403 (not silently empty or 404 —
see `docs/decisions.md` #11 for why 403 was chosen over 404), and this is asserted with
actual HTTP status code checks in tests (e.g. `tests/integration/projects.test.ts`: "a
member cannot retrieve a project they do not belong to (IDOR)"), not inferred from the UI
hiding a link. List/search/dashboard/CSV queries apply the same scope *inside the SQL where
clause* (`services/taskQueryService.ts:buildTaskWhere`), not by fetching broadly and
filtering afterward.

## 5. How does blocked-state restoration work?

`Task.blockedFromStatus` stores the exact status the task was in the instant it entered
BLOCKED. `domain/lifecycle.ts:validateTransition` only allows leaving BLOCKED if the target
equals that stored value, and clears it back to `null` on the way out. This is why
`IN_PROGRESS -> BLOCKED -> IN_PROGRESS` and `IN_REVIEW -> BLOCKED -> IN_REVIEW` are legal
but `IN_PROGRESS -> BLOCKED -> IN_REVIEW` is rejected — the column remembers precisely one
prior state, per the spec's "remembers the state from which it was blocked" (section 1.5).
Covered directly in `tests/unit/lifecycle.test.ts` and end-to-end in
`tests/integration/lifecycle.test.ts`.

## 6. How does the blocker rule work?

A task can only reach DONE via `IN_REVIEW -> DONE`. `domain/lifecycle.ts:requiresBlockerCheck`
flags DONE as the one target needing an extra check; `services/lifecycleService.ts:applyStatusChange`
then queries `TaskDependency` rows where this task is `blockedTaskId`, and if any blocker's
`status !== 'DONE'`, throws `INVALID_STATUS_TRANSITION` before touching the database. This
runs identically whether the change comes from the single-task endpoint or a bulk operation,
because bulk calls the exact same `applyStatusChange` function (see question 7).

## 7. Why are bulk operations partial-success?

Because the spec says so explicitly (section 1.8: "Each selected task is evaluated
independently") and because forcing all-or-nothing semantics onto a batch of otherwise
unrelated tasks would mean one member's typo or one task's blocked state could block
everyone else's legitimate bulk update. `services/bulkService.ts` loops over task ids, and
each task's full set of requested changes (status/assignees/due date) runs inside its own
`prisma.$transaction` calling the same `apply*` functions the single-task endpoints use — a
failure there is caught, recorded as `{taskId, code, reason}`, and the loop continues.
Verified with the exact scenario from the spec's prompt pack: a four-task batch where two
succeed and two fail for different reasons, with the successes' database changes and the
failures' *absence* of any change both asserted directly against the database, not just the
HTTP response (`tests/integration/bulk.test.ts`).

## 8. How does CSV export respect filters?

`services/csvExportService.ts:generateTaskCsv` calls the exact same
`buildTaskWhere`/`buildTaskOrderBy` from `taskQueryService.ts` that the paginated list
endpoint uses, just without `skip`/`take` — so a filtered export can never structurally
diverge from what the equivalent (unpaginated) list query would return. It's one backend
query producing the whole filtered/sorted result, not a frontend concatenation of loaded
pages. Verified by a test that creates 45 tasks (more than the list endpoint's own default
page size of 20) and asserts the CSV contains all 45 rows.

## 9. Why is history immutable?

Because an audit trail that can be edited isn't an audit trail — the spec requires it
(section 1.11) and the mandatory test matrix explicitly checks that no update/delete path
exists. The implementation is immutability-by-omission: there is no
`PATCH`/`PUT`/`DELETE /api/tasks/:id/history/:entryId` route anywhere in
`backend/src/routes/`, for any role, so there's no code path to bypass — not a soft
`isDeleted` flag or a permission check that a bug could get wrong. Every mutating service
(`taskService`, `lifecycleService`, `assignmentService`, `projectService`'s member-removal
cascade) writes its history row(s) inside the same Prisma transaction as the mutation
itself, so a change and its history entry are atomically linked. Proven in
`tests/integration/history.test.ts` by literally sending PATCH/PUT/DELETE requests at a
history entry (including as a manager) and asserting 404 plus an unchanged row in the
database, not just by the route's absence being "obvious from reading the code."

## 10. How does alert dismissal reappear after due-date change?

`AlertDismissal.dismissedDueDate` snapshots the task's `dueDate` at the moment of dismissal
(`services/alertService.ts:dismissAlert`). The alerts query
(`overdueAssignedTasksWithDismissals` + `isSuppressed`) compares that snapshot against the
task's *current* `dueDate`; if they differ — because the due date changed since the
dismissal — the alert is no longer suppressed and reappears, with no separate "un-dismiss"
action needed anywhere. Verified end to end in `tests/integration/alerts.test.ts` with the
exact scenario the spec describes: overdue task appears, gets dismissed, due date changes,
alert reappears.

## 11. What would break first at 100x data?

Almost certainly the CSV export and the completions-trend dashboard query. CSV export
(`csvExportService.ts`) does one unpaginated `findMany` — fine at seed-data scale (dozens to
low hundreds of rows) but would need streaming (write rows as they're fetched, e.g. cursor-
paginated batches piped to the response) once task counts get into the tens of thousands.
The completions trend (`dashboardService.ts:getCompletionsTrend`) fetches all DONE tasks
from the last 8 weeks and buckets them in application code because SQLite has no portable
date-truncation function — that's bounded by *recent completions*, not total task count, so
it scales with weekly throughput rather than table size, but a high-throughput team would
still eventually want this as a real `GROUP BY date_trunc('week', ...)` query, which
requires the PostgreSQL migration this project already anticipates (see `docs/decisions.md`
#1 and #14). The alerts query has a similar bounded-by-assignment shape and would scale
fine. The paginated task list and dashboard counts are already proper indexed/aggregated
queries (`schema.prisma`'s `@@index` list on `Task`) and should hold up well.

## 12. What did you intentionally not build?

Cycle detection for task dependencies (spec marks it optional and lower-priority than the
ten mandatory goals — `docs/decisions.md` #4), real email/push notifications for alerts
(in-app only), WebSocket/live updates (the alert badge polls on a 60s interval instead), and
any multi-tenant/organization boundary beyond the flat user/project/task model the spec
describes. All are listed in `README.md` and `docs/architecture.md` so they read as
scope decisions, not gaps discovered late.

## 13. Which decision did you reverse and why?

Two real ones, both in `docs/decisions.md`. The clearer one (#15): the login page originally
tried to return a user to whatever page they were on before being redirected to `/login`,
using React Router location state. A full Playwright browser walkthrough (not a unit test)
caught that this produced a race between two different navigation targets, and — after
fixing the immediate race — the agent judged that "resume the previous session's last page"
was actually the wrong UX for this app's realistic usage (one shared browser, a manager and
several member demo accounts signing in and out), and reversed course to always land on the
dashboard after login. The other (#9) was a straightforward bug-and-fix: an incorrect
assumption about how Prisma resolves relative SQLite file paths, caught immediately when the
first migration created a nested directory instead of the intended one.

## 14. Where did AI produce incorrect code?

Documented in full in `docs/ai-prompts.md`, with how each was found: the `DATABASE_URL`
relative-path bug, the login-redirect race condition, and a production build misconfiguration
where the compiled server entrypoint (`dist/src/server.js`) didn't match what
`package.json`'s `start` script expected (`dist/server.js`) — caught only because the agent
actually ran `npm run build && npm start` during the production-readiness pass instead of
treating a clean compiler exit as sufficient proof.

## 15. What would you improve with another 12 hours?

In rough priority order: (1) cycle detection for dependencies, since it's the one
mandatory-adjacent piece explicitly deferred; (2) streaming CSV export for large datasets;
(3) a proper PostgreSQL deployment target with a real `date_trunc`-based completions query,
now that the SQLite constraint that shaped `dashboardService.ts` wouldn't apply; (4) more
frontend RTL coverage for the task-detail lifecycle controls and the bulk-selection flow
specifically (currently covered by the Playwright walkthrough and backend tests, but not by
component-level RTL tests); (5) rate limiting on the auth endpoints, which the spec doesn't
require but any real deployment would want.
