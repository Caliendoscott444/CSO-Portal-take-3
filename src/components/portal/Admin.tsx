import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Search, ShieldAlert, Ban } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { getPeriodKey } from '../../lib/period';

const RANK_GROUPS: { section: string; ranks: string[] }[] = [
  { section: 'CSO Directorship', ranks: ['Grand Commander'] },
  {
    section: 'Division Commanders',
    ranks: ['Operations Commander', 'Support and Logistics Commander', 'Capital Division Commander'],
  },
  { section: 'Operations Division', ranks: ['[OPS] Unit Supervisor', '[OPS] Division Instructor'] },
  {
    section: 'Support & Logistics Division',
    ranks: [
      '[S&L] Unit Supervisor',
      '[S&L] Division Instructor',
      '[S&L] Internal Affairs & Corrections',
      '[S&L] Staff Lieutenant',
      '[S&L] Lieutenant',
      '[S&L] Logistics Coordinator',
    ],
  },
  {
    section: 'C.O.M.E.T. Task Force',
    ranks: ['[COMET] Team Leader', '[COMET] Lieutenant', '[COMET] Warden'],
  },
  { section: 'Capital Division', ranks: ['[CAP] Unit Supervisor', '[CAP] Division Instructor'] },
  { section: 'Contractor Unit', ranks: ['[CONTRACTOR] Recruitor'] },
  {
    section: 'Aviation Unit',
    ranks: [
      '[AVIATION] Flight Leader',
      '[AVIATION] Flight Overwatch',
      '[AVIATION] Veteran Pilot',
      '[AVIATION] Pilot',
      '[AVIATION] Cadet',
    ],
  },
  {
    section: 'C.S.R.U.',
    ranks: [
      '[CSRU] Recon Executive',
      '[CSRU] Recon Team Leader',
      '[CSRU] Recon Operator',
      '[CSRU] Recon Specialist',
    ],
  },
  { section: 'Warden Ranks', ranks: ['Warden III', 'Warden II', 'Warden I'] },
  { section: 'Entry Level', ranks: ['Entry Level'] },
];

const ACCESS_LEVELS = ['member', 'fto', 'staff', 'command'];

function formatDuration(totalSeconds: number) {
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  const d = Math.floor(abs / 86400);
  const h = Math.floor((abs % 86400) / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = Math.floor(abs % 60);
  if (d > 0) return `${sign}${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${sign}${h}h ${m}m ${s}s`;
  if (m > 0) return `${sign}${m}m ${s}s`;
  return `${sign}${s}s`;
}

type AdminProfile = {
  id: string;
  discord_id: string | null;
  discord_username: string | null;
  callsign: string | null;
  member_ranks: string[] | null;
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

type ActiveShiftRow = {
  id: string;
  user_id: string;
  started_at: string;
  shift_types: { label: string } | null;
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
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  reason: string;
};

type DisciplineRecordRow = {
  id: string;
  user_id: string;
  type: string;
  reason: string;
  created_at: string;
};

// Rows from the Discord bot's `cases` table — created by /punish, updated by /revoke and /appeal.
// user_id here is the Discord snowflake, NOT the profiles.id UUID — join via profiles.discord_id.
type CaseRow = {
  id: number;
  guild_id: string;
  user_id: string;
  moderator_id: string;
  reason: string;
  duration_minutes: number | null;
  created_at: string;
  status: string;
  appeal_status: string | null;
  appeal_reason: string | null;
  punishment_type: string;
  appealable: boolean;
  signed_by: string | null;
  ticket_channel_id: string | null;
};

const CASE_TYPE_STYLES: Record<string, string> = {
  Suspension: 'bg-red-500/10 text-red-400',
  Warning: 'bg-yellow-500/10 text-yellow-400',
  Termination: 'bg-zinc-700/60 text-zinc-300',
};

function caseTypeClass(type: string) {
  return CASE_TYPE_STYLES[type] ?? 'bg-purple-500/10 text-purple-400';
}

// "Regular" / Default shift type — used for manually-added admin time blocks
const DEFAULT_SHIFT_TYPE_ID = 'a9c5e432-2e59-4299-af67-5d9bf9e9018e';

const emptyAdjustDraft: AdjustDraft = { mode: 'add', days: '', hours: '', minutes: '', seconds: '', reason: '' };

export default function Admin() {
  const { profile: myProfile } = useAuth();
  const [members, setMembers] = useState<AdminProfile[]>([]);
  const [loaRequests, setLoaRequests] = useState<AdminLoaRequest[]>([]);
  const [activeLoas, setActiveLoas] = useState<AdminLoaRequest[]>([]);
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

  const [disciplineRecords, setDisciplineRecords] = useState<DisciplineRecordRow[]>([]);
  const [discordCases, setDiscordCases] = useState<CaseRow[]>([]);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editRecordDraft, setEditRecordDraft] = useState<{ type: string; reason: string }>({
    type: 'infraction',
    reason: '',
  });

  const [activeShifts, setActiveShifts] = useState<ActiveShiftRow[]>([]);
  const [, setTick] = useState(0);

  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

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

  const loadDisciplineRecords = async () => {
    const { data, error } = await supabase
      .from('discipline_records')
      .select('id, user_id, type, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('Failed to load discipline records:', error.message);
    }
    setDisciplineRecords(data ?? []);
  };

  const loadDiscordCases = async () => {
    const { data, error } = await supabase
      .from('cases')
      .select(
        'id, guild_id, user_id, moderator_id, reason, duration_minutes, created_at, status, appeal_status, appeal_reason, punishment_type, appealable, signed_by, ticket_channel_id',
      )
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('Failed to load Discord cases:', error.message);
    }
    setDiscordCases(data ?? []);
  };

  const loadActiveShifts = async () => {
    const { data, error } = await supabase
      .from('shifts')
      .select('id, user_id, started_at, shift_types(label)')
      .eq('status', 'active')
      .order('started_at', { ascending: true });
    if (error) {
      console.error('Failed to load active shifts:', error.message);
    }
    setActiveShifts((data as unknown as ActiveShiftRow[]) ?? []);
  };

  const forceEndShift = async (shift: ActiveShiftRow) => {
    const member = members.find((m) => m.id === shift.user_id);
    const confirmed = window.confirm(
      `Force end the active shift for ${member?.discord_username ?? 'this member'}? This marks it completed using the current time.`,
    );
    if (!confirmed) return;

    setSavingId(shift.id);
    const startedAt = new Date(shift.started_at);
    const endedAt = new Date();
    const minutesWorked = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 60000);

    const { error } = await supabase
      .from('shifts')
      .update({
        status: 'completed',
        ended_at: endedAt.toISOString(),
        minutes_worked: minutesWorked,
        minutes_credited: minutesWorked,
      })
      .eq('id', shift.id);

    if (error) {
      alert(`Failed to end shift: ${error.message}`);
      setSavingId(null);
      return;
    }

    await supabase.from('profiles').update({ current_assignment: null }).eq('id', shift.user_id);
    await loadActiveShifts();
    if (selectedWaveId) await loadWaveTotals(selectedWaveId);
    setSavingId(null);
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
    const [{ data: profiles }, { data: loas }, { data: activeLoaRows }, { data: waveRows }] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, discord_id, discord_username, callsign, member_ranks, access_level, loa_status, infractions, strikes, firewarnings, is_active',
        )
        .order('discord_username', { ascending: true }),
      supabase
        .from('loa_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('loa_requests')
        .select('*')
        .eq('status', 'approved')
        .order('end_date', { ascending: true }),
      supabase
        .from('shift_waves')
        .select('*')
        .order('started_at', { ascending: false }),
    ]);
    setMembers(profiles ?? []);
    setLoaRequests(loas ?? []);
    setActiveLoas(activeLoaRows ?? []);
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
      loadDisciplineRecords();
      loadDiscordCases();
      loadActiveShifts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

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

  const COUNTER_FIELDS: Record<string, 'infractions' | 'strikes' | 'firewarnings' | null> = {
    infraction: 'infractions',
    strike: 'strikes',
    firewarning: 'firewarnings',
    termination: null,
    note: null,
  };

  const adjustCounter = async (userId: string, type: string, delta: number) => {
    const field = COUNTER_FIELDS[type];
    if (!field) return;
    const member = members.find((m) => m.id === userId);
    if (!member) return;
    const next = Math.max(0, member[field] + delta);
    await supabase.from('profiles').update({ [field]: next }).eq('id', userId);
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, [field]: next } : m)));
  };

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

    const { error: insertErr } = await supabase.from('discipline_records').insert({
      user_id: member.id,
      type: draft.type,
      reason: draft.reason.trim(),
      created_by: myProfile?.id,
    });

    if (insertErr) {
      alert(`Failed to log discipline record: ${insertErr.message}`);
      setSavingId(null);
      return;
    }

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
    await loadDisciplineRecords();
    setSavingId(null);
  };

  const startEditRecord = (record: DisciplineRecordRow) => {
    setEditingRecordId(record.id);
    setEditRecordDraft({ type: record.type, reason: record.reason });
  };

  const cancelEditRecord = () => setEditingRecordId(null);

  const saveEditRecord = async (record: DisciplineRecordRow) => {
    const newType = editRecordDraft.type;
    const newReason = editRecordDraft.reason.trim();
    if (!newReason) return;

    setSavingId(record.id);

    if (newType !== record.type) {
      await adjustCounter(record.user_id, record.type, -1);
      await adjustCounter(record.user_id, newType, 1);
    }

    const { error: updateErr } = await supabase
      .from('discipline_records')
      .update({ type: newType, reason: newReason })
      .eq('id', record.id);

    if (updateErr) {
      alert(`Failed to save: ${updateErr.message}`);
      setSavingId(null);
      return;
    }

    setDisciplineRecords((prev) =>
      prev.map((r) => (r.id === record.id ? { ...r, type: newType, reason: newReason } : r)),
    );
    setEditingRecordId(null);
    setSavingId(null);
  };

  const deleteDisciplineRecord = async (record: DisciplineRecordRow) => {
    const member = members.find((m) => m.id === record.user_id);
    const confirmed = window.confirm(
      `Delete this ${record.type} for ${member?.discord_username ?? 'this member'}? This also removes it from their discipline count and cannot be undone.`,
    );
    if (!confirmed) return;

    setSavingId(record.id);
    await adjustCounter(record.user_id, record.type, -1);
    const { error: deleteErr } = await supabase
      .from('discipline_records')
      .delete()
      .eq('id', record.id);
    if (deleteErr) {
      alert(`Failed to delete: ${deleteErr.message}`);
      setSavingId(null);
      return;
    }
    setDisciplineRecords((prev) => prev.filter((r) => r.id !== record.id));
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

    if (status === 'approved') {
      const approvedMember = members.find((m) => m.id === userId);
      if (approvedMember?.discord_id) {
        try {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-loa-role`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ discordUserId: approvedMember.discord_id, action: 'add' }),
          });
        } catch {
          // silent - Discord role assignment is best-effort
        }
      }
    }

    setLoaRequests((prev) => prev.filter((r) => r.id !== loaId));
    setMembers((prev) =>
      prev.map((m) =>
        m.id === userId ? { ...m, loa_status: status === 'approved' ? 'active' : 'clear' } : m,
      ),
    );
    if (status === 'approved') {
      setActiveLoas((prev) => {
        const loaRow = loaRequests.find((r) => r.id === loaId);
        if (!loaRow) return prev;
        return [...prev, { ...loaRow, status: 'approved' }];
      });
    }
    setSavingId(null);
  };

  const endLoa = async (loaId: string, userId: string) => {
    setSavingId(loaId);
    const member = members.find((m) => m.id === userId);

    await supabase.from('loa_requests').update({ status: 'completed' }).eq('id', loaId);
    await supabase.from('profiles').update({ loa_status: 'clear' }).eq('id', userId);

    if (member?.discord_id) {
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-loa-role`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ discordUserId: member.discord_id, action: 'remove' }),
        });
      } catch {
        // silent - Discord role removal is best-effort
      }
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/end-loa-notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            discordId: member.discord_id,
            discordUsername: member.discord_username,
          }),
        });
      } catch {
        // silent - Discord notification is best-effort
      }
    }

    setActiveLoas((prev) => prev.filter((r) => r.id !== loaId));
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, loa_status: 'clear' } : m)));
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
    const d = Number(draft.days) || 0;
    const h = Number(draft.hours) || 0;
    const m = Number(draft.minutes) || 0;
    const s = Number(draft.seconds) || 0;
    const magnitude = d * 86400 + h * 3600 + m * 60 + s;
    if (!selectedWaveId || magnitude <= 0) return;

    setSavingId(memberId);

    if (draft.mode === 'add') {
      const now = new Date();
      const minutes = magnitude / 60;
      // wave_totals_v computes worked_seconds as (ended_at - started_at), not from
      // minutes_worked/minutes_credited — so started_at must be backdated by the
      // amount being credited, or this row silently contributes 0 seconds.
      const startedAt = new Date(now.getTime() - magnitude * 1000);
      const { error } = await supabase.from('shifts').insert({
        user_id: memberId,
        shift_type_id: DEFAULT_SHIFT_TYPE_ID,
        status: 'completed',
        week_key: getPeriodKey(now),
        started_at: startedAt.toISOString(),
        ended_at: now.toISOString(),
        minutes_worked: minutes,
        minutes_credited: minutes,
        wave_id: selectedWaveId,
      });
      if (error) {
        alert(`Failed to add shift time: ${error.message}`);
        setSavingId(null);
        return;
      }
    } else {
      const { error } = await supabase.from('shift_adjustments').insert({
        user_id: memberId,
        wave_id: selectedWaveId,
        seconds: -magnitude,
        reason: draft.reason.trim() || null,
        created_by: myProfile?.id,
      });
      if (error) {
        alert(`Failed to remove shift time: ${error.message}`);
        setSavingId(null);
        return;
      }
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

  type UnifiedRecord = {
    key: string;
    source: 'manual' | 'discord';
    userId: string; // profile UUID
    typeLabel: string;
    reason: string;
    created_at: string;
    manualRecord?: DisciplineRecordRow;
    caseRecord?: CaseRow;
  };

  const discordIdToProfileId = new Map(
    members.filter((m) => m.discord_id).map((m) => [m.discord_id as string, m.id]),
  );

  const unifiedRecords: UnifiedRecord[] = [
    ...disciplineRecords.map((r) => ({
      key: `manual-${r.id}`,
      source: 'manual' as const,
      userId: r.user_id,
      typeLabel: r.type,
      reason: r.reason,
      created_at: r.created_at,
      manualRecord: r,
    })),
    ...discordCases
      .map((c) => {
        const profileId = discordIdToProfileId.get(c.user_id);
        if (!profileId) return null;
        return {
          key: `discord-${c.id}`,
          source: 'discord' as const,
          userId: profileId,
          typeLabel: c.punishment_type,
          reason: c.reason,
          created_at: c.created_at,
          caseRecord: c,
        };
      })
      .filter((r): r is UnifiedRecord => r !== null),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Staff</p>
      <h1 className="mt-1 text-2xl font-black text-white">Admin</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Manage member ranks, access, discipline, shift waves, and pending LOA requests.
      </p>
      <Link
        to="/portal/admin/subdivisions"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
      >
        Manage Sub-Divisions →
      </Link>

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
            Leaderboard — {selectedWave?.label ?? 'Select a wave'}
          </p>
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
            {(() => {
              const ranked = members
                .map((m) => ({ member: m, seconds: waveTotals[m.id] ?? 0 }))
                .filter((row) => row.seconds > 0)
                .sort((a, b) => b.seconds - a.seconds);

              if (ranked.length === 0) {
                return (
                  <p className="px-5 py-6 text-sm text-zinc-500">
                    No logged time yet for this wave.
                  </p>
                );
              }

              return ranked.map((row, i) => (
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
              ));
            })()}
          </div>

          <p className="mb-3 mt-10 text-lg font-bold text-white">
            On Shift Now {activeShifts.length > 0 && `(${activeShifts.length})`}
          </p>
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
            {activeShifts.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">No one is currently on shift.</p>
            )}
            {activeShifts.map((s) => {
              const member = members.find((m) => m.id === s.user_id);
              const elapsedSeconds = Math.max(
                0,
                Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000),
              );
              const h = Math.floor(elapsedSeconds / 3600);
              const m = Math.floor((elapsedSeconds % 3600) / 60);
              const sec = elapsedSeconds % 60;
              return (
                <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">
                      {member?.discord_username ?? 'Unknown member'}
                      {member?.callsign && (
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          {member.callsign}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">{s.shift_types?.label ?? 'Shift'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="text-lg font-bold text-amber-400">
                      {h}h {m}m {sec}s
                    </p>
                    <button
                      onClick={() => forceEndShift(s)}
                      disabled={savingId === s.id}
                      className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                    >
                      Force End
                    </button>
                  </div>
                </div>
              );
            })}
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

          <p className="mb-3 mt-10 text-lg font-bold text-white">
            Active LOAs {activeLoas.length > 0 && `(${activeLoas.length})`}
          </p>
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
            {activeLoas.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">No members currently on LOA.</p>
            )}
            {activeLoas.map((r) => {
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
                  <button
                    onClick={() => endLoa(r.id, r.user_id)}
                    disabled={savingId === r.id}
                    className="shrink-0 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-bold text-blue-400 hover:bg-blue-500/25 disabled:opacity-50"
                  >
                    End LOA
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mb-3 mt-10 text-lg font-bold text-white">
            Discipline Records {unifiedRecords.length > 0 && `(${unifiedRecords.length})`}
          </p>
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
            {unifiedRecords.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">No discipline records yet.</p>
            )}
            {unifiedRecords.map((rec) => {
              const member = members.find((m) => m.id === rec.userId);

              if (rec.source === 'discord' && rec.caseRecord) {
                const c = rec.caseRecord;
                return (
                  <div key={rec.key} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">
                          {member?.discord_username ?? 'Unknown member'}{' '}
                          <span
                            className={`ml-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${caseTypeClass(
                              c.punishment_type,
                            )}`}
                          >
                            {c.punishment_type}
                          </span>
                          <span className="ml-1 rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-400">
                            via /punish
                          </span>
                          {c.status !== 'active' && (
                            <span className="ml-1 rounded-md bg-zinc-700/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                              {c.status}
                            </span>
                          )}
                          {c.appeal_status && (
                            <span className="ml-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-400">
                              Appeal: {c.appeal_status}
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">{c.reason}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {new Date(c.created_at).toLocaleString()}
                          {c.duration_minutes ? ` · ${c.duration_minutes}m` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 text-[10px] italic text-zinc-600">
                        Manage via Discord
                      </p>
                    </div>
                  </div>
                );
              }

              const r = rec.manualRecord!;
              const isEditing = editingRecordId === r.id;
              return (
                <div key={rec.key} className="px-5 py-4">
                  {isEditing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={editRecordDraft.type}
                        onChange={(e) =>
                          setEditRecordDraft((prev) => ({ ...prev, type: e.target.value }))
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
                        value={editRecordDraft.reason}
                        onChange={(e) =>
                          setEditRecordDraft((prev) => ({ ...prev, reason: e.target.value }))
                        }
                        placeholder="Reason..."
                        className="min-w-[180px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                      <button
                        onClick={() => saveEditRecord(r)}
                        disabled={savingId === r.id || !editRecordDraft.reason.trim()}
                        className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditRecord}
                        className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">
                          {member?.discord_username ?? 'Unknown member'}{' '}
                          <span className="ml-1 rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                            {r.type}
                          </span>
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">{r.reason}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {new Date(r.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => startEditRecord(r)}
                          disabled={savingId === r.id}
                          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteDisciplineRecord(r)}
                          disabled={savingId === r.id}
                          className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
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

          <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-bold text-white">Members ({members.length})</p>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search by name or callsign..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            {members
              .filter((m) => {
                const q = memberSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  (m.discord_username ?? '').toLowerCase().includes(q) ||
                  (m.callsign ?? '').toLowerCase().includes(q)
                );
              })
              .map((m) => {
                const draft = disciplineDrafts[m.id] ?? { type: 'infraction', reason: '' };
                const adjustDraft = adjustDrafts[m.id] ?? emptyAdjustDraft;
                const totalSeconds = waveTotals[m.id] ?? 0;
                const isExpanded = expandedMemberId === m.id;
                const rankCount = m.member_ranks?.length ?? 0;
                const memberCases = m.discord_id
                  ? discordCases.filter((c) => c.user_id === m.discord_id)
                  : [];
                const activeCaseCount = memberCases.filter((c) => c.status === 'active').length;
                const hasFlags =
                  m.infractions > 0 ||
                  m.strikes > 0 ||
                  m.firewarnings > 0 ||
                  m.loa_status !== 'clear' ||
                  !m.is_active ||
                  activeCaseCount > 0;

                return (
                  <div
                    key={m.id}
                    className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50"
                  >
                    {/* Collapsed summary row — click to expand */}
                    <button
                      type="button"
                      onClick={() => setExpandedMemberId(isExpanded ? null : m.id)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-900"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-amber-400">
                        {(m.discord_username ?? '?').charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate text-sm font-bold text-white">
                            {m.discord_username ?? 'Unknown member'}
                          </p>
                          {m.callsign && (
                            <span className="shrink-0 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">
                              {m.callsign}
                            </span>
                          )}
                          {rankCount > 0 && (
                            <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                              {rankCount} rank{rankCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>

                        {hasFlags && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {m.infractions > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-bold text-yellow-400">
                                <ShieldAlert className="h-2.5 w-2.5" /> {m.infractions} infraction
                                {m.infractions === 1 ? '' : 's'}
                              </span>
                            )}
                            {m.strikes > 0 && (
                              <span className="rounded-md bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-bold text-orange-400">
                                {m.strikes} strike{m.strikes === 1 ? '' : 's'}
                              </span>
                            )}
                            {m.firewarnings > 0 && (
                              <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                                {m.firewarnings} firewarning{m.firewarnings === 1 ? '' : 's'}
                              </span>
                            )}
                            {activeCaseCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-bold text-purple-400">
                                <ShieldAlert className="h-2.5 w-2.5" /> {activeCaseCount} Discord case
                                {activeCaseCount === 1 ? '' : 's'}
                              </span>
                            )}
                            {m.loa_status !== 'clear' && (
                              <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">
                                LOA: {m.loa_status}
                              </span>
                            )}
                            {!m.is_active && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-700/50 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">
                                <Ban className="h-2.5 w-2.5" /> Inactive
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                          {selectedWave?.label ?? 'Shift time'}
                        </p>
                        <p className="text-base font-bold text-amber-400">
                          {formatDuration(totalSeconds)}
                        </p>
                      </div>

                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {/* Expanded editor panel */}
                    {isExpanded && (
                      <div className="border-t border-zinc-800 px-5 py-5">
                        {savingId === m.id && (
                          <p className="mb-3 text-xs text-zinc-500">Saving…</p>
                        )}

                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          Identity
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

                        <p className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          Ranks {rankCount > 0 && `(${rankCount})`}
                        </p>
                        {m.member_ranks && m.member_ranks.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {m.member_ranks.map((r) => (
                              <span
                                key={r}
                                className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-400"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="max-h-48 space-y-3 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                          {RANK_GROUPS.map((group) => (
                            <div key={group.section}>
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                                {group.section}
                              </p>
                              <div className="space-y-1">
                                {group.ranks.map((r) => {
                                  const checked = (m.member_ranks ?? []).includes(r);
                                  return (
                                    <label
                                      key={r}
                                      className="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-zinc-300 hover:bg-zinc-900"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => {
                                          const current = m.member_ranks ?? [];
                                          const next = e.target.checked
                                            ? [...current, r]
                                            : current.filter((x) => x !== r);
                                          updateMember(m.id, { member_ranks: next });
                                        }}
                                        className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-amber-500 focus:ring-amber-500"
                                      />
                                      {r}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        <p className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          Discord punishments {memberCases.length > 0 && `(${memberCases.length})`}
                        </p>
                        {!m.discord_id ? (
                          <p className="text-xs text-zinc-500">
                            No Discord ID on file for this member — can't match /punish cases.
                          </p>
                        ) : memberCases.length === 0 ? (
                          <p className="text-xs text-zinc-500">No cases from /punish yet.</p>
                        ) : (
                          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                            {memberCases.map((c) => (
                              <div
                                key={c.id}
                                className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${caseTypeClass(
                                      c.punishment_type,
                                    )}`}
                                  >
                                    {c.punishment_type}
                                  </span>
                                  <span
                                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                      c.status === 'active'
                                        ? 'bg-red-500/10 text-red-400'
                                        : 'bg-zinc-700/50 text-zinc-400'
                                    }`}
                                  >
                                    {c.status}
                                  </span>
                                  {c.appeal_status && (
                                    <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">
                                      Appeal: {c.appeal_status}
                                    </span>
                                  )}
                                  <span className="ml-auto text-[10px] text-zinc-500">
                                    {new Date(c.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-zinc-300">{c.reason}</p>
                                <p className="mt-1 text-[10px] text-zinc-500">
                                  Mod: {c.moderator_id}
                                  {c.duration_minutes ? ` · ${c.duration_minutes}m` : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="mt-1 text-[10px] text-zinc-600">
                          Managed via /punish, /revoke, and /appeal in Discord — read-only here.
                        </p>

                        <p className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          Log discipline
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
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

                        <div className="mt-5 border-t border-zinc-800 pt-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                              Adjust shift time
                            </p>
                            <p className="text-sm font-bold text-amber-400">
                              Current total: {formatDuration(totalSeconds)}
                            </p>
                          </div>
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
                              value={adjustDraft.days}
                              onChange={(e) =>
                                setAdjustDrafts((prev) => ({
                                  ...prev,
                                  [m.id]: { ...adjustDraft, days: e.target.value },
                                }))
                              }
                              placeholder="0"
                              className="w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-center text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                            <span className="text-xs text-zinc-500">d</span>
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
                    )}
                  </div>
                );
              })}
          </div>

        </>
      )}
    </div>
  );
}
