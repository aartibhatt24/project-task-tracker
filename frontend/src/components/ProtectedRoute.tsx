import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Role } from '../types/auth';

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  // Deliberately does not preserve "return to the page you were on" via location state:
  // this app is commonly used from a shared browser where one user signs out and a
  // different one signs in, so always landing on the dashboard after login is the more
  // predictable behavior than resuming whatever page the previous session happened to be
  // on. It also avoids a real race this app used to have — see docs/decisions.md.
  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
