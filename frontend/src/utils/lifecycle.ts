import { Status } from '../types/domain';

// Mirrors backend/src/domain/lifecycle.ts for UI hinting only (disabling illegal buttons).
// The server is the sole source of truth and re-validates every request regardless.
const FORWARD_TRANSITIONS: Partial<Record<Status, Status[]>> = {
  BACKLOG: ['IN_PROGRESS'],
  IN_PROGRESS: ['IN_REVIEW', 'BLOCKED'],
  IN_REVIEW: ['DONE', 'BLOCKED'],
  DONE: ['IN_REVIEW'],
};

export function legalNextStatuses(current: Status, blockedFromStatus: Status | null): Status[] {
  if (current === 'BLOCKED') {
    return blockedFromStatus ? [blockedFromStatus] : [];
  }
  return FORWARD_TRANSITIONS[current] ?? [];
}
