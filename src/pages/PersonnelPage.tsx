import { useMemo, useState } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import PageHero from '../components/PageHero';
import {
  personnelRoster,
  personnelDivisions,
  type PersonnelStatus,
} from '../data';

const statusStyles: Record<PersonnelStatus, string> = {
  Active: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30',
  'Leave of Absence': 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30',
  Inactive: 'bg-zinc-700/30 text-zinc-400 ring-1 ring-zinc-600/40',
};

export default function PersonnelPage() {
  const [query, setQuery] = useState('');
  const [division, setDivision] = useState<(typeof personnelDivisions)[number]>(
    'All divisions',
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return personnelRoster.filter((m) => {
      const matchesDivision = division === 'All divisions' || m.division === division;
      const matchesQuery =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.callsign.toLowerCase().includes(q) ||
        m.rank.toLowerCase().includes(q);
      return matchesDivision && matchesQuery;
    });
  }, [query, division]);

  return (
    <>
      <PageHero
        theme="personnel"
        eyebrow="Live Personnel Database"
        title="Personnel Roster"
        subtitle="Current callsigns, ranks, and division assignments of active CSO personnel."
        tags={['Live Roster', 'Real-Time Status', 'All Divisions']}
      />

      <section className="relative py-16 lg:py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <div className="grid gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:grid-cols-[1fr,220px] sm:p-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Search Roster
              </label>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5">
                <Search className="h-4 w-4 shrink-0 text-zinc-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, callsign, or rank"
                  className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Division
              </label>
              <select
                value={division}
                onChange={(e) =>
                  setDivision(e.target.value as (typeof personnelDivisions)[number])
                }
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/40"
              >
                {personnelDivisions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="mt-5 text-sm text-zinc-500">
            Showing {filtered.length} of {personnelRoster.length} members
          </p>

          <div className="mt-4 grid gap-4">
            {filtered.map((m) => (
              <div
                key={m.callsign}
                className="flex flex-col gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 transition-colors hover:border-zinc-700 hover:bg-zinc-900/70 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-xs font-semibold text-amber-300">
                        {m.callsign}
                      </span>
                      <h3 className="text-base font-bold text-white">{m.name}</h3>
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">
                      {m.rank} · {m.division}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex w-fit items-center rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${statusStyles[m.status]}`}
                >
                  {m.status}
                </span>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-8 text-center text-sm text-zinc-500">
                No personnel match that search. Try a different name, callsign, or division.
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
