import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, LoaRequest } from '../../lib/supabaseClient';

export default function LeaveOfAbsence() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<LoaRequest[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('loa_requests')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    setRequests(data ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setSubmitting(true);
    const { error: insertErr } = await supabase.from('loa_requests').insert({
      user_id: profile.id,
      start_date: startDate,
      end_date: endDate,
      reason,
    });
    setSubmitting(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-loa`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            discordUsername: profile.discord_username ?? '',
            startDate,
            endDate,
            reason,
            orgAbbr: 'CSO',
          }),
        }
      );
    } catch {
      // silent - Discord notification is best-effort
    }
    setStartDate('');
    setEndDate('');
    setReason('');
    load();
  };

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Leave</p>
      <h1 className="mt-1 text-2xl font-black text-white">Leave of Absence</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Submit a new LOA request or review the status of your past requests.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
      >
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-white">Start date</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-white">End date</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-white">Reason</label>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            placeholder="Briefly describe why you're requesting leave..."
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-all hover:bg-amber-400 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>

      <p className="mb-3 mt-8 text-sm font-bold text-white">Your requests</p>
      <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
        {requests.length === 0 && (
          <p className="px-5 py-6 text-sm text-zinc-500">No LOA requests submitted yet.</p>
        )}
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-white">
                {r.start_date} → {r.end_date}
              </p>
              <p className="text-sm text-zinc-400">{r.reason}</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
                r.status === 'approved'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : r.status === 'denied'
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-amber-500/15 text-amber-400'
              }`}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
