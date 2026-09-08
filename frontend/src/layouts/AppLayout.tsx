import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { listAlerts } from '../services/alertsApi';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/projects', label: 'Projects', icon: '▣' },
  { to: '/tasks', label: 'All Tasks', icon: '≡' },
  { to: '/my-tasks', label: 'My Tasks', icon: '★' },
  { to: '/alerts', label: 'Alerts', icon: '⚠' },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: alerts } = useQuery({
    queryKey: ['alerts', 'badge'],
    queryFn: listAlerts,
    refetchInterval: 60_000,
  });

  async function handleLogout() {
    await logout();
    toast.success('Signed out.');
  }

  const navLinks = (onClick?: () => void) => (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onClick}
          className={({ isActive }) =>
            clsx(
              'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium',
              isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100',
            )
          }
        >
          <span className="flex items-center gap-2">
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </span>
          {item.to === '/alerts' && alerts && alerts.count > 0 && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
              {alerts.count}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-col border-r border-slate-200 bg-white py-4 md:flex">
        <div className="px-4 pb-4">
          <p className="text-sm font-semibold text-slate-900">Task Tracker</p>
        </div>
        {navLinks()}
        <div className="mt-auto border-t border-slate-200 px-4 pt-4">
          <p className="truncate text-sm font-medium text-slate-800">{user?.name}</p>
          <p className="truncate text-xs text-slate-500">{user?.role}</p>
          <button
            onClick={handleLogout}
            className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="flex flex-1 flex-col md:hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            ☰
          </button>
          <p className="text-sm font-semibold">Task Tracker</p>
          {alerts && alerts.count > 0 ? (
            <NavLink to="/alerts" className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
              {alerts.count}
            </NavLink>
          ) : (
            <span className="w-6" />
          )}
        </header>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div className="w-64 bg-white py-4 shadow-xl">
              <div className="flex items-center justify-between px-4 pb-4">
                <p className="text-sm font-semibold">Menu</p>
                <button aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
                  ✕
                </button>
              </div>
              {navLinks(() => setMobileOpen(false))}
              <div className="mt-4 border-t border-slate-200 px-4 pt-4">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <button
                  onClick={handleLogout}
                  className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>
            </div>
            <div className="flex-1 bg-black/30" onClick={() => setMobileOpen(false)} />
          </div>
        )}
      </div>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
