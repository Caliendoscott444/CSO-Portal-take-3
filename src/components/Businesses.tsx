import { Swords, type LucideIcon } from 'lucide-react';
import { businesses } from '../data';
import { SectionHeader } from './Departments';

const icons: Record<string, LucideIcon> = {
  Swords,
};

export default function Businesses() {
  return (
    <section id="partners" className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionHeader
          eyebrow="Business Partners"
          title="Our partners"
          subtitle="CSO builds strategic relationships with organizations that share our standards of professionalism, reliability, and tactical capability."
        />

        <div className="mt-14 mx-auto max-w-xl">
          {businesses.map((b) => {
            const Icon = icons[b.icon] ?? Swords;
            return (
              <article
                key={b.name}
                className="group relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-10 transition-all hover:border-amber-500/40 hover:bg-zinc-900/70 text-center"
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'radial-gradient(40% 50% at 50% 0%, rgba(217,119,6,0.08) 0%, transparent 100%)' }} />
                <div className="relative flex flex-col items-center gap-5">
                  <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10 ring-2 ring-amber-500/30 text-amber-300 transition-all group-hover:bg-amber-500/20">
                    <Icon className="h-10 w-10" />
                  </span>
                  <div>
                    <h3 className="text-2xl font-black text-white">
                      {b.name}
                    </h3>
                    <span className="mt-1.5 inline-flex items-center rounded-md bg-zinc-800/70 px-3 py-1 text-xs font-medium uppercase tracking-wider text-zinc-300">
                      {b.type}
                    </span>
                  </div>
                  <p className="relative max-w-md text-base leading-relaxed text-zinc-400">
                    {b.description}
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-zinc-500">
          Interested in a partnership? Reach out through our Discord.
        </p>
      </div>
    </section>
  );
}
