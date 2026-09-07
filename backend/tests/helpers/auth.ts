import { Express } from 'express';
import request from 'supertest';

export async function loginAndGetCookie(
  app: Express,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const setCookie = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!cookieHeader) {
    throw new Error('Login did not set a session cookie.');
  }
  return cookieHeader.split(';')[0];
}
