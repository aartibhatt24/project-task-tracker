import { apiClient } from '../lib/apiClient';
import { TaskHistoryEntry } from '../types/domain';

export async function listHistory(taskId: string): Promise<TaskHistoryEntry[]> {
  const res = await apiClient.get<{ data: TaskHistoryEntry[] }>(`/tasks/${taskId}/history`);
  return res.data.data;
}

export async function addComment(taskId: string, text: string): Promise<TaskHistoryEntry> {
  const res = await apiClient.post<{ data: TaskHistoryEntry }>(`/tasks/${taskId}/comments`, {
    text,
  });
  return res.data.data;
}
