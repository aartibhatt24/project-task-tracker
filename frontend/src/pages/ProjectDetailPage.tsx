import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PriorityBadge, StatusBadge } from '../components/Badge';
import { ErrorState, LoadingState } from '../components/States';
import { useAuth } from '../hooks/useAuth';
import { getApiErrorMessage } from '../lib/apiClient';
import {
  addProjectMember,
  archiveProject,
  getProject,
  removeProjectMember,
  restoreProject,
  updateProject,
} from '../services/projectsApi';
import { createTask, listTasks } from '../services/tasksApi';
import { listUsers } from '../services/usersApi';
import { Priority } from '../types/domain';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingProject, setEditingProject] = useState(false);

  const projectQuery = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'byProject', id],
    queryFn: () => listTasks({ projectId: id, pageSize: 50, sortBy: 'updatedAt', sortOrder: 'desc' }),
    enabled: !!id,
  });

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers, enabled: isManager });

  const archiveMutation = useMutation({
    mutationFn: () => archiveProject(id!),
    onSuccess: () => {
      toast.success('Project archived.');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const restoreMutation = useMutation({
    mutationFn: () => restoreProject(id!),
    onSuccess: () => {
      toast.success('Project restored.');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeProjectMember(id!, userId),
    onSuccess: () => {
      toast.success('Member removed and unassigned from project tasks.');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'byProject', id] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  if (projectQuery.isLoading) return <LoadingState />;
  if (projectQuery.error)
    return <ErrorState message={getApiErrorMessage(projectQuery.error)} onRetry={() => projectQuery.refetch()} />;
  const project = projectQuery.data!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">
              {project.key}
            </span>
            {project.archived && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                Archived
              </span>
            )}
          </div>
          {editingProject ? (
            <EditProjectForm
              project={project}
              onSaved={() => {
                setEditingProject(false);
                queryClient.invalidateQueries({ queryKey: ['project', id] });
                queryClient.invalidateQueries({ queryKey: ['projects'] });
              }}
              onCancel={() => setEditingProject(false)}
            />
          ) : (
            <>
              <h1 className="mt-1 text-xl font-semibold text-slate-900">{project.name}</h1>
              {project.description && <p className="mt-1 text-sm text-slate-500">{project.description}</p>}
            </>
          )}
        </div>
        {isManager && !editingProject && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditingProject(true)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Edit
            </button>
            {project.archived ? (
              <button
                onClick={() => restoreMutation.mutate()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                Restore
              </button>
            ) : (
              <button
                onClick={() => setConfirmArchive(true)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                Archive
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmArchive}
        title="Archive this project?"
        description="Archived projects disappear from default views but keep all tasks and history. You can restore it anytime."
        confirmLabel="Archive"
        danger
        onConfirm={() => {
          archiveMutation.mutate();
          setConfirmArchive(false);
        }}
        onCancel={() => setConfirmArchive(false)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
            {isManager && !project.archived && (
              <button
                onClick={() => setShowNewTask((v) => !v)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                {showNewTask ? 'Cancel' : 'New Task'}
              </button>
            )}
          </div>

          {showNewTask && (
            <NewTaskForm
              projectId={project.id}
              onCreated={(taskId) => {
                setShowNewTask(false);
                queryClient.invalidateQueries({ queryKey: ['tasks', 'byProject', id] });
                navigate(`/tasks/${taskId}`);
              }}
            />
          )}

          {tasksQuery.isLoading && <LoadingState />}
          {tasksQuery.data && tasksQuery.data.data.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
              No tasks in this project yet.
            </p>
          )}
          {tasksQuery.data && tasksQuery.data.data.length > 0 && (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {tasksQuery.data.data.map((t) => (
                <li key={t.id}>
                  <Link to={`/tasks/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="truncate text-sm font-medium text-slate-800">{t.title}</span>
                    <span className="flex shrink-0 gap-2">
                      <PriorityBadge priority={t.priority} />
                      <StatusBadge status={t.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Members</h2>
            {isManager && (
              <button
                onClick={() => setShowAddMember((v) => !v)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
              >
                {showAddMember ? 'Cancel' : 'Add member'}
              </button>
            )}
          </div>

          {showAddMember && usersQuery.data && (
            <AddMemberForm
              candidates={usersQuery.data.filter((u) => !project.members.some((m) => m.id === u.id))}
              onAdd={async (userId) => {
                try {
                  await addProjectMember(project.id, userId);
                  toast.success('Member added.');
                  setShowAddMember(false);
                  queryClient.invalidateQueries({ queryKey: ['project', id] });
                } catch (err) {
                  toast.error(getApiErrorMessage(err));
                }
              }}
            />
          )}

          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {project.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.role}</p>
                </div>
                {isManager && (
                  <button
                    onClick={() => removeMemberMutation.mutate(m.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-500"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function EditProjectForm({
  project,
  onSaved,
  onCancel,
}: {
  project: { id: string; name: string; description: string | null };
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => updateProject(project.id, { name, description: description || null }),
    onSuccess: () => {
      toast.success('Project updated.');
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
      className="mt-1 space-y-2"
    >
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function NewTaskForm({ projectId, onCreated }: { projectId: string; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createTask(projectId, { title, priority, dueDate: dueDate || undefined }),
    onSuccess: (task) => {
      toast.success('Task created.');
      onCreated(task.id);
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <input
        required
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
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
        {mutation.isPending ? 'Creating…' : 'Create task'}
      </button>
    </form>
  );
}

function AddMemberForm({
  candidates,
  onAdd,
}: {
  candidates: { id: string; name: string; email: string }[];
  onAdd: (userId: string) => void;
}) {
  const [userId, setUserId] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (userId) onAdd(userId);
      }}
      className="flex gap-2"
    >
      <select
        required
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        <option value="">Select a user…</option>
        {candidates.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.email})
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
      >
        Add
      </button>
    </form>
  );
}
