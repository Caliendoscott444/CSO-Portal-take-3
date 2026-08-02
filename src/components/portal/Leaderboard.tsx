import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type ShiftWave = { id: string; label: string; is_current: boolean };
type Member = { id: string; discord_username: string | null; callsign: string | null };

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function Leaderboard() {
  const [wave, setWave] = useState<ShiftWave | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: currentWave } = await supabase
        .from('shift_waves')
        .select('id, label, is_current')
        .eq('is_current', true)
        .maybeSingle();
      setWave(currentWave ?? null);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, discord_username, callsign')
        .eq('is_active', true);
      setMembers(profiles ?? []);

      if (currentWave) {
        const { data: totalsRows } = await supabase
          .from('wave_totals_with_adjustments_v')
          .select('user_id, total_seconds')
          .eq('wave_id', currentWave.id);
        const map: Record<string, number> = {};
        (totalsRows ?? []).forEach((r) => {
          map[r.user_id] = r.total_seconds;
        });
        setTotals(map);
      }

      setLoading(false);
    };
    load();
  }, []);

  const ranked = members
    .map((m) => ({ member: m, seconds: totals[m.id] ?? 0 }))
    .filter((row) => row.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">CSO Portal</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-black text-white">
          <Trophy className="h-7 w-7 text-amber-400" />
          Leaderboard
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {wave ? `Ranked by credited time — ${wave.label}` : 'No active wave right now.'}
        </p>
      </div>

      <div className="mt-6 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
        {loading && <p className="px-5 py-6 text-sm text-zinc-500">Loading…</p>}
        {!loading && ranked.length === 0 && (
          <p className="px-5 py-6 text-sm text-zinc-500">No logged time yet this wave.</p>
        )}
        {!loading &&
          ranked.map((row, i) => (
            <div
              key={row.member.id}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`w-6 shrink-0 text-center text-sm font-black ${
                    i === 0
                      ? 'text-amber-400'
                      : i === 1
                        ? 'text-zinc-300'
                        : i === 2
                          ? 'text-amber-700'
                          : 'text-zinc-600'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {row.member.discord_username ?? 'Unknown member'}
                  </p>
                  {row.member.callsign && (
                    <p className="text-xs text-zinc-500">{row.member.callsign}</p>
                  )}
                </div>
              </div>
              <p className="shrink-0 text-lg font-bold text-amber-400">
                {formatDuration(row.seconds)}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
