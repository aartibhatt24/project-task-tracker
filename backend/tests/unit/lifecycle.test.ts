import { describe, expect, it } from 'vitest';
import { requiresBlockerCheck, validateTransition } from '../../src/domain/lifecycle';

describe('lifecycle domain: validateTransition', () => {
  it.each([
    ['BACKLOG', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'IN_REVIEW'],
    ['IN_REVIEW', 'DONE'],
    ['IN_PROGRESS', 'BLOCKED'],
    ['IN_REVIEW', 'BLOCKED'],
    ['DONE', 'IN_REVIEW'],
  ] as const)('allows %s -> %s', (from, to) => {
    const result = validateTransition(from, to, null);
    expect(result.legal).toBe(true);
  });

  it.each([
    ['BACKLOG', 'DONE'],
    ['BACKLOG', 'IN_REVIEW'],
    ['BACKLOG', 'BLOCKED'],
    ['IN_PROGRESS', 'DONE'],
    ['IN_PROGRESS', 'BACKLOG'],
    ['IN_REVIEW', 'BACKLOG'],
    ['IN_REVIEW', 'IN_PROGRESS'],
    ['DONE', 'BACKLOG'],
    ['DONE', 'IN_PROGRESS'],
    ['DONE', 'BLOCKED'],
  ] as const)('rejects %s -> %s', (from, to) => {
    const result = validateTransition(from, to, null);
    expect(result.legal).toBe(false);
  });

  it('rejects a transition to the same status', () => {
    const result = validateTransition('IN_PROGRESS', 'IN_PROGRESS', null);
    expect(result.legal).toBe(false);
  });

  it('sets nextBlockedFromStatus when entering BLOCKED from IN_PROGRESS', () => {
    const result = validateTransition('IN_PROGRESS', 'BLOCKED', null);
    expect(result).toEqual({ legal: true, nextBlockedFromStatus: 'IN_PROGRESS' });
  });

  it('sets nextBlockedFromStatus when entering BLOCKED from IN_REVIEW', () => {
    const result = validateTransition('IN_REVIEW', 'BLOCKED', null);
    expect(result).toEqual({ legal: true, nextBlockedFromStatus: 'IN_REVIEW' });
  });

  it('unblocking to the exact prior status succeeds and clears blockedFromStatus', () => {
    const result = validateTransition('BLOCKED', 'IN_PROGRESS', 'IN_PROGRESS');
    expect(result).toEqual({ legal: true, nextBlockedFromStatus: null });
  });

  it('unblocking to the exact prior status (IN_REVIEW) succeeds', () => {
    const result = validateTransition('BLOCKED', 'IN_REVIEW', 'IN_REVIEW');
    expect(result).toEqual({ legal: true, nextBlockedFromStatus: null });
  });

  it('rejects unblocking to a status other than the exact recorded prior status', () => {
    const result = validateTransition('BLOCKED', 'DONE', 'IN_PROGRESS');
    expect(result.legal).toBe(false);
  });

  it('rejects unblocking to BACKLOG even if that seems intuitive, when prior was IN_PROGRESS', () => {
    const result = validateTransition('BLOCKED', 'BACKLOG', 'IN_PROGRESS');
    expect(result.legal).toBe(false);
  });

  it('rejects leaving BLOCKED when there is no recorded prior status', () => {
    const result = validateTransition('BLOCKED', 'IN_PROGRESS', null);
    expect(result.legal).toBe(false);
  });

  it('reopening DONE -> IN_REVIEW does not set blockedFromStatus', () => {
    const result = validateTransition('DONE', 'IN_REVIEW', null);
    expect(result).toEqual({ legal: true, nextBlockedFromStatus: null });
  });
});

describe('lifecycle domain: requiresBlockerCheck', () => {
  it('is true only for DONE', () => {
    expect(requiresBlockerCheck('DONE')).toBe(true);
    expect(requiresBlockerCheck('IN_PROGRESS')).toBe(false);
    expect(requiresBlockerCheck('BACKLOG')).toBe(false);
    expect(requiresBlockerCheck('BLOCKED')).toBe(false);
    expect(requiresBlockerCheck('IN_REVIEW')).toBe(false);
  });
});
