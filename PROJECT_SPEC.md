# Project & Task Tracker — Master Implementation Specification

## Purpose

This document is the single source of truth for implementing the take-home Project & Task Tracking application.

An AI coding agent should read this file completely before making changes. The agent must implement the required behavior, verify each completed slice with automated tests and/or reproducible manual/API checks, and never mark a requirement complete without evidence.

## Non-negotiable rules

1. All ten assignment goals are mandatory.
2. Backend/server/database rules are authoritative; frontend restrictions alone are never sufficient.
3. Never load the entire task dataset into the browser for filtering, sorting, pagination, CSV export, or dashboard aggregation.
4. Task history is append-only/immutable from the application perspective.
5. Bulk operations are per-task, not all-or-nothing.
6. Project membership controls task visibility and assignment eligibility.
7. A blocked task remembers the state from which it was blocked.
8. A task with unfinished blockers cannot become DONE.
9. Removing a project member unassigns that person from every task in that project.
10. Changing a dismissed task's due date makes its overdue alert eligible to appear again.
11. Every meaningful feature slice must be tested before moving on.
12. Do not implement stretch features until all ten mandatory goals work.
13. Do not fabricate deployment, test, AI-usage, timing, or documentation claims.
14. Keep Git history incremental and meaningful.

---

# 1. Product requirements

## 1.1 Accounts and roles

Roles:

### Manager
Can:
- create projects
- edit projects
- archive projects
- restore projects
- add/remove project members
- create/edit/delete tasks
- manage task assignments
- perform bulk operations
- view all projects/tasks within the manager's scope

### Member
Can:
- sign in
- see only projects they belong to
- view and update tasks in projects they belong to
- see their own cross-project task list
- be assigned to tasks only in projects they belong to

Cannot:
- create/archive/restore projects
- manage project membership
- delete tasks

Authorization must be checked server-side for every protected operation.

## 1.2 Projects

Fields:
- id
- key: short unique identifier
- name
- description
- owner
- archived
- createdAt
- updatedAt

Behavior:
- Managers create/edit/archive/restore.
- Archive is soft state, not deletion.
- Archived projects disappear from default views but retain all tasks/history.
- Restore makes them visible again.
- Project key is unique.

## 1.3 Tasks

Fields:
- id
- projectId
- title
- description
- priority
- dueDate nullable
- status
- createdBy
- createdAt
- updatedAt

Priorities:
- LOW
- MEDIUM
- HIGH
- URGENT

Statuses:
- BACKLOG
- IN_PROGRESS
- IN_REVIEW
- BLOCKED
- DONE

Every task belongs to exactly one project.

## 1.4 Dependencies

A task may have multiple blockers, but blockers must belong to the same project.

Rules:
- A task cannot block itself.
- Invalid dependency relationships are rejected by the server.
- A task cannot become DONE while any blocker is unfinished.
- A blocker is considered finished only when its status is DONE.
- Prefer cycle detection if time permits, but cycle detection is not a mandatory requirement unless chosen as stretch.

## 1.5 Lifecycle

Normal path:

BACKLOG -> IN_PROGRESS -> IN_REVIEW -> DONE

Blocking:
- IN_PROGRESS -> BLOCKED
- IN_REVIEW -> BLOCKED

Unblocking:
- BLOCKED -> the exact status that existed immediately before blocking

Reopening:
- DONE -> IN_REVIEW (chosen default unless another legal reopening state is documented)

Reject:
- BACKLOG -> DONE
- BACKLOG -> IN_REVIEW
- IN_PROGRESS -> DONE when blockers are unfinished
- IN_REVIEW -> BACKLOG
- any other transition not explicitly allowed

The server must return a useful error explaining illegal transitions.

Centralize transition validation in domain/service logic so it is shared by API handlers and tests.

## 1.6 Assignment

Relationships:
- User <-> Task is many-to-many.
- User <-> Project is many-to-many.

Rules:
- Only current members of the task's project may be assigned.
- A user may have many tasks and projects.
- Removing a project member automatically unassigns them from all tasks in that project.
- This removal/unassignment should be atomic.
- "My Tasks" lists all tasks assigned to the current user across visible projects.

## 1.7 Global task list

Server-side query parameters:

- search
- projectId
- status
- assigneeId
- priority
- overdue
- sortBy
- sortOrder
- page
- pageSize

Search:
- title
- description

Sorting:
- due date
- priority
- last updated

Pagination response should include:
- data
- page
- pageSize
- total
- totalPages

The query must apply authorization scope before returning results.

## 1.8 Bulk operations

Supported bulk changes:
- status
- assignees
- due date

Each selected task is evaluated independently.

Response must distinguish:
- successful task changes
- failed task changes
- reason for each failure

Example conceptual response:

{
  "successful": [{"taskId": "..."}],
  "failed": [{"taskId": "...", "code": "...", "reason": "..."}]
}

Each successful change must generate its normal immutable history entries.

## 1.9 CSV export

Export the currently filtered task list.

All active filters and sorting must be respected:
- search
- project
- status
- assignee
- priority
- overdue
- sorting

CSV generation must happen from a backend query, not from the current browser page.

## 1.10 Dashboard

Headline metrics:
- open tasks
- overdue tasks
- due this week
- completed this week

Breakdowns:
- tasks by status
- tasks by assignee

Trend:
- completions over the last eight weeks

Dashboard queries must be aggregated server-side/database-side and must respect user visibility.

## 1.11 Immutable history

Every task has a chronological timeline.

Record:
- creation
- field changes
- old value
- new value
- actor
- timestamp
- assignment
- unassignment
- comments

History records cannot be edited or deleted through the application, including by managers.

Use an append-only model.

A practical model is:

TaskHistory:
- id
- taskId
- actorId
- type
- field nullable
- oldValue nullable
- newValue nullable
- metadata JSON nullable
- createdAt

Comments may be represented as history entries with type COMMENT.

## 1.12 Overdue alerts

A task is overdue when:
- dueDate is before the current date/time
- status != DONE

Alerts:
- appear in an alerts area
- show a navigation badge count
- can be dismissed by an assigned user for that task

Dismissal behavior:
- store enough information to identify the due-date version/snapshot that was dismissed
- if dueDate changes, the previous dismissal must no longer suppress the alert
- only assigned users can dismiss

---

# 2. Recommended architecture

Use a simple full-stack TypeScript architecture unless the existing project dictates otherwise.

Recommended:
- React + TypeScript + Vite
- Tailwind CSS
- Node.js + Express + TypeScript
- PostgreSQL
- Prisma
- Zod for validation
- Vitest/Jest + Supertest for backend tests
- React Testing Library for important UI behavior
- REST API

Suggested structure:

frontend/
  src/
    components/
    pages/
    layouts/
    hooks/
    services/
    types/
    utils/
    lib/

backend/
  src/
    routes/
    controllers/
    services/
    domain/
    repositories/
    middleware/
    validators/
    utils/
    app.ts
    server.ts

prisma/
  schema.prisma
  seed.ts

tests/
docs/

Keep business rules out of React components and thin API controllers.

---

# 3. Core data model

Minimum entities:

### User
- id
- name
- email unique
- passwordHash
- role
- createdAt
- updatedAt

### Project
- id
- key unique
- name
- description
- ownerId
- archived
- createdAt
- updatedAt

### ProjectMember
- projectId
- userId
- createdAt
- composite unique(projectId,userId)

### Task
- id
- projectId
- title
- description
- priority
- dueDate
- status
- blockedFromStatus nullable
- createdById
- createdAt
- updatedAt

### TaskAssignee
- taskId
- userId
- createdAt
- composite unique(taskId,userId)

### TaskDependency
- blockerTaskId
- blockedTaskId
- createdAt
- composite unique(blockerTaskId,blockedTaskId)

### TaskHistory
- id
- taskId
- actorId
- type
- field nullable
- oldValue nullable
- newValue nullable
- metadata JSON nullable
- createdAt

### AlertDismissal
- id
- taskId
- userId
- dismissedDueDate nullable/snapshot
- createdAt
- unique(taskId,userId) if using current dismissal replacement

Relationships:
- Project 1:N Task
- Project N:M User
- Task N:M User
- Task N:M Task through dependency
- Task 1:N TaskHistory
- User 1:N TaskHistory
- User N:M Task through assignees

Database constraints should enforce identity/uniqueness/foreign-key invariants. Application/domain code should enforce contextual business rules such as lifecycle legality and assignment eligibility.

---

# 4. API contract

Suggested endpoints:

Auth:
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

Users:
- GET /api/users
- GET /api/users/:id

Projects:
- GET /api/projects
- POST /api/projects
- GET /api/projects/:id
- PATCH /api/projects/:id
- POST /api/projects/:id/archive
- POST /api/projects/:id/restore
- POST /api/projects/:id/members
- DELETE /api/projects/:id/members/:userId

Tasks:
- GET /api/tasks
- POST /api/projects/:projectId/tasks
- GET /api/tasks/:id
- PATCH /api/tasks/:id
- DELETE /api/tasks/:id
- POST /api/tasks/:id/status
- POST /api/tasks/:id/assignees
- POST /api/tasks/:id/dependencies

History/comments:
- GET /api/tasks/:id/history
- POST /api/tasks/:id/comments

Bulk:
- POST /api/tasks/bulk

Export:
- GET /api/tasks/export.csv

Dashboard:
- GET /api/dashboard/summary
- GET /api/dashboard/status
- GET /api/dashboard/assignees
- GET /api/dashboard/completions

Alerts:
- GET /api/alerts
- POST /api/alerts/:taskId/dismiss

Use consistent errors:

{
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Task cannot move from Backlog directly to Done."
  }
}

---

# 5. Security requirements

- Passwords hashed with Argon2 or bcrypt.
- Protected routes require authenticated user.
- Role checks on backend.
- Project/task visibility checked on backend.
- Never trust role/user/project IDs from the client.
- Validate request bodies, query parameters and route parameters.
- Use ORM/parameterized queries.
- Configure CORS intentionally.
- Secrets only in environment variables.
- Production errors must not expose stack traces/database internals.
- Prevent IDOR: a user must not retrieve or mutate another project's tasks simply by changing an ID.

---

# 6. UI requirements

Pages:
1. Login
2. Dashboard
3. Projects
4. Project detail
5. Task detail
6. All Tasks
7. My Tasks
8. Alerts
9. Project/member management

Include:
- responsive sidebar/navigation
- role-aware controls
- tables
- search
- filters
- pagination
- status/priority badges
- forms with validation
- confirmation dialogs
- toasts
- loading states
- empty states
- error states

The UI should make legal status transitions obvious and unavailable transitions unavailable, but must never depend on this for enforcement.

---

# 7. Seed data

Create:
- 1 manager
- 5–8 members
- 6–10 projects
- multiple project memberships
- 50–100 tasks
- all statuses/priorities
- overdue tasks
- tasks due soon
- completed tasks
- dependencies
- multi-assignee tasks
- realistic history/comments

Demo credentials must be documented.

---

# 8. Verification strategy

Every implementation phase must end with verification.

For each phase, the agent must:
1. run formatter/linter/typecheck
2. run relevant unit/integration tests
3. run the application if practical
4. test critical APIs directly
5. verify authorization using both allowed and forbidden users
6. verify edge cases
7. report PASS/FAIL for the phase
8. fix failures before moving forward

Do not merely say "looks good".

For critical business rules, tests must assert actual HTTP status codes and database outcomes where appropriate.

---

# 9. Mandatory test matrix

Authentication:
- valid login
- invalid password
- protected endpoint without authentication

Authorization:
- manager can manage projects
- member cannot manage projects
- member cannot delete tasks
- member cannot access a project they do not belong to

Lifecycle:
- legal transitions succeed
- illegal transitions fail
- blocker prevents DONE
- unblock restores prior status
- DONE can reopen
- history is written

Assignment:
- valid project member assignment succeeds
- non-member assignment fails
- removing project membership unassigns tasks

Querying:
- search
- every filter
- sorting
- pagination
- authorization scope

Bulk:
- mixed success/failure
- per-task reasons
- history for successful operations

CSV:
- filters reflected in export

Dashboard:
- metrics reflect seeded data
- visibility is scoped

History:
- create/change/assign/unassign/comment recorded
- no update/delete endpoint exists for history

Alerts:
- overdue appears
- DONE removes overdue state
- assigned user can dismiss
- unassigned user cannot dismiss
- due-date change causes alert to reappear

---

# 10. Git strategy

Commit after each meaningful phase.

Suggested commits:

1. chore: initialize application
2. feat: add database schema and seed data
3. feat: add authentication and role authorization
4. feat: add project management and memberships
5. feat: add task CRUD
6. feat: implement task lifecycle rules
7. feat: add dependencies and assignments
8. feat: add server-side task search and pagination
9. feat: add bulk task operations
10. feat: add CSV export
11. feat: add immutable task history and comments
12. feat: add overdue alerts
13. feat: add dashboard analytics
14. test: cover critical business rules
15. docs: complete architecture and schema documentation
16. docs: record engineering decisions and AI prompts
17. fix: final verification and production issues

Never create fake history. Commit when the corresponding work actually happened.

---

# 11. Documentation requirements

Maintain these as development progresses:

docs/architecture.md
docs/schema.md
docs/plan.md
docs/decisions.md
docs/ai-prompts.md

Also maintain:
README.md
SUBMISSION.md

`docs/ai-prompts.md` must contain actual prompts used, what they produced, and corrections. At least one incorrect AI output and correction must be documented.

`docs/decisions.md` must contain at least five genuine decisions and at least one later reversal.

---

# 12. Definition of done

Before declaring completion:

- fresh clone setup works
- environment variables documented
- migrations work
- seed works
- authentication works
- manager/member authorization works
- all ten goals are implemented
- critical rules have automated tests
- no secrets are committed
- production build succeeds
- README is complete
- demo credentials are documented
- documentation is complete
- seeded data makes the dashboard useful
- API errors are consistent
- UI is responsive
- requirement-by-requirement audit passes

Do not claim a goal is done if it is only partially implemented.

---

# 13. Final requirement audit

At the end, produce a table:

| Goal | Requirement | Backend verified | Frontend verified | Automated test | Status |
|---|---|---|---|---|---|
| 1 | Accounts and roles | | | | |
| 2 | Projects | | | | |
| 3 | Tasks | | | | |
| 4 | Lifecycle | | | | |
| 5 | Assignment | | | | |
| 6 | Finding things | | | | |
| 7 | Bulk + CSV | | | | |
| 8 | Dashboard | | | | |
| 9 | History | | | | |
| 10 | Alerts | | | | |

A requirement is only DONE when both user-visible behavior and server-side enforcement have been verified.
