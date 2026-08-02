import { stats } from '../data';

export default function ApplicationsStats() {
  return (
    <section className="relative border-y border-zinc-900/80 bg-zinc-900/20 py-10">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p
                className="text-4xl text-amber-400 sm:text-5xl"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {s.value}
              </p>
              <p
                className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
