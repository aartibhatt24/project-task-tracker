import { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { signSessionToken } from '../../src/utils/jwt';
import { loginAndGetCookie } from '../helpers/auth';
import { TEST_PASSWORD, createUser } from '../helpers/factories';
import { resetDb, testPrisma } from '../helpers/testDb';

describe('authentication', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await testPrisma.$disconnect();
  });

  it('logs in a manager with valid credentials', async () => {
    const manager = await createUser({ role: 'MANAGER', name: 'Mgr' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: manager.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('MANAGER');
    expect(res.body.user.email).toBe(manager.email);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('logs in a member with valid credentials', async () => {
    const member = await createUser({ role: 'MEMBER' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: member.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('MEMBER');
  });

  it('rejects an invalid password', async () => {
    const member = await createUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: member.email, password: 'wrong-password' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with the same error as a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a malformed login payload', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects GET /api/auth/me without a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current user for a valid session', async () => {
    const member = await createUser({ role: 'MEMBER', name: 'Session User' });
    const cookie = await loginAndGetCookie(app, member.email, TEST_PASSWORD);

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(member.id);
    expect(res.body.user.name).toBe('Session User');
  });

  it('rejects a session token for a user that no longer exists', async () => {
    const token = signSessionToken({ userId: 'does-not-exist' });
    const res = await request(app).get('/api/auth/me').set('Cookie', `session=${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects a garbage/tampered session cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'session=not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('reflects a role change on the very next request (role is never trusted from an old token)', async () => {
    const user = await createUser({ role: 'MEMBER' });
    const cookie = await loginAndGetCookie(app, user.email, TEST_PASSWORD);

    let res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.body.user.role).toBe('MEMBER');

    await testPrisma.user.update({ where: { id: user.id }, data: { role: 'MANAGER' } });

    res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.body.user.role).toBe('MANAGER');
  });

  it('logs out and invalidates the session cookie client-side', async () => {
    const member = await createUser();
    const cookie = await loginAndGetCookie(app, member.email, TEST_PASSWORD);

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(logoutRes.status).toBe(204);
    expect(logoutRes.headers['set-cookie'][0]).toMatch(/session=;/);
  });
});
