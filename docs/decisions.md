# Engineering decisions log

Real decisions made during this build, in the order they came up. Updated as implementation
proceeds — not written retroactively.

## 1. Database engine: SQLite instead of PostgreSQL

**Context**: The spec recommends PostgreSQL. The build environment has no admin rights
(UAC prompts can't be approved non-interactively), no Docker, no WSL, and no existing
PostgreSQL install or service. Node.js itself was not present and had to be installed as a
portable no-admin binary plus PATH shims.

**Options considered**: (a) portable/no-installer PostgreSQL zip build run as a plain user
process, (b) ask the user to install PostgreSQL/Docker themselves and pause, (c) SQLite via
Prisma.

**Decision**: Asked the user directly; they chose (c), SQLite via Prisma. It keeps the same
ORM, schema modeling, and migration workflow, requires no admin rights or service
management, and is fully sufficient to prove out every business rule and query pattern the
spec cares about (aggregation stays server/DB-side either way). Documented as a disclosed
substitution in `docs/architecture.md`, not silently swapped.

**Status**: Standing.

## 2. Auth transport: httpOnly JWT cookie, not a client-stored token

**Context**: Section 5 of the spec requires that role/identity never be trusted from the
client and that authenticated identity come from the server.

**Decision**: Login sets a signed JWT in an httpOnly, sameSite=lax cookie. The JWT only
carries a user id; `requireAuth` re-reads the user's current role from the database on every
request rather than trusting a role claim baked into an old token. This means a role change
(or removal) takes effect on the very next request, and nothing about authorization ever
depends on a value the browser could edit (localStorage token payload, a header, etc.).

**Status**: Standing.

## 3. Reopen-from-DONE target state

**Context**: The spec lists `DONE -> IN_REVIEW` as "the chosen default unless another legal
reopening state is documented."

**Decision**: Implemented exactly as given — `DONE -> IN_REVIEW` — with no alternative
reopening states. No other transition into/out of DONE besides `IN_REVIEW -> DONE` (forward)
and `DONE -> IN_REVIEW` (reopen) is legal.

**Status**: Standing.

## 4. Cycle detection for task dependencies

**Context**: Spec section 1.4 says cycle detection is a nice-to-have, not mandatory, unless
picked as a stretch goal.

**Decision**: Not implemented as a stretch goal for this pass, given all ten mandatory goals
take priority and per PROJECT_SPEC.md rule 12 stretch work must wait until every mandatory
goal is verified working. Only the two mandatory dependency checks are enforced: no
self-dependency, and blocker/blocked tasks must share a project. Recorded as intentionally
not built in `docs/architecture.md`.

**Status**: Standing (revisit only if time remains after the mandatory audit passes).

## 5. Bulk operations reuse single-task services, not a parallel rules engine

**Context**: Spec section 1.8 and prompt 09 warn against building bulk operations as a
separate code path that could drift from single-task business rules.

**Decision**: `bulkUpdateTasks` in `services/bulkService.ts` loops over task ids and calls the
exact same `updateTaskStatus` / `assignUsersToTask` / `updateTask` (due date) service
functions used by the single-task HTTP routes, each in its own try/catch so one task's
failure can't affect another's. This guarantees bulk and single-task behavior can never
diverge, at the cost of N separate small transactions instead of one large batched query —
acceptable given tasks are evaluated independently per the spec, not all all-or-nothing.

**Status**: Standing.

## 6. History writes happen inside the same service call as the mutation, not via a separate event bus

**Context**: Every mutating operation (status change, field edit, assignment, unassignment,
comment) must produce an immutable `TaskHistory` row with old/new value and actor.

**Decision**: Rather than an event-bus/audit-log side-channel (more infrastructure than this
scope needs), each service function writes its own history row(s) inside the same Prisma
`$transaction` as the mutation it performs, so a history entry and its corresponding change
either both commit or neither does.

**Status**: Standing.

## 7. Password hashing: bcryptjs instead of argon2

**Context**: Spec section 5 says "Argon2 or bcrypt." The real `argon2` npm package is a
native addon that needs to compile via node-gyp at install time, which needs a C/C++ build
toolchain (Visual Studio Build Tools on Windows). This environment has no admin rights and
no build tools installed alongside the portable Node.js runtime.

**Decision**: Used `bcryptjs`, a pure-JS bcrypt implementation with no native compilation
step, so `npm install` stays reliable in this constrained environment. Same hashing
guarantee (salted, slow, industry-standard) the spec asks for; the spec explicitly allows
either algorithm.

**Status**: Standing.

## 8. `Task.updatedAt` doubles as the completion timestamp for DONE tasks

**Context**: The dashboard needs "completed this week" and an 8-week completion trend
(section 1.10), but the schema in section 3 of the spec has no separate `completedAt` field.

**Decision**: Rather than add a column the spec didn't ask for, completion time is read from
`updatedAt` on tasks whose `status` is `DONE`. This is accurate because the domain layer's
lifecycle rules mean a task's `updatedAt` only changes again after reaching DONE if it
leaves DONE (reopen to `IN_REVIEW`), at which point it's correctly no longer counted as a
current completion. Documented here so it's not mistaken for a bug if `updatedAt` is
expected to mean "last touched" in a more general sense.

**Status**: Standing.

## 9. Reversal: `DATABASE_URL` path for SQLite

**Context**: Originally set `DATABASE_URL="file:./prisma/dev.db"` in `.env`, assuming the
path was relative to the backend package root (where `.env` lives). Running the first
migration instead created `backend/prisma/prisma/dev.db` — Prisma resolves a SQLite `file:`
URL relative to the directory containing `schema.prisma` (`backend/prisma/`), not the cwd or
`.env`'s location, so the `./prisma/` segment doubled up.

**Reversal**: Changed `DATABASE_URL` to `file:./dev.db` in `.env`, `.env.example`, and
`.env.test`, deleted the accidental nested directory, and re-ran `prisma migrate deploy` +
the seed script against the corrected paths (`backend/prisma/dev.db`,
`backend/prisma/test.db`). Verified via the same integration test suite before continuing.

**Status**: Standing (corrected).

## 10. Managers see every project, regardless of their own membership

**Context**: Section 1.1 says a manager can "view all projects/tasks within the manager's
scope," which is ambiguous in a single-tenant app with only one manager-vs-member
distinction (no team/org boundaries).

**Decision**: A manager's "scope" is interpreted as the entire tracker — `listProjects` and
`getProjectById` never filter by membership for a `MANAGER` caller, only by the `archived`
flag. Membership still matters for managers in one place: task *assignment* eligibility,
which always requires current project membership regardless of role (see
`docs/schema.md`/dependencies). A manager who creates a project is auto-added as a member so
they can assign themselves tasks without an extra step.

**Status**: Standing.

## 11. IDOR responses use 403, not 404, for authenticated users without access

**Context**: Section 5 requires that a user "must not retrieve or mutate another project's
tasks simply by changing an ID." Two common conventions exist: return 404 (hide existence)
or 403 (confirm existence, deny access).

**Decision**: Used 403 `FORBIDDEN` for an authenticated user who is not a member of a project
they're trying to read/mutate, and reserved 404 for ids that don't exist at all. This keeps
the authorization test matrix's status-code assertions unambiguous (403 always means "you're
allowed to know this exists but not to touch it") and is consistent with how `requireRole`
already returns 403. The tradeoff — a member can tell a given project id exists even when
they can't see its contents — was accepted since project ids are opaque cuids, not
sequential/guessable identifiers.

**Status**: Standing.

## 12. Task creation, field edits, and deletion are manager-only; status transitions will be open to members

**Context**: Section 1.1 lists task creation, editing, and deletion explicitly under
"Manager can," and explicitly lists deletion under "Member cannot." It never explicitly says
members *can* create or field-edit tasks — the member capability list only says "view and
update tasks in projects they belong to."

**Decision**: Read "update" narrowly for members: it covers the actions a working member
takes day-to-day — moving a task through its lifecycle (status transitions, built in the
next phase) and commenting — not structural edits (title/description/priority/due date) or
creation/deletion, which stay manager-only alongside assignment management (also explicitly
manager-only per section 1.1). `POST /projects/:projectId/tasks`, `PATCH /tasks/:id`, and
`DELETE /tasks/:id` all require `requireRole('MANAGER')`; `POST /tasks/:id/status` (lifecycle
phase) and comments will not.

**Status**: Standing.

## 13. `POST /tasks/:id/assignees` replaces the whole assignee set (assign and unassign in one endpoint)

**Context**: PROJECT_SPEC.md's API contract (section 4) lists only one assignee endpoint —
`POST /api/tasks/:id/assignees` — with no corresponding DELETE. But the spec also requires
unassignment to be possible and to produce UNASSIGNED history (sections 1.6, 1.11).

**Decision**: The endpoint takes `{ userIds: string[] }`, the complete desired assignee set,
and diffs it against the task's current assignees (`domain/assignment.ts:
computeAssigneeDiff`). Added ids get a TaskAssignee row + ASSIGNED history; removed ids get
their row deleted + UNASSIGNED history. This satisfies the literal API surface in the spec
(one route) while still covering assign and unassign, and gives the frontend a simple
"send the checked set" interaction instead of separate add/remove calls. Every id in the
desired set must currently be a project member or the whole request is rejected — this is a
direct single-task write, so it's atomic by nature (unlike bulk, which evaluates each task
independently but calls this same function per task).

**Status**: Standing.

---

_Reversals and later decisions are appended below as they genuinely happen during
implementation; this section is not backfilled to look more prescient than it was._
