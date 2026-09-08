import { apiClient } from '../lib/apiClient';
import { ProjectMemberUser } from '../types/domain';

export async function listUsers(): Promise<ProjectMemberUser[]> {
  const res = await apiClient.get<{ data: ProjectMemberUser[] }>('/users');
  return res.data.data;
}
