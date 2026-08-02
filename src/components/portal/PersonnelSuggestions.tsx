import { useState } from 'react';
import { Send, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function PersonnelSuggestions() {
  const { profile } = useAuth();
  const [message, setMessage] = useState('');
  const [robloxUser, setRobloxUser] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (!message.trim()) {
      setErrorMsg('Please write a suggestion before submitting.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-personnel-suggestion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            discordUser: profile?.discord_username ?? '',
            robloxUser: robloxUser.trim(),
            message: message.trim(),
            orgAbbr: 'CSO',
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed with ${res.status}`);
      }

      setStatus('success');
      setMessage('');
      setRobloxUser('');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Internal</p>
      <h1 className="mt-1 text-2xl font-black text-white">Personnel Suggestions</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Have an idea for how CSO should run internally? Submit it here and it goes straight to staff on Discord.
      </p>

      {status === 'success' ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-6 py-14 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">Suggestion sent!</h2>
          <p className="max-w-sm text-sm text-zinc-400">Thanks for the feedback, staff has been notified.</p>
          <button
            onClick={() => setStatus('idle')}
            className="mt-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-amber-500/40 hover:text-white"
          >
            Submit another
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
        >
          <div>
            <label className="text-sm font-semibold text-white">Roblox User (optional)</label>
            <input
              type="text"
              value={robloxUser}
              onChange={(e) => setRobloxUser(e.target.value)}
              placeholder="e.g. username"
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-white">Suggestion</label>
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What should CSO add, change, or improve internally?"
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-all hover:bg-amber-400 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? 'Submitting...' : 'Submit Suggestion'}
          </button>
        </form>
      )}
    </div>
  );
}
