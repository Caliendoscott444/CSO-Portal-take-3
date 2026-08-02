import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ORG_ABBR } from '../data';

type SubDivisionRow = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  image_url: string | null;
  coming_soon: boolean;
  applications_open: boolean;
  display_order: number;
};

export default function SubDivisionsPage() {
  const [rows, setRows] = useState<SubDivisionRow[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [subDivRes, membersRes] = await Promise.all([
        supabase.from('sub_divisions').select('*').order('display_order', { ascending: true }),
        supabase.from('profiles').select('sub_division_id').eq('is_active', true),
      ]);

      setRows(subDivRes.data ?? []);

      const counts: Record<string, number> = {};
      for (const m of membersRes.data ?? []) {
        if (!m.sub_division_id) continue;
        counts[m.sub_division_id] = (counts[m.sub_division_id] ?? 0) + 1;
      }
      setMemberCounts(counts);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
        Specialized Capabilities
      </p>
      <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Sub-Divisions</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
        Specialized units embedded within {ORG_ABBR}'s divisions, trained and deployed for
        capabilities most organizations simply don't have.
      </p>

      {loading ? (
        <p className="mt-10 text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-sm text-zinc-500">No sub-divisions have been added yet.</p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const count = memberCounts[r.id] ?? 0;
            return (
              <div
                key={r.id}
                className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50"
              >
                <div className="relative h-44 w-full">
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-zinc-800" />
                  )}
                  {r.coming_soon && (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                      <span className="text-sm font-bold uppercase tracking-[0.3em] text-white">
                        Coming Soon
                      </span>
                    </div>
                  )}
                  <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-zinc-950/80 px-3 py-1.5">
                    <span className="text-sm font-bold text-amber-300">{r.short_name}</span>
                  </span>
                  <span className="absolute bottom-3 left-24 text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
                    {ORG_ABBR} Specialized Unit
                  </span>
                </div>

                <div className="p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                    Subdivision
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-white">{r.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{r.description}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300">
                      {count} active member{count === 1 ? '' : 's'}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        r.coming_soon
                          ? 'bg-zinc-800 text-zinc-400'
                          : r.applications_open
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {r.coming_soon
                        ? 'Coming soon'
                        : r.applications_open
                          ? 'Applications: Applications Open'
                          : 'Applications: Closed'}
                    </span>
                  </div>

                  {!r.coming_soon && (
                    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
                        Subdivision Applications
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {r.applications_open ? 'Applications Open' : 'Applications Closed'}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-2">
                    <Link
                      to={`/portal/roster?subdivision=${r.id}`}
                      className="w-full rounded-lg border border-zinc-700 px-4 py-2.5 text-center text-sm font-bold text-zinc-200 hover:bg-zinc-800"
                    >
                      View Roster
                    </Link>
                    {!r.coming_soon && (
                      <Link
                        to={`/applications?subdivision=${r.id}`}
                        className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-center text-sm font-bold text-zinc-950 hover:bg-amber-300"
                      >
                        Apply
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
