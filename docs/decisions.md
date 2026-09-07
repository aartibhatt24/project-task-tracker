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

---

_Reversals and later decisions are appended below as they genuinely happen during
implementation; this section is not backfilled to look more prescient than it was._
