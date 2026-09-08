import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PriorityBadge, StatusBadge } from './Badge';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Pagination } from './Pagination';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL, getApiErrorMessage } from '../lib/apiClient';
import { listProjects } from '../services/projectsApi';
import { bulkUpdateTasks, csvExportUrl, listTasks, TaskQueryParams } from '../services/tasksApi';
import { listUsers } from '../services/usersApi';
import { Priority, Status } from '../types/domain';

const STATUSES: Status[] = ['BACKLOG', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

interface TaskExplorerProps {
  title: string;
  lockedAssigneeId?: string;
  emptyTitle: string;
  emptyDescription?: string;
}

export function TaskExplorer({ title, lockedAssigneeId, emptyTitle, emptyDescription }: TaskExplorerProps) {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [overdue, setOverdue] = useState(false);
  const [sortBy, setSortBy] = useState<TaskQueryParams['sortBy']>('updatedAt');
  const [sortOrder, setSortOrder] = useState<TaskQueryParams['sortOrder']>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const query: TaskQueryParams = {
    search: search || undefined,
    projectId: projectId || undefined,
    status: status || undefined,
    assigneeId: lockedAssigneeId ?? (assigneeId || undefined),
    priority: priority || undefined,
    overdue: overdue || undefined,
    sortBy,
    sortOrder,
    page,
    pageSize: 20,
  };

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'list', query],
    queryFn: () => listTasks(query),
  });

  const projectsQuery = useQuery({ queryKey: ['projects', false], queryFn: () => listProjects(false) });
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers, enabled: !lockedAssigneeId });

  function resetPageAnd<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  function toggleSelected(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleSelectAll() {
    if (!tasksQuery.data) return;
    const pageIds = tasksQuery.data.data.map((t) => t.id);
    const allSelected = pageIds.every((id) => selected.has(id));
    const next = new Set(selected);
    if (allSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSelected(next);
  }

  async function runBulkStatus(newStatus: Status) {
    setBulkBusy(true);
    try {
      const result = await bulkUpdateTasks([...selected], { status: newStatus });
      toast.success(`${result.successful.length} updated, ${result.failed.length} failed.`);
      if (result.failed.length > 0) {
        result.failed.slice(0, 3).forEach((f) => toast.error(`${f.taskId}: ${f.reason}`));
      }
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  }

  const exportUrl = csvExportUrl(query, API_BASE_URL);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <a
          href={exportUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </a>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => resetPageAnd(setSearch)(e.target.value)}
          className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm lg:col-span-1"
        />
        <select
          value={projectId}
          onChange={(e) => resetPageAnd(setProjectId)(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All projects</option>
          {projectsQuery.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.key}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => resetPageAnd(setStatus)(e.target.value as Status | '')}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => resetPageAnd(setPriority)(e.target.value as Priority | '')}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {!lockedAssigneeId && (
          <select
            value={assigneeId}
            onChange={(e) => resetPageAnd(setAssigneeId)(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">All assignees</option>
            {usersQuery.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => resetPageAnd(setOverdue)(e.target.checked)}
            className="rounded border-slate-300"
          />
          Overdue only
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Sort by</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as TaskQueryParams['sortBy'])}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="updatedAt">Last updated</option>
          <option value="dueDate">Due date</option>
          <option value="priority">Priority</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as TaskQueryParams['sortOrder'])}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      {isManager && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-indigo-50 px-3 py-2 text-sm">
          <span className="font-medium text-indigo-800">{selected.size} selected</span>
          <span className="text-indigo-400">Set status:</span>
          {STATUSES.map((s) => (
            <button
              key={s}
              disabled={bulkBusy}
              onClick={() => runBulkStatus(s)}
              className="rounded border border-indigo-300 bg-white px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-indigo-500 hover:underline">
            Clear
          </button>
        </div>
      )}

      {tasksQuery.isLoading && <LoadingState />}
      {tasksQuery.error && (
        <ErrorState message={getApiErrorMessage(tasksQuery.error)} onRetry={() => tasksQuery.refetch()} />
      )}
      {tasksQuery.data && tasksQuery.data.data.length === 0 && (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}

      {tasksQuery.data && tasksQuery.data.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {isManager && (
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={tasksQuery.data.data.every((t) => selected.has(t.id))}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                )}
                <th className="px-3 py-2 text-left font-medium text-slate-600">Title</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Project</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Priority</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Due</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Assignees</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasksQuery.data.data.map((t) => {
                const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE';
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    {isManager && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggleSelected(t.id)}
                          className="rounded border-slate-300"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <Link to={`/tasks/${t.id}`} className="font-medium text-slate-800 hover:text-indigo-600">
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{t.project.key}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-3 py-2">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className={`px-3 py-2 ${isOverdue ? 'font-medium text-red-600' : 'text-slate-500'}`}>
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {t.assignees.map((a) => a.user.name).join(', ') || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination
            page={tasksQuery.data.page}
            totalPages={tasksQuery.data.totalPages}
            total={tasksQuery.data.total}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
