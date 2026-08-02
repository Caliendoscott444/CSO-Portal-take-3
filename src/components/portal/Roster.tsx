import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type RosterMember = {
  id: string;
  discord_username: string | null;
  callsign: string | null;
  member_rank: string | null;
  access_level: string;
  loa_status: string;
  infractions: number;
  firewarnings: number;
  strikes: number;
};

function AccessBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    command: 'bg-amber-500/15 text-amber-400',
    staff: 'bg-sky-500/15 text-sky-400',
    fto: 'bg-emerald-500/15 text-emerald-400',
    member: 'bg-zinc-800 text-zinc-400',
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
        styles[level] ?? styles.member
      }`}
    >
      {level}
    </span>
  );
}

export default function Roster() {
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, discord_username, callsign, member_rank, access_level, loa_status, infractions, strikes, firewarnings')
      .eq('is_active', true)
      .order('discord_username', { ascending: true })
      .then(({ data }) => {
        setMembers(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.discord_username, m.callsign, m.member_rank]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [members, query]);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Roster</p>
      <h1 className="mt-1 text-2xl font-black text-white">Live Roster</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Search current members by name, callsign, or rank.
      </p>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members..."
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-3 pl-11 pr-4 text-sm text-white focus:border-amber-500 focus:outline-none"
        />
      </div>

      <div className="mt-6 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
        {loading && <p className="px-5 py-6 text-sm text-zinc-500">Loading roster…</p>}

        {!loading && filtered.length === 0 && (
          <p className="px-5 py-6 text-sm text-zinc-500">
            {members.length === 0 ? 'No members found.' : 'No members match your search.'}
          </p>
        )}

        {!loading &&
          filtered.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">
                  {m.discord_username ?? 'Unknown member'}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {m.callsign ? `Callsign ${m.callsign}` : 'No callsign assigned'}
                  {m.member_rank ? ` · ${m.member_rank}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {m.loa_status === 'active' && (
                  <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-400">
                    LOA
                  </span>
                )}
                {(m.infractions > 0 || m.strikes > 0 || m.firewarnings > 0) && (
                  <span className="rounded-full bg-yellow-500/15 px-2.5 py-1 text-xs font-bold text-yellow-400">
                    {m.infractions}I · {m.strikes}S · {m.firewarnings}FW
                  </span>
                )}
                <AccessBadge level={m.access_level} />
              </div>
            </div>
          ))}
      </div>

      {!loading && (
        <p className="mt-4 text-xs text-zinc-500">
          Showing {filtered.length} of {members.length} active member
          {members.length === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}
