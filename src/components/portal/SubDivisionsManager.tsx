import { useEffect, useState } from 'react';
import { Trash2, Plus, Loader2, Users, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

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

type MemberOption = {
  id: string;
  discord_username: string | null;
  sub_division_id: string | null;
  is_active: boolean;
};

const emptyForm = {
  name: '',
  short_name: '',
  description: '',
  image_url: '',
  coming_soon: false,
  applications_open: true,
  display_order: 0,
};

export default function SubDivisionsManager() {
  const [rows, setRows] = useState<SubDivisionRow[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    const [subDivRes, membersRes] = await Promise.all([
      supabase.from('sub_divisions').select('*').order('display_order', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, discord_username, sub_division_id, is_active')
        .order('discord_username', { ascending: true }),
    ]);
    setRows(subDivRes.data ?? []);
    setMembers(membersRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.short_name.trim() || !form.description.trim()) {
      setError('Name, short name, and description are required.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('sub_divisions').insert({
      name: form.name.trim(),
      short_name: form.short_name.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim() || null,
      coming_soon: form.coming_soon,
      applications_open: form.applications_open,
      display_order: form.display_order,
    });
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setForm(emptyForm);
    loadAll();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this sub-division? Members assigned to it will be unassigned.')) return;
    await supabase.from('sub_divisions').delete().eq('id', id);
    loadAll();
  }

  async function assignMember(subDivisionId: string, memberId: string) {
    setAssigningId(memberId);
    await supabase.from('profiles').update({ sub_division_id: subDivisionId }).eq('id', memberId);
    await loadAll();
    setAssigningId(null);
  }

  async function unassignMember(memberId: string) {
    setAssigningId(memberId);
    await supabase.from('profiles').update({ sub_division_id: null }).eq('id', memberId);
    await loadAll();
    setAssigningId(null);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-2xl font-black text-white">Sub-Divisions Manager</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Add sub-divisions and their banner image link — they'll appear on the public
        Sub-Divisions page right away. Same as Media Manager: paste a direct image link
        (Imgur, Discord attachment link, etc.).
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid grid-cols-1 gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:grid-cols-2"
      >
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="C.O.M.E.T. Task Force"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Badge (short name)
          </label>
          <input
            type="text"
            value={form.short_name}
            onChange={(e) => setForm({ ...form, short_name: e.target.value })}
            placeholder="COMET"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            placeholder="Actions speak louder than words..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Image link <span className="normal-case text-zinc-600">(optional — leave blank for a "Coming Soon" card)</span>
          </label>
          <input
            type="text"
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            placeholder="https://..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="coming_soon"
            checked={form.coming_soon}
            onChange={(e) => setForm({ ...form, coming_soon: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500/50"
          />
          <label htmlFor="coming_soon" className="text-sm text-zinc-300">
            Mark as "Coming Soon"
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="applications_open"
            checked={form.applications_open}
            onChange={(e) => setForm({ ...form, applications_open: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500/50"
          />
          <label htmlFor="applications_open" className="text-sm text-zinc-300">
            Applications open
          </label>
        </div>

        {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-300 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add Sub-Division
          </button>
        </div>
      </form>

      <div className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
          Current Sub-Divisions ({rows.length})
        </h2>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No sub-divisions added yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map((r) => {
              const assignedMembers = members.filter((m) => m.sub_division_id === r.id);
              const unassignedActive = members.filter((m) => !m.sub_division_id && m.is_active);
              const isExpanded = expandedId === r.id;
              return (
                <div key={r.id} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40">
                  <div className="flex items-center gap-3 p-4">
                    {r.image_url ? (
                      <img src={r.image_url} alt={r.name} className="h-14 w-14 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-800 text-[10px] text-zinc-500">
                        No image
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">
                        {r.name}{' '}
                        <span className="ml-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">
                          {r.short_name}
                        </span>
                        {r.coming_soon && (
                          <span className="ml-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">
                            Coming Soon
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{r.description}</p>
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {assignedMembers.length} member{assignedMembers.length === 1 ? '' : 's'}
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                      aria-label="Delete sub-division"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-zinc-800 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Assigned members
                      </p>
                      {assignedMembers.length === 0 ? (
                        <p className="mt-2 text-xs text-zinc-600">No members assigned yet.</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assignedMembers.map((m) => (
                            <span
                              key={m.id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200"
                            >
                              {m.discord_username ?? 'Unknown'}
                              <button
                                onClick={() => unassignMember(m.id)}
                                disabled={assigningId === m.id}
                                className="text-zinc-500 hover:text-red-400"
                                aria-label="Unassign"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <label className="mb-1.5 mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Assign a member
                      </label>
                      <select
                        value=""
                        onChange={(e) => e.target.value && assignMember(r.id, e.target.value)}
                        className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500/50 focus:outline-none"
                      >
                        <option value="">Select an active member…</option>
                        {unassignedActive.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.discord_username ?? m.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
