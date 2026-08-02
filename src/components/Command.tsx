import { commanders } from '../data';
import SectionHeader from './SectionHeader';

const accentMap: Record<string, { gradient: string; text: string; ring: string; badge: string }> = {
  amber: {
    gradient: 'from-amber-500/30 to-amber-900/10',
    text: 'text-amber-300',
    ring: 'ring-amber-500/30',
    badge: 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30',
  },
  orange: {
    gradient: 'from-orange-500/25 to-orange-900/5',
    text: 'text-orange-300',
    ring: 'ring-orange-500/30',
    badge: 'bg-orange-500/10 text-orange-300 ring-1 ring-orange-500/30',
  },
  sky: {
    gradient: 'from-sky-500/25 to-sky-900/5',
    text: 'text-sky-300',
    ring: 'ring-sky-500/30',
    badge: 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30',
  },
};

const rankOrder: Record<string, number> = {
  'Grand Commander': 0,
  'Operations Commander': 1,
  'Capital Commander': 2,
};

export default function Command() {
  const sorted = [...commanders].sort(
    (a, b) => (rankOrder[a.rank] ?? 99) - (rankOrder[b.rank] ?? 99),
  );

  return (
    <section className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionHeader
          eyebrow="Command Staff"
          title="The commanders of CSO"
          subtitle="Three commanders. One chain of authority. The leadership that directs every operation, enforces discipline, and sets the strategic direction of the corporation."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {sorted.map((c, i) => {
            const a = accentMap[c.accent] ?? accentMap.amber;
            const isGrand = i === 0;
            return (
              <article
                key={c.name}
                className={`group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-7 transition-all hover:border-zinc-700 hover:-translate-y-1 hover:bg-zinc-900/70 ${
                  isGrand ? 'sm:col-span-3 lg:col-span-1' : ''
                }`}
              >
                <div className={`absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br blur-3xl opacity-30 ${a.gradient}`} />
                <div className="relative flex flex-col items-center text-center">
                  <div
                    className={`relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ring-2 ${a.ring} ${a.gradient}`}
                  >
                    <span className={`text-2xl font-black ${a.text}`}>
                      {c.initials}
                    </span>
                    {isGrand && (
                      <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[9px] font-black text-zinc-950">
                        ★
                      </span>
                    )}
                  </div>
                  <div className="mt-4">
                    <h3 className="text-base font-bold text-white break-all">
                      {c.name}
                    </h3>
                    <p className={`mt-1 text-xs font-semibold uppercase tracking-[0.16em] ${a.text}`}>
                      {c.rank}
                    </p>
                    <span className={`mt-2 inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${a.badge}`}>
                      {c.division}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-zinc-400 text-left">
                    {c.bio}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
