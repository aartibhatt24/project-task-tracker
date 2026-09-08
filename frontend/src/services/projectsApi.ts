import { apiClient } from '../lib/apiClient';
import { ProjectDetail, ProjectSummary } from '../types/domain';

export async function listProjects(includeArchived = false): Promise<ProjectSummary[]> {
  const res = await apiClient.get<{ data: ProjectSummary[] }>('/projects', {
    params: includeArchived ? { includeArchived: 'true' } : undefined,
  });
  return res.data.data;
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const res = await apiClient.get<{ data: ProjectDetail }>(`/projects/${id}`);
  return res.data.data;
}

export async function createProject(input: {
  key: string;
  name: string;
  description?: string;
}): Promise<ProjectSummary> {
  const res = await apiClient.post<{ data: ProjectSummary }>('/projects', input);
  return res.data.data;
}

export async function updateProject(
  id: string,
  input: { name?: string; description?: string | null },
): Promise<ProjectSummary> {
  const res = await apiClient.patch<{ data: ProjectSummary }>(`/projects/${id}`, input);
  return res.data.data;
}

export async function archiveProject(id: string): Promise<ProjectSummary> {
  const res = await apiClient.post<{ data: ProjectSummary }>(`/projects/${id}/archive`);
  return res.data.data;
}

export async function restoreProject(id: string): Promise<ProjectSummary> {
  const res = await apiClient.post<{ data: ProjectSummary }>(`/projects/${id}/restore`);
  return res.data.data;
}

export async function addProjectMember(projectId: string, userId: string): Promise<void> {
  await apiClient.post(`/projects/${projectId}/members`, { userId });
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/members/${userId}`);
}
