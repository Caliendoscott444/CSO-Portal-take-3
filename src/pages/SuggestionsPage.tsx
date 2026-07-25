import { useState } from 'react';
import { Send, CheckCircle2, Loader2 } from 'lucide-react';
import PageHero from '../components/PageHero';
import { supabase } from '../lib/supabaseClient';
import { ORG_ABBR } from '../data';

export default function SuggestionsPage() {
  const [discordUser, setDiscordUser] = useState('');
  const [robloxUser, setRobloxUser] = useState('');
  const [message, setMessage] = useState('');
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
      const discordRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-suggestion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            discordUser: discordUser.trim(),
            robloxUser: robloxUser.trim(),
            message: message.trim(),
            orgAbbr: ORG_ABBR,
          }),
        }
      );

      if (!discordRes.ok) {
        const errBody = await discordRes.json().catch(() => ({}));
        throw new Error(errBody.error || `Suggestion function responded with ${discordRes.status}`);
      }

      // Best-effort log to Supabase — a suggestion still counts as submitted
      // even if this secondary write fails, since Discord already has it.
      await supabase.from('suggestions').insert({
        discord_user: discordUser.trim() || null,
        roblox_user: robloxUser.trim() || null,
        message: message.trim(),
      });

      setStatus('success');
      setDiscordUser('');
      setRobloxUser('');
      setMessage('');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHero
        theme="comms"
        eyebrow="We're Listening"
        title="Suggestions"
        subtitle={`Have an idea to improve ${ORG_ABBR}? Submit it here and it goes straight to our staff team's Discord.`}
        tags={['Direct to Staff', 'Reviewed Weekly', 'Your Voice Matters']}
      />

      <section className="mx-auto max-w-2xl px-5 py-14 lg:px-8">
        {status === 'success' ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-6 py-14 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Suggestion sent!</h2>
            <p className="max-w-sm text-sm text-zinc-400">
              Thanks for the feedback — our staff team has been notified.
            </p>
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
            className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Discord User
                </label>
                <input
                  type="text"
                  value={discordUser}
                  onChange={(e) => setDiscordUser(e.target.value)}
                  placeholder="e.g. username"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Roblox User
                </label>
                <input
                  type="text"
                  value={robloxUser}
                  onChange={(e) => setRobloxUser(e.target.value)}
                  placeholder="e.g. username"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Suggestion
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What would you like to see improved or added?"
                rows={6}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
              />
            </div>

            {errorMsg && <p className="mt-3 text-sm text-red-400">{errorMsg}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-400 px-6 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-300 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit Suggestion
            </button>
          </form>
        )}
      </section>
    </>
  );
}
