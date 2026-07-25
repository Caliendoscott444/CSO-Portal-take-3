import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { NavLink, Link } from 'react-router-dom';
import { DISCORD_URL, ORG_ABBR } from '../data';

const links = [
  { to: '/', label: 'Home' },
  { to: '/applications', label: 'Applications' },
  { to: '/divisions', label: 'Divisions' },
  { to: '/personnel', label: 'Personnel' },
  { to: '/command', label: 'Command' },
  { to: '/partners', label: 'Partners' },
  { to: '/pictures', label: 'Pictures' },
  { to: '/suggestions', label: 'Suggestions' },
  { to: '/about', label: 'About' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#0a0f1c]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 lg:px-8">
        <Link to="/" className="flex items-center gap-3 group">
          <img
            src="/CSO_CORPORATION_LOGO_1-2.png"
            alt={`${ORG_ABBR} Corporation Logo`}
            className="h-9 w-9 object-contain opacity-90 group-hover:opacity-100 transition-opacity"
          />
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-wide text-white">
              Comet Strategic Operations
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-amber-400">
              {ORG_ABBR} Corporation
            </span>
          </span>
        </Link>

        <ul className="hidden items-center gap-1 rounded-full bg-white/5 p-1 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                end={l.to === '/'}
                className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-100"
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-sm font-semibold text-zinc-300 transition-colors hover:text-white sm:inline-flex"
          >
            Discord
          </a>
          <Link
            to="/login"
            className="hidden items-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950 transition-all hover:bg-amber-300 sm:inline-flex"
          >
            {ORG_ABBR} Panel
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-zinc-200 md:hidden"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden border-t border-white/10 bg-[#0a0f1c]">
          <ul className="space-y-1 px-5 py-4">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.to === '/'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
            <li>
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-3 text-sm font-bold text-zinc-950"
              >
                {ORG_ABBR} Panel
              </Link>
            </li>
            <li>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-center text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white"
              >
                Discord
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

export function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.369a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.245.198.372.292a.077.077 0 0 1-.006.127c-.598.349-1.22.645-1.873.892a.076.076 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
