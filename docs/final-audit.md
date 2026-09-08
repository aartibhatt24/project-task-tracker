# Final requirement audit

Produced at the end of implementation, after a dedicated adversarial review pass (checked:
route authorization ordering, IDOR coverage, lifecycle rule completeness, database
constraints, query/scope behavior, history immutability, alert semantics, bulk behavior, CSV
filtering, dashboard aggregation, CSV/formula injection, secret handling, and the git
history/documentation itself). One real issue was found and fixed during this pass — CSV
export did not neutralize leading `=`/`+`/`-`/`@` characters in exported fields, a known
spreadsheet "formula injection" vector — see `docs/decisions.md` and the new test in
`backend/tests/integration/csv-export.test.ts`. No other high/critical issues were found.

A requirement is marked DONE only where both user-visible behavior (checked via the
Playwright browser walkthrough or manual API calls) and server-side enforcement (checked via
an automated test asserting an actual HTTP status code and, where relevant, a database
outcome) were verified — not from reading the code and judging it "looks right."

| Goal | Requirement | Backend verified | Frontend verified | Automated test | Status |
|---|---|---|---|---|---|
| 1 | Accounts and roles | Yes — role re-read from DB every request, `requireRole` on every manager-only route | Yes — role-aware controls confirmed absent for members via browser walkthrough | `tests/integration/auth.test.ts`, `tests/unit/requireRole.test.ts` | DONE |
| 2 | Projects | Yes — CRUD, archive/restore, unique key, membership-scoped visibility | Yes — Projects/Project detail pages, archive/restore buttons, browser-verified | `tests/integration/projects.test.ts` | DONE |
| 3 | Tasks | Yes — full CRUD, project-scoped, manager-only create/edit/delete | Yes — task creation form, task detail edit form | `tests/integration/tasks.test.ts` | DONE |
| 4 | Lifecycle | Yes — centralized domain table, blocker check, exact-state unblock | Yes — status buttons disable illegal transitions (UI hint only; server re-validates) | `tests/unit/lifecycle.test.ts` (26), `tests/integration/lifecycle.test.ts` (11) | DONE |
| 5 | Assignment | Yes — membership-restricted, atomic member-removal cascade with history | Yes — assignee editor on task detail, browser-verified | `tests/integration/assignments.test.ts`, `tests/integration/projects.test.ts` (removal cascade) | DONE |
| 6 | Finding things | Yes — search/filter/sort/pagination fully server-side, scope in the WHERE clause | Yes — All Tasks / My Tasks filter bar, browser-verified | `tests/integration/task-query.test.ts` (14) | DONE |
| 7 | Bulk + CSV | Yes — per-task independent evaluation reusing single-task domain logic; CSV shares the same query builder, unpaginated | Yes — bulk status buttons + CSV export link, browser-verified | `tests/integration/bulk.test.ts` (10), `tests/integration/csv-export.test.ts` (9) | DONE |
| 8 | Dashboard | Yes — server/DB-side aggregation, scoped by visibility | Yes — stat cards + charts render real data, browser-verified for both roles | `tests/integration/dashboard.test.ts` (8, checked against direct DB queries) | DONE |
| 9 | History | Yes — append-only by omission of any update/delete route, transactional with every mutation | Yes — history/comments timeline on task detail, browser-verified | `tests/integration/history.test.ts` (8, including PATCH/PUT/DELETE 404 proof) | DONE |
| 10 | Alerts | Yes — due-date-snapshot dismissal versioning, assignee-only dismiss | Yes — Alerts page + nav badge, browser-verified | `tests/integration/alerts.test.ts` (9, full spec scenario) | DONE |

## Anything genuinely incomplete

- **Cycle detection for dependencies** — explicitly optional per the spec; not built (see
  `docs/decisions.md` #4). Only the two mandatory dependency checks (no self-dependency, no
  cross-project blockers) are enforced.
- **Streaming CSV export** — the current implementation loads the full filtered result set
  into memory before writing the response. Fine at this project's data scale (tens to low
  hundreds of tasks); would need cursor-based streaming at much larger scale (see
  `docs/interview-notes.md` question 11).
- **No live deployment** — built and verified locally (dev servers, both production builds,
  and `npm start` against the compiled backend all run and were smoke-tested); not deployed
  to a hosted URL. `README.md` documents the exact steps and the one env var
  (`COOKIE_SAME_SITE`) a real cross-domain deployment needs to change.

Everything else called for by `PROJECT_SPEC.md` — all ten goals, the security requirements
in section 5, the UI requirements in section 6, the seed data in section 7 — is implemented
and verified as described above.
