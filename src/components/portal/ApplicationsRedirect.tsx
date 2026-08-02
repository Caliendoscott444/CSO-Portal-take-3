import { useEffect } from 'react';

const APPLICATIONS_URL = 'https://discord.com/channels/1462468082931990551/1462504644285698273';

export default function ApplicationsRedirect() {
  useEffect(() => {
    window.location.href = APPLICATIONS_URL;
  }, []);

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Redirecting</p>
      <h1 className="mt-2 text-xl font-bold text-white">Taking you to Discord…</h1>
      <p className="mt-2 text-sm text-zinc-400">
        If you're not redirected automatically,{' '}
        <a href={APPLICATIONS_URL} className="text-amber-400 underline">
          click here
        </a>
        .
      </p>
    </div>
  );
}
