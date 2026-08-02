import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { getPeriodKey } from '../../lib/period';

const RANKS = [
  'Warden 1',
  'Warden 2',
  'Warden 3',
  'Logistics Coordinator',
  'Lieutenant',
  'Staff Lieutenant',
  'Internal Affairs & Corrections',
  'Division Instructor',
  'Unit Supervisor',
  'Commander',
  'Assistant Commander',
  'Grand Commander',
  'Assistant Grand Commander',
  'Chief of Staff',
  'C.O.M.E.T. Task Force',
  'COMET Team Leader',
  'COMET Lieutenant',
  'COMET Warden',
  'Recruiter',
  'Training Required',
];

const ACCESS_LEVELS = ['member', 'fto', 'staff', 'command'];

function formatDuration(totalSeconds: number) {
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = Math.floor(abs % 60);
  if (h > 0) return `${sign}${h}h ${m}m ${s}s`;
  if (m > 0) return `${sign}${m}m ${s}s`;
  return `${sign}${s}s`;
}

type AdminProfile = {
  id: string;
  discord_username: string | null;
  callsign: string | null;
  member_rank: string | null;
  access_level: string;
  loa_status: string;
  infractions: number;
  strikes: number;
  firewarnings: number;
  is_active: boolean;
};

type AdminLoaRequest = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  created_at: string;
};

type ShiftWave = {
  id: string;
  label: string;
  is_current: boolean;
  started_at: string;
};

type Picture = {
  id: string;
  url: string;
  storage_path: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
};

type AdjustDraft = {
  mode: 'add' | 'remove';
  hours: string;
  minutes: string;
  seconds: string;
  reason: string;
};

// "Regular" / Default shift type — used for manually-added admin time blocks
const DEFAULT_SHIFT_TYPE_ID = 'a9c5e432-2e59-4299-af67-5d9bf9e9018e';

const emptyAdjustDraft: AdjustDraft = { mode: 'add', hours: '', minutes: '', seconds: '', reason: '' };

export default function Admin() {
  const { profile: myProfile } = useAuth();
  const [members, setMembers] = useState<AdminProfile[]>([]);
  const [loaRequests, setLoaRequests] = useState<AdminLoaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [disciplineDrafts, setDisciplineDrafts] = useState<
    Record<string, { type: string; reason: string }>
  >({});

  const [waves, setWaves] = useState<ShiftWave[]>([]);
  const [selectedWaveId, setSelectedWaveId] = useState<string>('');
  const [newWaveLabel, setNewWaveLabel] = useState('');
  const [startingWave, setStartingWave] = useState(false);
  const [waveTotals, setWaveTotals] = useState<Record<string, number>>({});
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, AdjustDraft>>({});

  const [pictures, setPictures] = useState<Picture[]>([]);
  const [uploading, setUploading] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');

  const loadPictures = async () => {
    const { data } = await supabase
      .from('pictures')
      .select('*')
      .order('created_at', { ascending: false });
    setPictures(data ?? []);
  };

  const uploadPicture = async (file: File) => {
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage.from('pictures').upload(path, file);
    if (uploadErr) {
      alert(`Upload failed: ${uploadErr.message}`);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('pictures').getPublicUrl(path);

    await supabase.from('pictures').insert({
      url: urlData.publicUrl,
      storage_path: path,
      caption: captionDraft.trim() || null,
      uploaded_by: myProfile?.id,
    });

    setCaptionDraft('');
    await loadPictures();
    setUploading(false);
  };

  const deletePicture = async (picture: Picture) => {
    const confirmed = window.confirm('Delete this picture? This cannot be undone.');
    if (!confirmed) return;
    await supabase.storage.from('pictures').remove([picture.storage_path]);
    await supabase.from('pictures').delete().eq('id', picture.id);
    await loadPictures();
  };

  const isAuthorized =
    myProfile?.access_level === 'staff' || myProfile?.access_level === 'command';

  const loadWaveTotals = async (waveId: string) => {
    if (!waveId) {
      setWaveTotals({});
      return;
    }
    const { data } = await supabase
      .from('wave_totals_with_adjustments_v')
      .select('user_id, total_seconds')
      .eq('wave_id', waveId);
    const totals: Record<string, number> = {};
    (data ?? []).forEach((row) => {
      totals[row.user_id] = row.total_seconds;
    });
    setWaveTotals(totals);
  };

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: loas }, { data: waveRows }] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, discord_username, callsign, member_rank, access_level, loa_status, infractions, strikes, firewarnings, is_active',
        )
        .order('discord_username', { ascending: true }),
      supabase
        .from('loa_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('shift_waves')
        .select('*')
        .order('started_at', { ascending: false }),
    ]);
    setMembers(profiles ?? []);
    setLoaRequests(loas ?? []);
    setWaves(waveRows ?? []);

    const current = (waveRows ?? []).find((w) => w.is_current);
    const initialWaveId = current?.id ?? waveRows?.[0]?.id ?? '';
    setSelectedWaveId(initialWaveId);
    if (initialWaveId) await loadWaveTotals(initialWaveId);

    setLoading(false);
  };

  useEffect(() => {
    if (isAuthorized) {
      load();
      loadPictures();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized]);

  useEffect(() => {
    if (selectedWaveId) loadWaveTotals(selectedWaveId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWaveId]);

  if (!isAuthorized) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-red-400">
          Restricted
        </p>
        <h1 className="mt-2 text-xl font-bold text-white">Staff access required</h1>
        <p className="mt-2 text-sm text-zinc-400">
          This page is only available to Staff and Command members.
        </p>
      </div>
    );
  }

  const updateMember = async (id: string, patch: Partial<AdminProfile>) => {
    setSavingId(id);
    await supabase.from('profiles').update(patch).eq('id', id);
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    setSavingId(null);
  };

  const logDiscipline = async (member: AdminProfile) => {
    const draft = disciplineDrafts[member.id];
    if (!draft?.reason?.trim()) return;
    setSavingId(member.id);

    await supabase.from('discipline_records').insert({
      user_id: member.id,
      type: draft.type,
      reason: draft.reason.trim(),
      created_by: myProfile?.id,
    });

    const patch: Partial<AdminProfile> =
      draft.type === 'infraction'
        ? { infractions: member.infractions + 1 }
        : draft.type === 'strike'
          ? { strikes: member.strikes + 1 }
          : draft.type === 'firewarning'
            ? { firewarnings: member.firewarnings + 1 }
            : {};

    if (Object.keys(patch).length > 0) {
      await supabase.from('profiles').update(patch).eq('id', member.id);
    }

    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, ...patch } : m)),
    );
    setDisciplineDrafts((prev) => ({ ...prev, [member.id]: { type: 'infraction', reason: '' } }));
    setSavingId(null);
  };

  const reviewLoa = async (loaId: string, userId: string, status: 'approved' | 'denied') => {
    setSavingId(loaId);
    await supabase
      .from('loa_requests')
      .update({ status, reviewed_by: myProfile?.id })
      .eq('id', loaId);

    await supabase
      .from('profiles')
      .update({ loa_status: status === 'approved' ? 'active' : 'clear' })
      .eq('id', userId);

    setLoaRequests((prev) => prev.filter((r) => r.id !== loaId));
    setMembers((prev) =>
      prev.map((m) =>
        m.id === userId ? { ...m, loa_status: status === 'approved' ? 'active' : 'clear' } : m,
      ),
    );
    setSavingId(null);
  };

  const startNewWave = async () => {
    if (!newWaveLabel.trim()) return;
    setStartingWave(true);
    await supabase.from('shift_waves').update({ is_current: false }).eq('is_current', true);
    const { data: created } = await supabase
      .from('shift_waves')
      .insert({ label: newWaveLabel.trim(), is_current: true, created_by: myProfile?.id })
      .select()
      .single();
    setNewWaveLabel('');
    await load();
    if (created) setSelectedWaveId(created.id);
    setStartingWave(false);
  };

  const applyAdjustment = async (memberId: string) => {
    const draft = adjustDrafts[memberId] ?? emptyAdjustDraft;
    const h = Number(draft.hours) || 0;
    const m = Number(draft.minutes) || 0;
    const s = Number(draft.seconds) || 0;
    const magnitude = h * 3600 + m * 60 + s;
    if (!selectedWaveId || magnitude <= 0) return;

    setSavingId(memberId);

    if (draft.mode === 'add') {
      const now = new Date();
      const minutes = magnitude / 60;
      await supabase.from('shifts').insert({
        user_id: memberId,
        shift_type_id: DEFAULT_SHIFT_TYPE_ID,
        status: 'completed',
        week_key: getPeriodKey(now),
        started_at: now.toISOString(),
        ended_at: now.toISOString(),
        minutes_worked: minutes,
        minutes_credited: minutes,
        wave_id: selectedWaveId,
      });
    } else {
      await supabase.from('shift_adjustments').insert({
        user_id: memberId,
        wave_id: selectedWaveId,
        seconds: -magnitude,
        reason: draft.reason.trim() || null,
        created_by: myProfile?.id,
      });
    }

    await loadWaveTotals(selectedWaveId);
    setAdjustDrafts((prev) => ({ ...prev, [memberId]: emptyAdjustDraft }));
    setSavingId(null);
  };

  const wipeMemberTime = async (memberId: string) => {
    if (!selectedWaveId) return;
    const member = members.find((m) => m.id === memberId);
    const confirmed = window.confirm(
      `Wipe ALL shift time for ${member?.discord_username ?? 'this member'} in ${
        selectedWave?.label ?? 'this wave'
      }? This sets their hours/minutes/seconds to 0 in Supabase and cannot be undone.`,
    );
    if (!confirmed) return;

    setSavingId(memberId);

    await supabase
      .from('shifts')
      .update({ minutes_worked: 0, minutes_credited: 0 })
      .eq('user_id', memberId)
      .eq('wave_id', selectedWaveId);

    await supabase
      .from('shift_adjustments')
      .delete()
      .eq('user_id', memberId)
      .eq('wave_id', selectedWaveId);

    await loadWaveTotals(selectedWaveId);
    setAdjustDrafts((prev) => ({ ...prev, [memberId]: emptyAdjustDraft }));
    setSavingId(null);
  };

  const selectedWave = waves.find((w) => w.id === selectedWaveId);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Staff</p>
      <h1 className="mt-1 text-2xl font-black text-white">Admin</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Manage member ranks, access, discipline, shift waves, and pending LOA requests.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading…</p>
      ) : (
        <>
          <p className="mb-3 mt-8 text-lg font-bold text-white">Shift Waves</p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-400">Viewing wave</label>
                <select
                  value={selectedWaveId}
                  onChange={(e) => setSelectedWaveId(e.target.value)}
                  className="mt-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                >
                  {waves.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label} {w.is_current ? '(current)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {selectedWave && !selectedWave.is_current && (
                <span className="mt-5 text-xs text-zinc-500">
                  Viewing a past wave — read-only history.
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
              <input
                value={newWaveLabel}
                onChange={(e) => setNewWaveLabel(e.target.value)}
                placeholder="New wave name, e.g. Wave 4"
                className="min-w-[200px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
              <button
                onClick={startNewWave}
                disabled={startingWave || !newWaveLabel.trim()}
                className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {startingWave ? 'Starting…' : 'Start New Wave'}
              </button>
              <span className="text-xs text-zinc-500">
                Starting a new wave resets everyone's shift time to zero going forward. Past
                waves stay viewable above.
              </span>
            </div>
          </div>

          <p className="mb-3 mt-10 text-lg font-bold text-white">
            Pending LOA Requests {loaRequests.length > 0 && `(${loaRequests.length})`}
          </p>
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
            {loaRequests.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">No pending requests.</p>
            )}
            {loaRequests.map((r) => {
              const member = members.find((m) => m.id === r.user_id);
              return (
                <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">
                      {member?.discord_username ?? 'Unknown member'}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {r.start_date} → {r.end_date}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">{r.reason}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => reviewLoa(r.id, r.user_id, 'approved')}
                      disabled={savingId === r.id}
                      className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => reviewLoa(r.id, r.user_id, 'denied')}
                      disabled={savingId === r.id}
                      className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mb-3 mt-10 text-lg font-bold text-white">Pictures</p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPicture(file);
                  e.target.value = '';
                }}
                disabled={uploading}
                className="text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-500 file:px-3 file:py-2 file:text-xs file:font-bold file:text-zinc-950 hover:file:bg-amber-400"
              />
              <input
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                placeholder="Caption (optional)"
                className="min-w-[200px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
              {uploading && <span className="text-xs text-zinc-500">Uploading…</span>}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {pictures.length === 0 && (
                <p className="col-span-full text-sm text-zinc-500">No pictures uploaded yet.</p>
              )}
              {pictures.map((p) => (
                <div key={p.id} className="group relative overflow-hidden rounded-lg border border-zinc-800">
                  <img src={p.url} alt={p.caption ?? ''} className="h-32 w-full object-cover" />
                  {p.caption && (
                    <p className="truncate bg-zinc-950/80 px-2 py-1 text-xs text-zinc-300">
                      {p.caption}
                    </p>
                  )}
                  <button
                    onClick={() => deletePicture(p)}
                    className="absolute right-1 top-1 hidden rounded-md bg-red-500/80 px-2 py-1 text-[10px] font-bold text-white group-hover:block"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <p className="mb-3 mt-10 text-lg font-bold text-white">Members ({members.length})</p>
          <div className="space-y-3">
            {members.map((m) => {
              const draft = disciplineDrafts[m.id] ?? { type: 'infraction', reason: '' };
              const adjustDraft = adjustDrafts[m.id] ?? emptyAdjustDraft;
              const totalSeconds = waveTotals[m.id] ?? 0;
              return (
                <div
                  key={m.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">
                        {m.discord_username ?? 'Unknown member'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {m.infractions}I · {m.strikes}S · {m.firewarnings}FW · LOA: {m.loa_status}
                        {!m.is_active && ' · Inactive'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {selectedWave?.label ?? 'Shift time'}
                      </p>
                      <p className="text-lg font-bold text-amber-400">
                        {formatDuration(totalSeconds)}
                      </p>
                    </div>
                    {savingId === m.id && (
                      <span className="text-xs text-zinc-500">Saving…</span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="text-xs font-semibold text-zinc-400">Callsign</label>
                      <input
                        defaultValue={m.callsign ?? ''}
                        onBlur={(e) => updateMember(m.id, { callsign: e.target.value || null })}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        placeholder="e.g. 4-Adam-12"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-400">Rank</label>
                      <select
                        value={m.member_rank ?? ''}
                        onChange={(e) => updateMember(m.id, { member_rank: e.target.value || null })}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">None</option>
                        {RANKS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-400">Access</label>
                      <select
                        value={m.access_level}
                        onChange={(e) => updateMember(m.id, { access_level: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm capitalize text-white focus:border-amber-500 focus:outline-none"
                      >
                        {ACCESS_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-400">Active</label>
                      <select
                        value={m.is_active ? 'yes' : 'no'}
                        onChange={(e) =>
                          updateMember(m.id, { is_active: e.target.value === 'yes' })
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      >
                        <option value="yes">Active</option>
                        <option value="no">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={draft.type}
                      onChange={(e) =>
                        setDisciplineDrafts((prev) => ({
                          ...prev,
                          [m.id]: { ...draft, type: e.target.value },
                        }))
                      }
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                    >
                      <option value="infraction">Infraction</option>
                      <option value="strike">Strike</option>
                      <option value="firewarning">Firewarning</option>
                      <option value="termination">Termination</option>
                      <option value="note">Note</option>
                    </select>
                    <input
                      value={draft.reason}
                      onChange={(e) =>
                        setDisciplineDrafts((prev) => ({
                          ...prev,
                          [m.id]: { ...draft, reason: e.target.value },
                        }))
                      }
                      placeholder="Reason..."
                      className="min-w-[180px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                    />
                    <button
                      onClick={() => logDiscipline(m)}
                      disabled={savingId === m.id || !draft.reason.trim()}
                      className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                    >
                      Log
                    </button>
                  </div>

                  <div className="mt-3 border-t border-zinc-800 pt-3">
                    <label className="text-xs font-semibold text-zinc-400">Adjust shift time</label>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="inline-flex overflow-hidden rounded-lg border border-zinc-700">
                        <button
                          type="button"
                          onClick={() =>
                            setAdjustDrafts((prev) => ({
                              ...prev,
                              [m.id]: { ...adjustDraft, mode: 'add' },
                            }))
                          }
                          className={`px-3 py-2 text-xs font-bold ${
                            adjustDraft.mode === 'add'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-zinc-950 text-zinc-400'
                          }`}
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAdjustDrafts((prev) => ({
                              ...prev,
                              [m.id]: { ...adjustDraft, mode: 'remove' },
                            }))
                          }
                          className={`px-3 py-2 text-xs font-bold ${
                            adjustDraft.mode === 'remove'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-zinc-950 text-zinc-400'
                          }`}
                        >
                          Remove
                        </button>
                      </div>

                      <input
                        type="number"
                        min="0"
                        value={adjustDraft.hours}
                        onChange={(e) =>
                          setAdjustDrafts((prev) => ({
                            ...prev,
                            [m.id]: { ...adjustDraft, hours: e.target.value },
                          }))
                        }
                        placeholder="0"
                        className="w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-center text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-xs text-zinc-500">h</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={adjustDraft.minutes}
                        onChange={(e) =>
                          setAdjustDrafts((prev) => ({
                            ...prev,
                            [m.id]: { ...adjustDraft, minutes: e.target.value },
                          }))
                        }
                        placeholder="0"
                        className="w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-center text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-xs text-zinc-500">m</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={adjustDraft.seconds}
                        onChange={(e) =>
                          setAdjustDrafts((prev) => ({
                            ...prev,
                            [m.id]: { ...adjustDraft, seconds: e.target.value },
                          }))
                        }
                        placeholder="0"
                        className="w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-center text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-xs text-zinc-500">s</span>

                      <input
                        value={adjustDraft.reason}
                        onChange={(e) =>
                          setAdjustDrafts((prev) => ({
                            ...prev,
                            [m.id]: { ...adjustDraft, reason: e.target.value },
                          }))
                        }
                        placeholder="Reason (optional)"
                        className="min-w-[160px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                      <button
                        onClick={() => applyAdjustment(m.id)}
                        disabled={savingId === m.id || !selectedWave?.is_current}
                        className="rounded-lg bg-zinc-700 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-600 disabled:opacity-50"
                        title={
                          !selectedWave?.is_current
                            ? 'Switch to the current wave to make adjustments'
                            : ''
                        }
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => wipeMemberTime(m.id)}
                        disabled={savingId === m.id || !selectedWave?.is_current}
                        className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                        title={
                          !selectedWave?.is_current
                            ? 'Switch to the current wave to wipe time'
                            : 'Set hours/minutes/seconds to 0 for this member in this wave'
                        }
                      >
                        Wipe Time
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
