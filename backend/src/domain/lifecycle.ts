import { Status } from './constants';

export type TransitionResult =
  { legal: true; nextBlockedFromStatus: Status | null } | { legal: false; reason: string };

/**
 * Pure, I/O-free lifecycle rule table. Centralized here so both the HTTP layer and unit
 * tests exercise exactly the same logic — no duplicate rule-checking in controllers or the
 * frontend. See PROJECT_SPEC.md section 1.5.
 *
 * Legal transitions:
 *   BACKLOG -> IN_PROGRESS
 *   IN_PROGRESS -> IN_REVIEW
 *   IN_REVIEW -> DONE          (also subject to the blocker check, done at the service layer
 *                                since it requires a database query — see requiresBlockerCheck)
 *   IN_PROGRESS -> BLOCKED
 *   IN_REVIEW -> BLOCKED
 *   BLOCKED -> <exact status the task was in immediately before blocking>
 *   DONE -> IN_REVIEW           (reopen)
 *
 * Everything else, including staying in the same status, is rejected.
 */
const FORWARD_TRANSITIONS: Partial<Record<Status, Status[]>> = {
  BACKLOG: ['IN_PROGRESS'],
  IN_PROGRESS: ['IN_REVIEW', 'BLOCKED'],
  IN_REVIEW: ['DONE', 'BLOCKED'],
  DONE: ['IN_REVIEW'],
};

export function validateTransition(
  current: Status,
  target: Status,
  blockedFromStatus: Status | null,
): TransitionResult {
  if (current === target) {
    return { legal: false, reason: `Task is already ${target}.` };
  }

  if (current === 'BLOCKED') {
    if (blockedFromStatus && target === blockedFromStatus) {
      return { legal: true, nextBlockedFromStatus: null };
    }
    return {
      legal: false,
      reason: blockedFromStatus
        ? `A blocked task can only return to its prior status (${blockedFromStatus}).`
        : 'This blocked task has no recorded prior status and cannot be unblocked automatically.',
    };
  }

  const allowedTargets = FORWARD_TRANSITIONS[current] ?? [];
  if (!allowedTargets.includes(target)) {
    return {
      legal: false,
      reason: `Cannot move a task from ${current} to ${target}.`,
    };
  }

  if (target === 'BLOCKED') {
    return { legal: true, nextBlockedFromStatus: current };
  }

  return { legal: true, nextBlockedFromStatus: null };
}

/** DONE is the only target whose legality also depends on data outside the status itself
 * (unfinished blockers) — the service layer runs that check only when this returns true. */
export function requiresBlockerCheck(target: Status): boolean {
  return target === 'DONE';
}
