import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const navLinks = [
  { to: '/portal', label: 'Dashboard' },
  { to: '/portal/shifts', label: 'Start Shift' },
  { to: '/portal/loa', label: 'Leave of Absence' },
  { to: '/portal/personnel-suggestions', label: 'Personnel Suggestions' },
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const isStaff = profile?.access_level === 'staff' || profile?.access_level === 'command';
  const links = isStaff ? [...navLinks, { to: '/portal/admin', label: 'Admin' }] : navLinks;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800/80 bg-zinc-900/40">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3 lg:px-8">
          <Link to="/portal" className="text-sm font-bold tracking-wide text-white">
            CSO Portal
          </Link>
          <nav className="flex flex-1 items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  location.pathname === l.to
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="hidden text-xs text-zinc-500 sm:inline">
            {profile?.discord_username ?? '...'}
          </span>
          <button
            onClick={signOut}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8">{children}</main>
    </div>
  );
}
