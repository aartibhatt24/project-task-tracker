import { apiClient } from '../lib/apiClient';
import { AssigneeBreakdownEntry, CompletionBucket, DashboardSummary, StatusBreakdownEntry } from '../types/domain';

export async function getSummary(): Promise<DashboardSummary> {
  const res = await apiClient.get<{ data: DashboardSummary }>('/dashboard/summary');
  return res.data.data;
}

export async function getStatusBreakdown(): Promise<StatusBreakdownEntry[]> {
  const res = await apiClient.get<{ data: StatusBreakdownEntry[] }>('/dashboard/status');
  return res.data.data;
}

export async function getAssigneeBreakdown(): Promise<AssigneeBreakdownEntry[]> {
  const res = await apiClient.get<{ data: AssigneeBreakdownEntry[] }>('/dashboard/assignees');
  return res.data.data;
}

export async function getCompletionsTrend(): Promise<CompletionBucket[]> {
  const res = await apiClient.get<{ data: CompletionBucket[] }>('/dashboard/completions');
  return res.data.data;
}
