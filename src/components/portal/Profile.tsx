import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { StatCard, SectionHeading } from './cards';
import { getPeriodKey, formatPeriodRange } from '../../lib/period';

function formatMinutes(mins: number) {
  const totalSeconds = Math.round(mins * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function formatSeconds(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}h ${m}m ${s}s`;
}

export default function Profile() {
  const { profile } = useAuth();
  const [periodWorked, setPeriodWorked] = useState(0);
  const [periodCredited, setPeriodCredited] = useState(0);
  const [waveLabel, setWaveLabel] = useState<string | null>(null);
  const [waveSeconds, setWaveSeconds] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const periodKey = getPeriodKey(new Date());

    supabase
      .from('weekly_credit_v')
      .select('worked_minutes, credited_minutes')
      .eq('user_id', profile.id)
      .eq('week_key', periodKey)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        setPeriodWorked(data?.worked_minutes ?? 0);
        setPeriodCredited(data?.credited_minutes ?? 0);
      });

    supabase
      .from('shift_waves')
      .select('id, label')
      .eq('is_current', true)
      .maybeSingle()
      .then(({ data: wave, error }) => {
        if (error) {
          setLoadError(error.message);
          return;
        }
        if (!wave) return;
        setWaveLabel(wave.label);
        supabase
          .from('wave_totals_with_adjustments_v')
          .select('total_seconds')
          .eq('wave_id', wave.id)
          .eq('user_id', profile.id)
          .maybeSingle()
          .then(({ data, error: totalsError }) => {
            if (totalsError) setLoadError(totalsError.message);
            setWaveSeconds(data?.total_seconds ?? 0);
          });
      });
  }, [profile]);

  if (!profile) return null;

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Member</p>
      <h1 className="mt-1 text-2xl font-black text-white">My Profile</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Your callsign, rank, discipline record, and shift totals.
      </p>

      {loadError && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {loadError}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Callsign"
          value={profile.callsign ?? 'Not assigned'}
          caption={profile.discord_username ?? ''}
        />
        <StatCard
          label="Rank"
          value={profile.member_rank ?? 'Unranked'}
          caption={`${profile.access_level} access`}
        />
        <StatCard
          label="Discipline"
          value={`${profile.infractions}I · ${profile.strikes}S · ${profile.firewarnings}FW`}
          caption={profile.strikes > 0 ? 'Active strikes on record' : 'No active suspensions'}
        />
        <StatCard
          label="LOA"
          value={profile.loa_status === 'active' ? 'Active' : 'Clear'}
          caption={profile.loa_reason ?? 'No active LOA on record.'}
        />
      </div>

      <SectionHeading kicker="Shift Time" title="Your totals" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Worked This Period"
          value={formatMinutes(periodWorked)}
          caption={formatPeriodRange(new Date())}
        />
        <StatCard
          label="Credited This Period"
          value={formatMinutes(periodCredited)}
          caption={formatPeriodRange(new Date())}
        />
        <StatCard
          label={waveLabel ? `Current Wave — ${waveLabel}` : 'Current Wave'}
          value={formatSeconds(waveSeconds)}
          caption="Includes any admin adjustments"
        />
      </div>
    </div>
  );
}
