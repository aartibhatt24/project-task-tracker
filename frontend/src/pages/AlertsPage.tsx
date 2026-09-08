import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PriorityBadge } from '../components/Badge';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { getApiErrorMessage } from '../lib/apiClient';
import { dismissAlert, listAlerts } from '../services/alertsApi';

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['alerts'], queryFn: listAlerts });

  const dismissMutation = useMutation({
    mutationFn: dismissAlert,
    onSuccess: () => {
      toast.success('Alert dismissed.');
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Alerts</h1>
      <p className="text-sm text-slate-500">Overdue tasks assigned to you.</p>

      {isLoading && <LoadingState />}
      {error && <ErrorState message={getApiErrorMessage(error)} onRetry={() => refetch()} />}
      {data && data.data.length === 0 && (
        <EmptyState title="No active alerts" description="You're all caught up on overdue tasks." />
      )}

      {data && data.data.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {data.data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <Link to={`/tasks/${t.id}`} className="font-medium text-slate-800 hover:text-indigo-600">
                  {t.title}
                </Link>
                <p className="text-xs text-slate-500">
                  {t.project.key} &middot; due {t.dueDate && new Date(t.dueDate).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PriorityBadge priority={t.priority} />
                <button
                  onClick={() => dismissMutation.mutate(t.id)}
                  disabled={dismissMutation.isPending}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
