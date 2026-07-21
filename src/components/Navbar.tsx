import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { DISCORD_URL, ORG_NAME, ORG_ABBR } from '../data';

const links = [
  { href: '#home', label: 'Home' },
  { href: '#divisions', label: 'Divisions' },
  { href: '#command', label: 'Command' },
  { href: '#partners', label: 'Partners' },
  { href: '#about', label: 'About' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-zinc-950/85 backdrop-blur-xl border-b border-zinc-800/80'
          : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-8">
        <a href="#home" className="flex items-center gap-3 group">
          <img
            src="/CSO_CORPORATION_LOGO_1-2.png"
            alt={`${ORG_ABBR} Corporation Logo`}
            className="h-10 w-10 object-contain brightness-0 invert opacity-90 group-hover:opacity-100 transition-opacity"
          />
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-wide text-white">
              {ORG_ABBR} Corporation
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              Roblox · ERLC
            </span>
          </span>
        </a>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-md px-3.5 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800/60 hover:text-white"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="hidden items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 sm:inline-flex"
          >
            Member Portal
          </a>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-[#4752c4] hover:shadow-indigo-500/40 hover:-translate-y-0.5"
          >
            <DiscordIcon className="h-4 w-4" />
            Join Discord
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/60 text-zinc-200 md:hidden"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl">
          <ul className="space-y-1 px-5 py-4">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white"
              >
                <DiscordIcon className="h-4 w-4" />
                Join Discord
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
