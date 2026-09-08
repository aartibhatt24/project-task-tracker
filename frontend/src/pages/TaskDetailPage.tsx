import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PriorityBadge, StatusBadge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState, LoadingState } from '../components/States';
import { useAuth } from '../hooks/useAuth';
import { getApiErrorMessage } from '../lib/apiClient';
import { addComment, listHistory } from '../services/historyApi';
import { getProject } from '../services/projectsApi';
import {
  addDependency,
  deleteTask,
  getTask,
  listDependencies,
  listTasks,
  setTaskAssignees,
  updateTask,
  updateTaskStatus,
} from '../services/tasksApi';
import { Priority, Status } from '../types/domain';
import { legalNextStatuses } from '../utils/lifecycle';

const STATUS_LABELS: Record<Status, string> = {
  BACKLOG: 'Backlog',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  BLOCKED: 'Blocked',
  DONE: 'Done',
};

function describeHistory(entry: import('../types/domain').TaskHistoryEntry): string {
  switch (entry.type) {
    case 'CREATED':
      return 'created this task';
    case 'STATUS_CHANGE':
      return `changed status from ${entry.oldValue} to ${entry.newValue}`;
    case 'FIELD_CHANGE':
      return `changed ${entry.field} from "${entry.oldValue ?? '—'}" to "${entry.newValue ?? '—'}"`;
    case 'ASSIGNED':
      return 'assigned a user';
    case 'UNASSIGNED':
      return 'unassigned a user';
    case 'COMMENT':
      return 'commented';
    default:
      return entry.type;
  }
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingAssignees, setEditingAssignees] = useState(false);
  const [commentText, setCommentText] = useState('');

  const taskQuery = useQuery({ queryKey: ['task', id], queryFn: () => getTask(id!), enabled: !!id });
  const historyQuery = useQuery({
    queryKey: ['task', id, 'history'],
    queryFn: () => listHistory(id!),
    enabled: !!id,
  });
  const depsQuery = useQuery({
    queryKey: ['task', id, 'dependencies'],
    queryFn: () => listDependencies(id!),
    enabled: !!id,
  });

  const task = taskQuery.data;

  const projectQuery = useQuery({
    queryKey: ['project', task?.projectId],
    queryFn: () => getProject(task!.projectId),
    enabled: !!task,
  });
  const projectTasksQuery = useQuery({
    queryKey: ['tasks', 'byProject', task?.projectId, 'forDeps'],
    queryFn: () => listTasks({ projectId: task!.projectId, pageSize: 100 }),
    enabled: !!task,
  });

  function invalidateTask() {
    queryClient.invalidateQueries({ queryKey: ['task', id] });
    queryClient.invalidateQueries({ queryKey: ['task', id, 'history'] });
    queryClient.invalidateQueries({ queryKey: ['alerts', 'badge'] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: Status) => updateTaskStatus(id!, status),
    onSuccess: () => {
      toast.success('Status updated.');
      invalidateTask();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(id!),
    onSuccess: () => {
      toast.success('Task deleted.');
      navigate(task ? `/projects/${task.projectId}` : '/tasks');
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const commentMutation = useMutation({
    mutationFn: (text: string) => addComment(id!, text),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['task', id, 'history'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const assigneesMutation = useMutation({
    mutationFn: (userIds: string[]) => setTaskAssignees(id!, userIds),
    onSuccess: () => {
      toast.success('Assignees updated.');
      setEditingAssignees(false);
      invalidateTask();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const dependencyMutation = useMutation({
    mutationFn: (blockerTaskId: string) => addDependency(id!, blockerTaskId),
    onSuccess: () => {
      toast.success('Dependency added.');
      queryClient.invalidateQueries({ queryKey: ['task', id, 'dependencies'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  if (taskQuery.isLoading) return <LoadingState />;
  if (taskQuery.error)
    return <ErrorState message={getApiErrorMessage(taskQuery.error)} onRetry={() => taskQuery.refetch()} />;
  if (!task) return null;

  const nextStatuses = legalNextStatuses(task.status, task.blockedFromStatus);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/projects/${task.projectId}`} className="text-xs font-medium text-indigo-600 hover:underline">
          &larr; {task.project.key}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{task.title}</h1>
          {isManager && (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing((v) => !v)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {task.dueDate && (
            <span className={`text-xs ${isOverdue ? 'font-medium text-red-600' : 'text-slate-500'}`}>
              Due {new Date(task.dueDate).toLocaleDateString()}
              {isOverdue ? ' (overdue)' : ''}
            </span>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this task?"
        description="This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          deleteMutation.mutate();
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      {editing ? (
        <EditTaskForm
          task={task}
          onSaved={() => {
            setEditing(false);
            invalidateTask();
          }}
        />
      ) : (
        task.description && <p className="whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Status</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['BACKLOG', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'] as Status[]).map((s) => {
            const legal = nextStatuses.includes(s);
            const current = s === task.status;
            return (
              <button
                key={s}
                disabled={!legal || statusMutation.isPending}
                onClick={() => statusMutation.mutate(s)}
                title={!legal && !current ? 'Not a legal transition from the current status' : undefined}
                className={
                  current
                    ? 'rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white'
                    : legal
                      ? 'rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100'
                      : 'cursor-not-allowed rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-300'
                }
              >
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Assignees</h2>
            {isManager && (
              <button
                onClick={() => setEditingAssignees((v) => !v)}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                {editingAssignees ? 'Cancel' : 'Manage'}
              </button>
            )}
          </div>
          {editingAssignees && projectQuery.data ? (
            <AssigneeEditor
              members={projectQuery.data.members}
              current={task.assignees.map((a) => a.userId)}
              saving={assigneesMutation.isPending}
              onSave={(ids) => assigneesMutation.mutate(ids)}
            />
          ) : task.assignees.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Unassigned.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {task.assignees.map((a) => (
                <li key={a.id} className="text-sm text-slate-700">
                  {a.user.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Dependencies</h2>
          <div className="mt-2 space-y-2 text-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">Blocked by</p>
              {depsQuery.data?.blockedBy.length ? (
                <ul className="mt-1 space-y-1">
                  {depsQuery.data.blockedBy.map((b) => (
                    <li key={b.id} className="flex items-center gap-2">
                      <Link to={`/tasks/${b.id}`} className="text-indigo-600 hover:underline">
                        {b.title}
                      </Link>
                      <StatusBadge status={b.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400">None</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Blocks</p>
              {depsQuery.data?.blocks.length ? (
                <ul className="mt-1 space-y-1">
                  {depsQuery.data.blocks.map((b) => (
                    <li key={b.id} className="flex items-center gap-2">
                      <Link to={`/tasks/${b.id}`} className="text-indigo-600 hover:underline">
                        {b.title}
                      </Link>
                      <StatusBadge status={b.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400">None</p>
              )}
            </div>
          </div>
          {isManager && projectTasksQuery.data && (
            <AddDependencyForm
              candidates={projectTasksQuery.data.data.filter((t) => t.id !== task.id)}
              saving={dependencyMutation.isPending}
              onAdd={(blockerId) => dependencyMutation.mutate(blockerId)}
            />
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">History &amp; comments</h2>
        {historyQuery.isLoading && <LoadingState />}
        {historyQuery.data && (
          <ol className="mt-3 space-y-3">
            {historyQuery.data.map((h) => (
              <li key={h.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                <p className="text-slate-700">
                  <span className="font-medium">{h.actor.name}</span> {describeHistory(h)}
                </p>
                {h.type === 'COMMENT' && h.newValue && (
                  <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{h.newValue}</p>
                )}
                <p className="text-xs text-slate-400">{new Date(h.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ol>
        )}

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (commentText.trim()) commentMutation.mutate(commentText.trim());
          }}
        >
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={commentMutation.isPending || !commentText.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            Comment
          </button>
        </form>
      </div>
    </div>
  );
}

function EditTaskForm({
  task,
  onSaved,
}: {
  task: import('../types/domain').TaskSummary;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      updateTask(task.id, {
        title,
        description: description || null,
        priority,
        dueDate: dueDate || null,
      }),
    onSuccess: () => {
      toast.success('Task updated.');
      onSaved();
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        mutation.mutate();
      }}
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-4"
    >
      <input
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        Save
      </button>
    </form>
  );
}

function AssigneeEditor({
  members,
  current,
  saving,
  onSave,
}: {
  members: { id: string; name: string }[];
  current: string[];
  saving: boolean;
  onSave: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(current));

  return (
    <div className="mt-2 space-y-2">
      {members.map((m) => (
        <label key={m.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.has(m.id)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(m.id);
              else next.delete(m.id);
              setSelected(next);
            }}
            className="rounded border-slate-300"
          />
          {m.name}
        </label>
      ))}
      <button
        disabled={saving}
        onClick={() => onSave([...selected])}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        Save assignees
      </button>
    </div>
  );
}

function AddDependencyForm({
  candidates,
  saving,
  onAdd,
}: {
  candidates: { id: string; title: string }[];
  saving: boolean;
  onAdd: (id: string) => void;
}) {
  const [blockerId, setBlockerId] = useState('');
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (blockerId) onAdd(blockerId);
      }}
    >
      <select
        value={blockerId}
        onChange={(e) => setBlockerId(e.target.value)}
        className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
      >
        <option value="">Add blocker…</option>
        {candidates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={saving || !blockerId}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
      >
        Add
      </button>
    </form>
  );
}
