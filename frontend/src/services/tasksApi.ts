import { apiClient } from '../lib/apiClient';
import { BulkResult, PagedResult, Priority, Status, TaskDependencySummary, TaskSummary } from '../types/domain';

export interface TaskQueryParams {
  search?: string;
  projectId?: string;
  status?: Status;
  assigneeId?: string;
  priority?: Priority;
  overdue?: boolean;
  sortBy?: 'dueDate' | 'priority' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

function toParams(query: TaskQueryParams) {
  const params: Record<string, string> = {};
  if (query.search) params.search = query.search;
  if (query.projectId) params.projectId = query.projectId;
  if (query.status) params.status = query.status;
  if (query.assigneeId) params.assigneeId = query.assigneeId;
  if (query.priority) params.priority = query.priority;
  if (query.overdue !== undefined) params.overdue = String(query.overdue);
  if (query.sortBy) params.sortBy = query.sortBy;
  if (query.sortOrder) params.sortOrder = query.sortOrder;
  if (query.page) params.page = String(query.page);
  if (query.pageSize) params.pageSize = String(query.pageSize);
  return params;
}

export async function listTasks(query: TaskQueryParams): Promise<PagedResult<TaskSummary>> {
  const res = await apiClient.get<PagedResult<TaskSummary>>('/tasks', { params: toParams(query) });
  return res.data;
}

export function csvExportUrl(query: TaskQueryParams, baseUrl: string): string {
  const params = new URLSearchParams(toParams(query));
  return `${baseUrl}/tasks/export.csv?${params.toString()}`;
}

export async function getTask(id: string): Promise<TaskSummary> {
  const res = await apiClient.get<{ data: TaskSummary }>(`/tasks/${id}`);
  return res.data.data;
}

export async function createTask(
  projectId: string,
  input: { title: string; description?: string; priority: Priority; dueDate?: string | null },
): Promise<TaskSummary> {
  const res = await apiClient.post<{ data: TaskSummary }>(`/projects/${projectId}/tasks`, input);
  return res.data.data;
}

export async function updateTask(
  id: string,
  input: Partial<{ title: string; description: string | null; priority: Priority; dueDate: string | null }>,
): Promise<TaskSummary> {
  const res = await apiClient.patch<{ data: TaskSummary }>(`/tasks/${id}`, input);
  return res.data.data;
}

export async function deleteTask(id: string): Promise<void> {
  await apiClient.delete(`/tasks/${id}`);
}

export async function updateTaskStatus(id: string, status: Status): Promise<TaskSummary> {
  const res = await apiClient.post<{ data: TaskSummary }>(`/tasks/${id}/status`, { status });
  return res.data.data;
}

export async function setTaskAssignees(id: string, userIds: string[]) {
  const res = await apiClient.post(`/tasks/${id}/assignees`, { userIds });
  return res.data.data;
}

export async function addDependency(taskId: string, blockerTaskId: string) {
  const res = await apiClient.post(`/tasks/${taskId}/dependencies`, { blockerTaskId });
  return res.data.data;
}

export async function listDependencies(
  taskId: string,
): Promise<{ blockedBy: TaskDependencySummary[]; blocks: TaskDependencySummary[] }> {
  const res = await apiClient.get(`/tasks/${taskId}/dependencies`);
  return res.data.data;
}

export async function bulkUpdateTasks(
  taskIds: string[],
  changes: { status?: Status; assigneeIds?: string[]; dueDate?: string | null },
): Promise<BulkResult> {
  const res = await apiClient.post<BulkResult>('/tasks/bulk', { taskIds, changes });
  return res.data;
}
