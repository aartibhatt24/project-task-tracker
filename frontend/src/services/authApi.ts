import { apiClient } from '../lib/apiClient';
import { User } from '../types/auth';

export async function loginRequest(email: string, password: string): Promise<User> {
  const res = await apiClient.post<{ user: User }>('/auth/login', { email, password });
  return res.data.user;
}

export async function logoutRequest(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function meRequest(): Promise<User> {
  const res = await apiClient.get<{ user: User }>('/auth/me');
  return res.data.user;
}
