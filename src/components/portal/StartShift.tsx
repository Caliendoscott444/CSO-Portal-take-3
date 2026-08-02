import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, Shift, ShiftType } from '../../lib/supabaseClient';
import { getPeriodKey, formatPeriodRange } from '../../lib/period';

function formatMinutes(mins: number) {
  const totalSeconds = Math.round(mins * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

async function callFunction(name: string, body: unknown) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Request failed');
  return json;
}

export default function StartShift() {
  const { profile, refreshProfile } = useAuth();
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [weeklyWorked, setWeeklyWorked] = useState(0);
  const [weeklyCredited, setWeeklyCredited] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadState = async () => {
    if (!profile) return;
    const { data: types } = await supabase
      .from('shift_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    setShiftTypes(types ?? []);
    if (types && types.length && !selectedKey) setSelectedKey(types[0].key);

    const { data: active } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .maybeSingle();
    setActiveShift(active ?? null);

    const periodKey = getPeriodKey(new Date());
    const { data: thisPeriod } = await supabase
      .from('weekly_credit_v')
      .select('worked_minutes, credited_minutes')
      .eq('user_id', profile.id)
      .eq('week_key', periodKey)
      .maybeSingle();
    setWeeklyWorked(thisPeriod?.worked_minutes ?? 0);
    setWeeklyCredited(thisPeriod?.credited_minutes ?? 0);
  };

  useEffect(() => {
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    if (!activeShift) return;
    const tick = () => {
      const started = new Date(activeShift.started_at).getTime();
      setElapsedSeconds(Math.floor((Date.now() - started) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeShift]);

  const selectedType = shiftTypes.find((t) => t.key === selectedKey);

  const handleStart = async () => {
    setError(null);
    setBusy(true);
    try {
      await callFunction('start-shift', { shift_type_key: selectedKey });
      await refreshProfile();
      await loadState();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async () => {
    setError(null);
    setBusy(true);
    try {
      await callFunction('end-shift', {});
      await refreshProfile();
      await loadState();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
        Live Role-Based Shift Controls
      </p>
      <h1 className="mt-1 text-2xl font-black text-white">
        {activeShift ? 'On Duty' : 'Start a Shift'}
      </h1>
      <p className="mt-1 text-sm text-zinc-400">
        Select an eligible assignment. Discord roles are checked before the shift begins.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        {!activeShift ? (
          <>
            <label className="text-sm font-semibold text-white">Shift type</label>
            <div className="relative mt-2">
              <select
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                {shiftTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} · {t.multiplier}× {t.required_role_id ? '· role required' : ''}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{selectedType?.description}</p>

            <button
              onClick={handleStart}
              disabled={busy || !selectedKey}
              className="mt-5 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-all hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Start Shift'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              You are currently on an active shift. Elapsed time updates automatically.
            </p>
            <p className="mt-3 text-4xl font-black text-amber-400">
              {formatDuration(elapsedSeconds)}
            </p>
            <button
              onClick={handleEnd}
              disabled={busy}
              className="mt-5 rounded-lg bg-red-500/90 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Ending…' : 'End Shift'}
            </button>
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Worked This Period
          </p>
          <p className="mt-1 text-lg font-bold text-white">{formatMinutes(weeklyWorked)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Credited This Period
          </p>
          <p className="mt-1 text-lg font-bold text-white">{formatMinutes(weeklyCredited)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Requirement
          </p>
          <p className="mt-1 text-lg font-bold text-white">1h 0m</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Current period: {formatPeriodRange(new Date())}</p>
    </div>
  );
}
