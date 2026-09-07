# Agent Prompt Pack — Project & Task Tracker

## How to use this file

Give the agent `PROJECT_SPEC.md` first. Then execute these prompts in order.

After every prompt, require the agent to:
- inspect the existing code before changing it
- make only the changes for the current phase unless a dependency requires otherwise
- run formatting/linting/typecheck
- run the phase's tests
- perform manual/API smoke checks where applicable
- fix failures
- summarize files changed
- summarize tests run and results
- state PASS/FAIL
- create a meaningful Git commit only after verification passes

Never tell the agent to "continue if tests fail". It must diagnose and fix the current phase before proceeding.

---

# Prompt 00 — Read specification and create implementation plan

Read `PROJECT_SPEC.md` completely.

Do not write application code yet.

Analyze the requirements and produce:
1. proposed stack
2. architecture
3. database model
4. API boundaries
5. frontend route/page structure
6. business-rule/domain services
7. testing strategy
8. implementation phases
9. likely risks
10. decisions that need to be made

Create/update:
- docs/architecture.md
- docs/schema.md
- docs/plan.md
- docs/decisions.md

Do not invent completed work. Mark these as planning decisions.

Then verify that the plan covers all ten requirements.

No application implementation is required in this phase.

Commit:
`docs: define architecture and implementation plan`

---

# Prompt 01 — Initialize the application

Implement the project foundation according to PROJECT_SPEC.md.

Set up:
- frontend
- backend
- TypeScript
- package scripts
- formatting
- linting
- environment variable handling
- PostgreSQL/ORM integration
- basic frontend shell
- backend health endpoint
- error-handling foundation

Keep the application runnable.

Verification:
- install dependencies from a clean state
- typecheck
- lint
- build frontend
- build backend
- start backend and verify health endpoint
- start frontend and verify it renders

Do not implement business features yet.

If anything fails, fix it before finishing.

Commit:
`chore: initialize application`

---

# Prompt 02 — Database schema and seed data

Implement the complete database schema required by PROJECT_SPEC.md.

Create:
- User
- Project
- ProjectMember
- Task
- TaskAssignee
- TaskDependency
- TaskHistory
- AlertDismissal

Add:
- foreign keys
- unique constraints
- useful indexes
- migrations
- seed script

Seed realistic demo data.

Do not implement the full UI yet.

Verification:
- reset/create database
- run migrations
- run seed
- verify row counts
- verify relationships
- verify unique constraints
- verify foreign keys
- run ORM/database tests

Inspect the generated schema and confirm every requirement has a corresponding model.

Commit:
`feat: add database schema and seed data`

---

# Prompt 03 — Authentication and authorization

Implement:
- login
- logout
- current-user endpoint
- password hashing
- authentication middleware
- role authorization middleware
- protected frontend routes
- manager/member demo users

Use secure server-side authorization.

Test direct API access, not only UI visibility.

Verification:
- valid manager login succeeds
- valid member login succeeds
- invalid password fails
- unauthenticated request to protected API fails
- member calling manager-only endpoint gets 403
- authenticated user identity comes from the server session/token, not client-provided role
- frontend redirects unauthenticated users

Write automated tests.

Commit:
`feat: add authentication and role authorization`

---

# Prompt 04 — Projects and memberships

Implement project management and membership.

Manager:
- create project
- edit project
- archive
- restore
- add member
- remove member

Member:
- only sees projects they belong to

Archive must preserve tasks/data.

Removing a member must be implemented as a transactional operation that also unassigns them from tasks in that project.

Verification:
- manager can perform all operations
- member receives 403 for manager operations
- member cannot retrieve another project by ID
- archived project is absent from default list
- restore makes it visible
- removed member loses project access
- removed member is removed from all task assignments
- test transaction/consistency behavior

Commit:
`feat: add project management and memberships`

---

# Prompt 05 — Task CRUD

Implement task creation, reading, editing and deletion.

Every task must belong to exactly one project.

Implement:
- title
- description
- priority
- due date
- status
- creator
- timestamps

Rules:
- project access is enforced
- member cannot delete
- manager can delete
- task visibility follows project membership

Add task detail and project task list UI.

Verification:
- create task
- edit task
- retrieve task
- delete as manager
- delete as member fails
- unauthorized project/task access fails
- validation rejects invalid payloads
- initial creation history is written

Commit:
`feat: add task CRUD`

---

# Prompt 06 — Task lifecycle domain rules

This is a critical phase.

Create a centralized lifecycle/domain service.

Implement exactly:

BACKLOG -> IN_PROGRESS
IN_PROGRESS -> IN_REVIEW
IN_REVIEW -> DONE

IN_PROGRESS -> BLOCKED
IN_REVIEW -> BLOCKED

BLOCKED -> previous pre-block state

DONE -> IN_REVIEW

Reject all other transitions.

A task with unfinished blockers cannot move to DONE.

Do not implement lifecycle rules only in controllers or frontend.

The server must reject invalid requests even if the client is manipulated.

Verification:
- unit test every legal transition
- unit test representative illegal transitions
- test blocker prevents DONE
- test unblock returns exact previous state
- test DONE reopening
- test direct API calls
- verify useful error codes/messages
- verify successful transition creates history

Only mark this phase PASS after all tests pass.

Commit:
`feat: implement task lifecycle rules`

---

# Prompt 07 — Dependencies and assignments

Implement:
- task dependencies
- multiple assignees
- dependency validation
- assignment validation
- assignment UI

Rules:
- blockers must be in same project
- task cannot block itself
- only project members can be assigned
- removing project member unassigns them

Verification:
- create valid dependency
- reject self-dependency
- reject cross-project dependency
- assign project member
- reject non-member assignment
- assign multiple users
- remove member and verify task assignments are cleaned up
- verify history for assignment/unassignment

Commit:
`feat: add dependencies and assignments`

---

# Prompt 08 — Global task list, search, filters, sorting and pagination

Implement the global task list.

Server-side parameters:
- search
- project
- status
- assignee
- priority
- overdue
- sort
- order
- page
- pageSize

Return total counts/page metadata.

Do NOT fetch all tasks to the browser.

Verification:
- inspect network/API request to ensure query parameters are sent
- search title
- search description
- each filter
- overdue filter
- each sort
- pagination
- total result count
- authorization scope
- test combinations of filters
- test empty result state

Add automated API/integration tests.

Commit:
`feat: add server-side task search and pagination`

---

# Prompt 09 — Bulk operations

Implement bulk:
- status change
- assignee change
- due-date change

Each task must be evaluated independently.

One invalid task must not prevent valid tasks from succeeding.

Return per-task success/failure and reason.

Use the same domain rules as individual operations. Do not create a second incompatible rules engine.

Verification:
Create a mixed batch where:
- one task succeeds
- one fails due to lifecycle
- one fails due to assignment authorization
- one succeeds

Verify:
- successful database changes persist
- failed changes do not partially apply
- each failure has a useful reason
- successful operations create history
- UI displays per-task results

Commit:
`feat: add bulk task operations`

---

# Prompt 10 — CSV export

Implement backend CSV export of the currently filtered task list.

The export must respect:
- search
- project
- status
- assignee
- priority
- overdue
- sorting

Do not export only the currently loaded browser page.

Verification:
- call export endpoint with filters
- compare exported rows against equivalent task query
- verify sorting
- verify no unauthorized tasks appear
- verify valid CSV headers/content
- verify download from UI

Commit:
`feat: add CSV export`

---

# Prompt 11 — Immutable task history and comments

Implement append-only task history.

Record:
- creation
- field changes
- status changes
- assignments
- unassignments
- comments

History must contain:
- actor
- timestamp
- old value
- new value where relevant

No edit/delete operations for history.

Verification:
- create task and see creation event
- modify title/priority/due date/status
- assign/unassign
- add comment
- verify chronological timeline
- verify actor
- verify old/new values
- attempt direct API mutation/deletion and confirm no supported path exists
- verify manager cannot edit/delete history

Commit:
`feat: add immutable task history and comments`

---

# Prompt 12 — Overdue alerts

Implement overdue alerts and navigation badge.

Overdue:
dueDate < now AND status != DONE

Implement:
- alerts endpoint
- alerts UI
- count badge
- dismiss
- due-date-version-aware dismissal

Only assigned users may dismiss.

Changing the due date must cause the alert to become eligible again.

Verification:
1. create overdue assigned task
2. confirm alert appears
3. dismiss alert
4. confirm it is suppressed
5. change due date
6. confirm alert becomes visible again when overdue
7. verify unassigned user cannot dismiss
8. verify DONE task is not overdue
9. verify count badge

Commit:
`feat: add overdue alerts`

---

# Prompt 13 — Dashboard analytics

Implement:
- open tasks
- overdue tasks
- due this week
- completed this week
- status breakdown
- assignee breakdown
- eight-week completion trend

Use backend/database aggregation.

Do not load all tasks into the browser.

Verification:
- compare dashboard metrics against direct database queries
- verify manager/member visibility
- verify empty data handling
- verify eight-week buckets
- verify UI charts render

Commit:
`feat: add dashboard analytics`

---

# Prompt 14 — UI polish and error states

Improve the application without changing business behavior.

Add:
- responsive layout
- loading states
- empty states
- error states
- toast notifications
- confirmation dialogs
- accessible forms
- status/priority badges
- pagination controls
- clear legal status actions
- role-aware controls

Verification:
- test major screens at desktop/mobile widths
- verify keyboard navigation where practical
- verify error messages
- verify loading states
- verify destructive actions require confirmation
- verify frontend never assumes backend success without handling response

Commit:
`feat: polish application UX`

---

# Prompt 15 — Comprehensive test pass

Now stop adding features.

Run:
- formatter
- lint
- typecheck
- frontend tests
- backend tests
- integration tests
- production builds

Review the mandatory test matrix from PROJECT_SPEC.md.

Add missing tests for:
- auth
- authorization
- lifecycle
- dependencies
- assignment
- member removal
- filtering
- pagination
- bulk partial success
- CSV
- history
- alerts
- dashboard

For every failure:
1. diagnose root cause
2. fix it
3. rerun the affected tests
4. rerun the full suite

Do not weaken tests just to make them pass.

Commit:
`test: cover critical business rules`

---

# Prompt 16 — Documentation

Complete:
- README.md
- docs/architecture.md
- docs/schema.md
- docs/plan.md
- docs/decisions.md
- docs/ai-prompts.md
- SUBMISSION.md

Use actual implementation details.

Do not invent:
- time spent
- deployment status
- prompts that were not used
- decisions that were not made

For AI prompts, record the real prompts used during this development session.

For decisions:
- include at least five genuine decisions
- include at least one later reversal

Document what was intentionally not built.

Commit:
`docs: complete project documentation`

---

# Prompt 17 — Production readiness and deployment preparation

Prepare deployment without pretending deployment has happened.

Check:
- production environment variables
- CORS
- database connection
- migrations
- seed behavior
- frontend API URL
- backend start command
- frontend build command
- secure cookie/token configuration
- error handling
- no secrets in repository

Run a production build locally.

If deployment tools are available, deploy and verify the live application. Otherwise provide exact deployment instructions.

Do not put real secrets into files or Git.

Commit:
`chore: prepare production deployment`

---

# Prompt 18 — Final adversarial audit

Act as a hostile code reviewer evaluating this project against PROJECT_SPEC.md.

Do not modify anything initially.

Inspect:
- requirements
- API authorization
- lifecycle rules
- database constraints
- query behavior
- history immutability
- alert semantics
- bulk behavior
- CSV filtering
- dashboard aggregation
- tests
- Git history
- documentation

Create a defect list with:
- severity
- requirement affected
- evidence
- recommended fix

Then fix all high/critical issues.

After fixes:
- run full verification again
- produce the final ten-goal audit table
- state PASS/FAIL for each goal
- list anything genuinely incomplete

Commit only if fixes were made:
`fix: complete final requirement audit`

---

# Prompt 19 — Interview/readiness review

Review the final codebase as if an interviewer will ask:

1. Why this architecture?
2. Why this database schema?
3. Where are business rules enforced?
4. How does authorization prevent IDOR?
5. How does blocked-state restoration work?
6. How does the blocker rule work?
7. Why are bulk operations partial-success?
8. How does CSV export respect filters?
9. Why is history immutable?
10. How does alert dismissal reappear after due-date change?
11. What would break first at 100x data?
12. What did you intentionally not build?
13. Which decision did you reverse and why?
14. Where did AI produce incorrect code?
15. What would you improve with another 12 hours?

Create `docs/interview-notes.md` with concise answers grounded in the actual code.

Do not invent answers. If the code does not support a claim, identify the gap.

No code changes unless needed to correct a discovered issue.
