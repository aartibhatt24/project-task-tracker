import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StatusBadge } from '../components/Badge';
import { ErrorState, LoadingState } from '../components/States';
import {
  getAssigneeBreakdown,
  getCompletionsTrend,
  getStatusBreakdown,
  getSummary,
} from '../services/dashboardApi';
import { getApiErrorMessage } from '../lib/apiClient';
import { Status } from '../types/domain';

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const summaryQuery = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: getSummary });
  const statusQuery = useQuery({ queryKey: ['dashboard', 'status'], queryFn: getStatusBreakdown });
  const assigneeQuery = useQuery({
    queryKey: ['dashboard', 'assignees'],
    queryFn: getAssigneeBreakdown,
  });
  const completionsQuery = useQuery({
    queryKey: ['dashboard', 'completions'],
    queryFn: getCompletionsTrend,
  });

  const loading =
    summaryQuery.isLoading ||
    statusQuery.isLoading ||
    assigneeQuery.isLoading ||
    completionsQuery.isLoading;
  const error = summaryQuery.error || statusQuery.error || assigneeQuery.error || completionsQuery.error;

  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (error) return <ErrorState message={getApiErrorMessage(error)} />;

  const summary = summaryQuery.data!;
  const statusData = statusQuery.data!;
  const assigneeData = assigneeQuery.data!;
  const completions = completionsQuery.data!;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open tasks" value={summary.openTasks} />
        <StatCard label="Overdue" value={summary.overdueTasks} tone="text-red-600" />
        <StatCard label="Due this week" value={summary.dueThisWeek} tone="text-amber-600" />
        <StatCard label="Completed this week" value={summary.completedThisWeek} tone="text-green-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Tasks by status</h2>
          {statusData.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No tasks yet.</p>
          ) : (
            <>
              <div className="mt-2 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {statusData.map((s) => (
                  <li key={s.status} className="flex items-center gap-1 text-xs text-slate-600">
                    <StatusBadge status={s.status as Status} /> {s.count}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Tasks by assignee</h2>
          {assigneeData.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No assigned tasks yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {assigneeData.map((a) => (
                <li key={a.user.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{a.user.name}</span>
                  <span className="font-medium text-slate-900">{a.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Completions — last 8 weeks</h2>
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={completions.map((c, i) => ({ ...c, week: `W${i + 1}` }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#16a34a" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
