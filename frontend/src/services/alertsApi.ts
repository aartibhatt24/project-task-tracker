import { apiClient } from '../lib/apiClient';
import { TaskSummary } from '../types/domain';

export async function listAlerts(): Promise<{ data: TaskSummary[]; count: number }> {
  const res = await apiClient.get<{ data: TaskSummary[]; count: number }>('/alerts');
  return res.data;
}

export async function dismissAlert(taskId: string): Promise<void> {
  await apiClient.post(`/alerts/${taskId}/dismiss`);
}
