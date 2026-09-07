# Database schema

Implemented in `backend/prisma/schema.prisma`, provider `sqlite` (see `docs/architecture.md`
and `docs/decisions.md` for why). Enums are modeled as Prisma `enum` (compiled to `TEXT` with
app-level validation under SQLite, same as Prisma does under Postgres for the values that
matter — Zod validates every enum-bearing input regardless).

## Entities

### User
- id (cuid, pk)
- name
- email (unique)
- passwordHash
- role: `MANAGER` | `MEMBER`
- createdAt, updatedAt

### Project
- id (pk)
- key (unique, short e.g. `ENG`)
- name
- description (nullable)
- ownerId -> User
- archived (bool, default false)
- createdAt, updatedAt

### ProjectMember
- id (pk)
- projectId -> Project (cascade delete)
- userId -> User (cascade delete)
- createdAt
- `@@unique([projectId, userId])`

### Task
- id (pk)
- projectId -> Project (cascade delete)
- title
- description (nullable)
- priority: `LOW` | `MEDIUM` | `HIGH` | `URGENT`
- dueDate (nullable DateTime)
- status: `BACKLOG` | `IN_PROGRESS` | `IN_REVIEW` | `BLOCKED` | `DONE`
- blockedFromStatus (nullable, same enum) — remembers the pre-block state
- createdById -> User
- createdAt, updatedAt
- indexes: `[projectId]`, `[status]`, `[dueDate]`, `[priority]` — support the mandatory
  filter/sort/pagination and dashboard/overdue queries without full scans.

### TaskAssignee
- id (pk)
- taskId -> Task (cascade delete)
- userId -> User (cascade delete)
- createdAt
- `@@unique([taskId, userId])`

### TaskDependency
- id (pk)
- blockerTaskId -> Task (cascade delete, relation `TaskBlockerOf`)
- blockedTaskId -> Task (cascade delete, relation `TaskBlockedBy`)
- createdAt
- `@@unique([blockerTaskId, blockedTaskId])`
- app-level rule (not expressible as a DB constraint): `blockerTaskId != blockedTaskId`,
  and both tasks' `projectId` must match — enforced in `domain/dependencies.ts` before insert.

### TaskHistory
- id (pk)
- taskId -> Task (cascade delete)
- actorId -> User (required FK; users are never hard-deleted by the app, so history always
  resolves to a real actor)
- type: `CREATED` | `FIELD_CHANGE` | `STATUS_CHANGE` | `ASSIGNED` | `UNASSIGNED` | `COMMENT`
- field (nullable string)
- oldValue (nullable string)
- newValue (nullable string)
- metadata (nullable JSON string)
- createdAt
- No update/delete route exists anywhere in the API for this table — append-only by omission,
  enforced by code review / the absence of a route, and by a dedicated test asserting no such
  route resolves.

### AlertDismissal
- id (pk)
- taskId -> Task (cascade delete)
- userId -> User (cascade delete)
- dismissedDueDate (nullable DateTime) — snapshot of the `dueDate` at the moment of dismissal
- createdAt
- `@@unique([taskId, userId])` — one active dismissal per (task, user); dismissing again
  overwrites the snapshot (upsert), and the alert query compares the task's *current*
  `dueDate` against `dismissedDueDate`: if they no longer match, the dismissal no longer
  suppresses the alert (goal 10).

## Relationships

- Project 1:N Task, Project N:M User (via ProjectMember)
- Task N:M User (via TaskAssignee)
- Task N:M Task (via TaskDependency, two named relations: blocker / blocked)
- Task 1:N TaskHistory, User 1:N TaskHistory (as actor)

## Constraints enforced by the database

- `User.email` unique
- `Project.key` unique
- `ProjectMember(projectId, userId)` unique
- `TaskAssignee(taskId, userId)` unique
- `TaskDependency(blockerTaskId, blockedTaskId)` unique
- `AlertDismissal(taskId, userId)` unique
- All foreign keys, with `onDelete: Cascade` where a child record has no meaning without
  its parent (memberships, assignees, dependencies, history, dismissals all die with their
  task/project)

## Constraints enforced by application/domain code

- Lifecycle legality (`domain/lifecycle.ts`)
- Blocker-must-be-DONE-before-target-can-be-DONE
- Self-dependency and cross-project dependency rejection
- Assignment eligibility (assignee must be a current project member)
- Removing a project member cascades to unassigning them from that project's tasks,
  inside one Prisma `$transaction`
- Alert dismissal due-date-snapshot comparison
