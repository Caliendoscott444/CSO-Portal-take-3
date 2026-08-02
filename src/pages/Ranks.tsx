import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type RankGroup = { section: string; ranks: string[] };

export const RANK_GROUPS: RankGroup[] = [
  { section: 'Senior Command Staff', ranks: ['[CSO] Grand Commander', '[CSO] Assistant Grand Commander'] },
  { section: 'Command Staff', ranks: ['[CSO] Commander', '[CSO] Assistant Commander'] },
  { section: 'Chief of Staff', ranks: ['[CSO] Chief of Staff'] },
  { section: 'General Staff', ranks: ['[CSO] Unit Supervisor', '[CSO] Division Instructor'] },
  {
    section: 'C.O.M.E.T. Task Force',
    ranks: ['C.O.M.E.T. Task Force', '[COMET] Team Leader', '[COMET] Lieutenant', '[COMET] Warden'],
  },
  {
    section: 'Division Members',
    ranks: [
      '[CSO] Internal Affairs & Corrections',
      '[CSO] Staff Lieutenant',
      '[CCD] Recruiter',
      '[CSO] Lieutenant',
      '[CSO] Logistics Coordinator',
    ],
  },
  { section: 'Warden Ranks', ranks: ['[CSO] Warden 3', '[CSO] Warden 2', '[CSO] Warden 1'] },
  { section: 'Entry Level', ranks: ['[TR] Training Required'] },
];

type Member = {
  id: string;
  discord_username: string | null;
  callsign: string | null;
  member_ranks: string[] | null;
};

export default function Ranks() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, discord_username, callsign, member_ranks')
      .eq('is_active', true)
      .then(({ data }) => {
        setMembers(data ?? []);
        setLoading(false);
      });
  }, []);

  const membersForRank = (rank: string) =>
    members.filter((m) => (m.member_ranks ?? []).includes(rank));

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Structure</p>
      <h1 className="mt-1 text-2xl font-black text-white">Chain of Command</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Organized by division, along with the members currently holding each rank.
      </p>

      <div className="mt-6 space-y-8">
        {RANK_GROUPS.map((group) => (
          <div key={group.section}>
            <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-amber-400">
              {group.section}
            </p>
            <div className="space-y-2">
              {group.ranks.map((rank) => {
                const holders = membersForRank(rank);
                return (
                  <div
                    key={rank}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4"
                  >
                    <p className="text-base font-bold text-white">{rank}</p>
                    <div className="mt-2">
                      {loading ? (
                        <p className="text-xs text-zinc-600">Loading members…</p>
                      ) : holders.length === 0 ? (
                        <p className="text-xs text-zinc-600">
                          No members currently hold this rank.
                        </p>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {holders.map((m) => (
                            <li
                              key={m.id}
                              className="rounded-full bg-zinc-800/70 px-3 py-1 text-xs font-medium text-zinc-200"
                            >
                              {m.callsign ? `${m.callsign} — ` : ''}
                              {m.discord_username ?? 'Unknown member'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-zinc-500">
        Ranks are assigned by Command staff. If your rank looks out of date, reach out to
        Command to have it corrected.
      </p>
    </div>
  );
}
