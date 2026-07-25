import type { ReactNode } from 'react';

export type PageHeroTheme =
  | 'ops'
  | 'personnel'
  | 'command'
  | 'partners'
  | 'media'
  | 'comms'
  | 'about';

const themeConfig: Record<
  PageHeroTheme,
  { text: string; border: string; bg: string; glow: string; stripe: string }
> = {
  ops: {
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    glow: 'rgba(217,119,6,0.10)',
    stripe: '#f5b942',
  },
  personnel: {
    text: 'text-sky-400',
    border: 'border-sky-500/40',
    bg: 'bg-sky-500/10',
    glow: 'rgba(56,189,248,0.10)',
    stripe: '#38bdf8',
  },
  command: {
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    glow: 'rgba(217,119,6,0.10)',
    stripe: '#f5b942',
  },
  partners: {
    text: 'text-emerald-400',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    glow: 'rgba(52,211,153,0.10)',
    stripe: '#34d399',
  },
  media: {
    text: 'text-fuchsia-400',
    border: 'border-fuchsia-500/40',
    bg: 'bg-fuchsia-500/10',
    glow: 'rgba(232,121,249,0.10)',
    stripe: '#e879f9',
  },
  comms: {
    text: 'text-teal-400',
    border: 'border-teal-500/40',
    bg: 'bg-teal-500/10',
    glow: 'rgba(45,212,191,0.10)',
    stripe: '#2dd4bf',
  },
  about: {
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    glow: 'rgba(217,119,6,0.10)',
    stripe: '#f5b942',
  },
};

export default function PageHero({
  eyebrow,
  title,
  subtitle,
  tags,
  children,
  theme = 'ops',
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  tags?: string[];
  children?: ReactNode;
  theme?: PageHeroTheme;
}) {
  const t = themeConfig[theme];

  return (
    <section className="relative overflow-hidden border-b border-zinc-900/80 pt-32 pb-0 lg:pt-40">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div
        className="absolute -top-24 right-0 h-72 w-[32rem] rounded-full blur-3xl"
        style={{ background: t.glow }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-5 pb-16 lg:px-8 lg:pb-20">
        <div className="flex items-center gap-2">
          <span className={t.text} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            &gt;&gt;&gt;
          </span>
          <span
            className={`text-xs font-bold uppercase tracking-[0.22em] ${t.text}`}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {eyebrow}
          </span>
          <span className={`h-1.5 w-1.5 rounded-full animate-pulse-glow ${t.bg.replace('/10', '')}`} />
        </div>

        <h1
          className="mt-4 max-w-3xl text-balance text-6xl leading-[0.95] tracking-wide text-white sm:text-7xl lg:text-8xl"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          {title}
        </h1>

        {subtitle && (
          <p className="mt-4 max-w-2xl text-balance text-base leading-relaxed text-zinc-400 sm:text-lg">
            {subtitle}
          </p>
        )}

        {tags && tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className={`rounded border ${t.border} ${t.bg} px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${t.text}`}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {children}
      </div>

      {/* full-width diagonal hazard-stripe divider — the Applications page signature */}
      <div
        className="relative h-2 w-full opacity-70"
        style={{
          backgroundImage: `repeating-linear-gradient(-60deg, ${t.stripe} 0px, ${t.stripe} 2px, transparent 2px, transparent 16px)`,
        }}
        aria-hidden="true"
      />
    </section>
  );
}
