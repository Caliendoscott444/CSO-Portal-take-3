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
  { accent: string; glow: string; texture: React.CSSProperties }
> = {
  ops: {
    accent: 'text-amber-400',
    glow: 'rgba(217,119,6,0.14)',
    texture: {
      backgroundImage:
        'repeating-linear-gradient(-45deg, #f5b942 0px, #f5b942 3px, transparent 3px, transparent 14px)',
    },
  },
  personnel: {
    accent: 'text-sky-400',
    glow: 'rgba(56,189,248,0.14)',
    texture: {
      backgroundImage:
        'radial-gradient(circle, #38bdf8 1px, transparent 1px)',
      backgroundSize: '18px 18px',
    },
  },
  command: {
    accent: 'text-amber-400',
    glow: 'rgba(217,119,6,0.14)',
    texture: {
      backgroundImage:
        'repeating-linear-gradient(0deg, #f5b942 0px, #f5b942 2px, transparent 2px, transparent 16px)',
    },
  },
  partners: {
    accent: 'text-emerald-400',
    glow: 'rgba(52,211,153,0.14)',
    texture: {
      backgroundImage:
        'linear-gradient(30deg, #34d399 12%, transparent 12.5%, transparent 87%, #34d399 87.5%, #34d399), linear-gradient(150deg, #34d399 12%, transparent 12.5%, transparent 87%, #34d399 87.5%, #34d399)',
      backgroundSize: '28px 48px',
    },
  },
  media: {
    accent: 'text-fuchsia-400',
    glow: 'rgba(232,121,249,0.14)',
    texture: {
      backgroundImage:
        'radial-gradient(circle, #e879f9 1px, transparent 1px)',
      backgroundSize: '10px 10px',
    },
  },
  comms: {
    accent: 'text-teal-400',
    glow: 'rgba(45,212,191,0.14)',
    texture: {
      backgroundImage:
        'repeating-radial-gradient(circle at 100% 50%, transparent 0, transparent 12px, rgba(45,212,191,0.5) 13px)',
    },
  },
  about: {
    accent: 'text-amber-400',
    glow: 'rgba(217,119,6,0.14)',
    texture: {
      backgroundImage:
        'radial-gradient(circle at 50% 120%, transparent 0%, transparent 30%, #f5b942 30.5%, #f5b942 31%, transparent 31.5%, transparent 45%, #f5b942 45.5%, #f5b942 46%, transparent 46.5%)',
      backgroundSize: '200px 200px',
    },
  },
};

export default function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
  theme = 'ops',
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  theme?: PageHeroTheme;
}) {
  const t = themeConfig[theme];

  return (
    <section className="relative overflow-hidden border-b border-zinc-900/80 pt-32 pb-14 lg:pt-40 lg:pb-16">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div
        className="absolute -top-24 left-0 h-64 w-[32rem] rounded-full blur-3xl"
        style={{ background: t.glow }}
        aria-hidden="true"
      />
      {/* per-page texture motif, right edge */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-40 opacity-[0.06] lg:w-56"
        style={t.texture}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <div className="flex items-center gap-2">
          <span className={t.accent} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            &gt;&gt;&gt;
          </span>
          <span
            className={`text-xs font-bold uppercase tracking-[0.22em] ${t.accent}`}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {eyebrow}
          </span>
        </div>
        <h1
          className="mt-3 max-w-3xl text-balance text-5xl leading-[0.95] tracking-wide text-white sm:text-6xl lg:text-7xl"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 max-w-2xl text-balance text-base leading-relaxed text-zinc-400 sm:text-lg">
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
