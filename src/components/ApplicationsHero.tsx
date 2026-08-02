export default function ApplicationsHero() {
  return (
    <section className="relative overflow-hidden border-b border-zinc-900/80 pt-32 pb-16 lg:pt-40 lg:pb-20">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div
        className="absolute -top-24 right-0 h-72 w-[32rem] rounded-full bg-amber-600/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="text-amber-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            &gt;&gt;&gt;
          </span>
          <span
            className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Recruitment Status: Active
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse-glow" />
        </div>

        <h1
          className="mt-4 text-6xl leading-[0.95] tracking-wide text-white sm:text-7xl lg:text-8xl"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          Applications Open
        </h1>

        <p className="mt-4 max-w-2xl text-balance text-base leading-relaxed text-zinc-400 sm:text-lg">
          Applications are currently open — here's how to apply and join CSO.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {['All Divisions', 'No Experience Required', 'Training Provided'].map((tag) => (
            <span
              key={tag}
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div
        className="relative mt-14 h-2 w-full opacity-70"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-60deg, #f5b942 0px, #f5b942 2px, transparent 2px, transparent 16px)',
        }}
        aria-hidden="true"
      />
    </section>
  );
}
