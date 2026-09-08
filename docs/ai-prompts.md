# AI usage log

This project was built by an AI coding agent (Claude Sonnet 5, via Claude Code) in a single
continuous session. This file documents the actual driving prompt, the workflow followed,
and — per the spec's requirement — concrete cases where the agent's own output was wrong
and how that was found and fixed. Nothing here is invented after the fact; every item below
corresponds to a real commit or a real debugging step taken during this session.

## The driving prompt

The user's instruction, in full substance (lightly paraphrased for length):

> Go through `PROJECT_SPEC.md`, understand everything about the project, then go through
> `AGENT_PROMPTS.md` for how to implement it step by step. Take both as reference,
> understand the project completely, and create your own steps to implement the entire
> project end to end with all the required testing. I want a complete working project based
> on `PROJECT_SPEC.md`.

The agent read both files in full, then executed an adapted version of `AGENT_PROMPTS.md`'s
20-prompt sequence as a single self-directed session — one phase at a time, each ending in
typecheck/lint/tests/a live HTTP or browser smoke check against the real seeded database,
committing only after verification passed, exactly as `AGENT_PROMPTS.md` instructs.

One deviation from a literal prompt-by-prompt read: rather than building a partial UI after
every single backend phase (as `AGENT_PROMPTS.md` prompts 05 and 08 suggest doing
incrementally), the agent built the complete backend (all 10 goals, phases 1–13) first, then
built the entire frontend in one pass against the finished API (phase "UI"). This was a
sequencing choice to avoid rebuilding partial UI repeatedly as backend endpoints changed
underneath it — not a scope cut; every required page still exists and was verified.

## Environment obstacle handled at the start

Before any code was written, the agent discovered the environment had no Node.js, npm,
Docker, PostgreSQL, or WSL, and the session had no admin rights (a `winget install` attempt
triggered a UAC prompt with no way to approve it). The agent:
1. Downloaded a portable (no-installer) Node.js build and created PATH shims so `node`/`npm`
   work in ordinary shells.
2. Asked the user directly (via a structured question, not a silent decision) how to handle
   the missing PostgreSQL, since the spec recommends it. The user chose SQLite via Prisma.

This is recorded here because it's a real instance of the agent recognizing it could not
proceed as instructed and stopping to get a human decision rather than silently
substituting or failing.

## Genuine incorrect outputs and their corrections

### 1. `DATABASE_URL` path — wrong on the first attempt

**What the agent produced**: `DATABASE_URL="file:./prisma/dev.db"` in `backend/.env`,
reasoning (incorrectly) that the path was relative to the backend package root where `.env`
lives.

**What actually happened**: running the first migration created a nested
`backend/prisma/prisma/dev.db` — Prisma resolves a SQLite `file:` URL relative to the
directory containing `schema.prisma` (`backend/prisma/`), not the `.env` file's location or
the process cwd.

**Correction**: changed the value to `file:./dev.db` in `.env`, `.env.example`, and
`.env.test`, deleted the accidental nested directory, and re-ran migrations + seed against
the corrected path. Verified via the existing integration test suite before continuing.
Documented in `docs/decisions.md` #9.

### 2. Frontend login redirect — a real race condition, only found by driving a real browser

**What the agent produced**: `ProtectedRoute` redirected an unauthenticated visitor to
`/login` with `state: { from: location.pathname }`, and `LoginPage` had two different
mechanisms trying to redirect back after a successful login — a declarative
`<Navigate to={from} />` fired on re-render, and a separate imperative
`navigate('/', { replace: true })` inside the submit handler, targeting a *different* route
than the declarative one when a `from` was present.

**How it was found**: after the full UI was built, the agent used Playwright (installed
locally, no admin rights needed) to actually drive a headless Chromium browser through the
app — log in as manager, click through every page, sign out, log back in as a different
member — rather than trusting that typecheck/lint/unit tests were sufficient for a UI this
size. The scripted walkthrough consistently landed on the *previous* user's last-visited
page (`/alerts`) instead of the dashboard after switching accounts, and one run showed the
two navigation calls actively racing.

**Correction**: first attempt made both navigation calls agree on the same target
(eliminating the race), which is what the browser test was rerun against next. That
surfaced a deeper UX question — should a fresh login resume the *previous* session's last
page on a shared browser used by both a manager and multiple members for this demo? The
agent judged no, and reversed course: removed the "return to previous page" feature
entirely, so `ProtectedRoute` always sends unauthenticated visitors to a bare `/login` and
a successful login always lands on `/`. Reran the full Playwright walkthrough to confirm.
Documented in `docs/decisions.md` #15, including the reasoning for the second (reversal)
decision, not just the first fix.

This is the clearest example in this project of a defect that no amount of `tsc`/ESLint/unit
testing would have caught — it only showed up by actually clicking through the running app.

### 3. Production build entrypoint mismatch

**What the agent produced**: `backend/tsconfig.json` had `rootDir: "."` and included `src`,
`prisma`, and `tests`, so `tsc` mirrored the whole backend tree under `dist/`. The compiled
server landed at `dist/src/server.js`, but `package.json`'s `start` script ran
`node dist/server.js` — a path that never existed.

**How it was found**: during the dedicated production-readiness pass, the agent actually
ran `npm run build && npm start` and hit `/api/health`, rather than treating "the compiler
exits 0" as sufficient proof the production path works. The start command failed with a
module-not-found error.

**Correction**: added `tsconfig.build.json` (`rootDir: "src"`, `include: ["src"]` only) and
pointed the `build` script at it, so the compiled output lands directly in `dist/` and
`dist/server.js` exists where `start` expects it. Re-verified by actually running the
built server again. Documented in `docs/decisions.md` #16.

## What this says about the process, honestly

All three corrections above were caught by the agent's own verification steps (a test
suite, a from-scratch browser walkthrough, an actual `npm start`), not by the user pointing
them out — because this was a single agentic session with no back-and-forth prompt/response
pairs to log in the traditional sense. The discipline that mattered was refusing to mark a
phase done on "looks right" — see `PROJECT_SPEC.md` rule 11 and section 8 — and running the
actual thing (server, browser, build) at least once per phase instead of only trusting
static checks.
