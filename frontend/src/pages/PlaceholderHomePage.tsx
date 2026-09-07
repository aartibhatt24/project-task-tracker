import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';

// Temporary landing page for the authenticated shell. Replaced by the real Dashboard page
// once the dashboard analytics API exists (see docs/plan.md phase 14).
export default function PlaceholderHomePage() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    toast.success('Signed out.');
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Welcome, {user?.name}</h1>
          <p className="text-sm text-slate-500">
            Signed in as {user?.email} ({user?.role})
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
