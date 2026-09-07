import { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requireRole } from '../../src/middleware/auth';

function mockReq(user?: { role: 'MANAGER' | 'MEMBER' }): Request {
  return { user: user as any } as Request;
}

describe('requireRole middleware', () => {
  it('calls next() with no error when the user has an allowed role', () => {
    const req = mockReq({ role: 'MANAGER' });
    const next = vi.fn();
    requireRole('MANAGER')(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(AppError 403) when the user role is not allowed', () => {
    const req = mockReq({ role: 'MEMBER' });
    const next = vi.fn();
    requireRole('MANAGER')(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('calls next(AppError 401) when there is no authenticated user at all', () => {
    const req = mockReq(undefined);
    const next = vi.fn();
    requireRole('MANAGER')(req, {} as Response, next);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
  });

  it('accepts multiple allowed roles', () => {
    const req = mockReq({ role: 'MEMBER' });
    const next = vi.fn();
    requireRole('MANAGER', 'MEMBER')(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
