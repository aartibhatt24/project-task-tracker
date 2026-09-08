import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useAuth } from '../hooks/useAuth';
import { getApiErrorMessage } from '../lib/apiClient';
import { archiveProject, createProject, listProjects, restoreProject } from '../services/projectsApi';

export default function ProjectsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects', includeArchived],
    queryFn: () => listProjects(includeArchived),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveProject,
    onSuccess: () => {
      toast.success('Project archived.');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const restoreMutation = useMutation({
    mutationFn: restoreProject,
    onSuccess: () => {
      toast.success('Project restored.');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
        {isManager && (
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            {showCreate ? 'Cancel' : 'New Project'}
          </button>
        )}
      </div>

      {showCreate && isManager && (
        <CreateProjectForm
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['projects'] });
          }}
        />
      )}

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
          className="rounded border-slate-300"
        />
        Show archived
      </label>

      {isLoading && <LoadingState />}
      {error && <ErrorState message={getApiErrorMessage(error)} onRetry={() => refetch()} />}
      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState title="No projects yet" description="Create a project to get started." />
      )}

      {data && data.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-300"
            >
              <Link to={`/projects/${p.id}`} className="block">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">
                    {p.key}
                  </span>
                  {p.archived && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      Archived
                    </span>
                  )}
                </div>
                <p className="mt-2 font-medium text-slate-900">{p.name}</p>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description}</p>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  {p._count?.tasks ?? 0} tasks &middot; {p._count?.members ?? 0} members
                </p>
              </Link>
              {isManager && (
                <div className="mt-3 flex gap-2">
                  {p.archived ? (
                    <button
                      onClick={() => restoreMutation.mutate(p.id)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      onClick={() => archiveMutation.mutate(p.id)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      Archive
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateProjectForm({ onCreated }: { onCreated: () => void }) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => createProject({ key, name, description: description || undefined }),
    onSuccess: () => {
      toast.success('Project created.');
      onCreated();
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="key" className="block text-xs font-medium text-slate-600">
            Key
          </label>
          <input
            id="key"
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ENG"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="name" className="block text-xs font-medium text-slate-600">
            Name
          </label>
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor="description" className="block text-xs font-medium text-slate-600">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {mutation.isPending ? 'Creating…' : 'Create project'}
      </button>
    </form>
  );
}
