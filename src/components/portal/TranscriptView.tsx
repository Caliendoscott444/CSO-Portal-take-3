import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

export default function TranscriptView() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setError('You need to be signed in to view this transcript.');
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-transcript?id=${encodeURIComponent(ticketId ?? '')}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(body.error ?? `Could not load transcript (${res.status}).`);
          }
          return;
        }

        const text = await res.text();
        if (!cancelled) setHtml(text);
      } catch {
        if (!cancelled) setError('Something went wrong loading the transcript.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading transcript...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-red-400">Access Restricted</p>
          <h1 className="mt-2 text-lg font-bold text-white">Can't load this transcript</h1>
          <p className="mt-2 text-sm text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      title="Ticket Transcript"
      srcDoc={html ?? ''}
      className="h-screen w-full border-0"
    />
  );
}