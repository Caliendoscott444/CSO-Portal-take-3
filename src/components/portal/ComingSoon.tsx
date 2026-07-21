export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-zinc-800 bg-zinc-900/50 p-10 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Coming soon</p>
      <h1 className="mt-2 text-xl font-bold text-white">{title}</h1>
      <p className="mt-2 text-sm text-zinc-400">
        This section isn't built out yet — it's a placeholder so the link doesn't 404. Ask to
        have it fleshed out next.
      </p>
    </div>
  );
}
