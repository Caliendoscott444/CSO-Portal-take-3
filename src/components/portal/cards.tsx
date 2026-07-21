import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function StatCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: ReactNode;
  caption: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-amber-400">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{caption}</p>
    </div>
  );
}

export function ToolCard({
  to,
  href,
  icon,
  eyebrow,
  title,
  description,
  highlight,
}: {
  to?: string;
  href?: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  highlight?: boolean;
}) {
  const inner = (
    <div
      className={`h-full rounded-xl border p-5 transition-all hover:-translate-y-0.5 ${
        highlight
          ? 'border-amber-500/30 bg-gradient-to-b from-zinc-900 to-zinc-900/40 hover:border-amber-500/50'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
      }`}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-300">
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
        {eyebrow}
      </p>
      <p className="mt-0.5 text-base font-bold text-white">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{description}</p>
    </div>
  );

  if (to) return <Link to={to}>{inner}</Link>;
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  return inner;
}

export function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-4 mt-10 flex items-baseline justify-between">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">{kicker}</p>
      <p className="text-lg font-bold text-white">{title}</p>
    </div>
  );
}
