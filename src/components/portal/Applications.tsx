const APPLICATIONS_URL = 'https://discord.com/channels/1462468082931990551/1462504644285698273';

export default function Applications() {
  return (
    <div className="mx-auto max-w-xl">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Recruitment</p>
      <h1 className="mt-1 text-2xl font-black text-white">Applications</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Apply for CSO or review active recruitment information in our Discord.
      </p>

      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-sm text-zinc-400">
          All CSO applications are submitted and reviewed in our Discord server.
        </p>
        <a
          href={APPLICATIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-zinc-950 hover:bg-amber-400"
        >
          Apply Here
        </a>
      </div>
    </div>
  );
}
