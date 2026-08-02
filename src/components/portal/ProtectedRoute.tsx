import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, portalAccess, portalAccessReason, signOut } = useAuth();

  if (loading || (session && portalAccess === null)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (portalAccess === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-red-400">
            Access Restricted
          </p>
          <h1 className="mt-2 text-lg font-bold text-white">You don't have portal access</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {portalAccessReason ?? 'You do not have the required Discord role to access the portal.'}
          </p>
          <button
            onClick={signOut}
            className="mt-5 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-red-500/40 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
