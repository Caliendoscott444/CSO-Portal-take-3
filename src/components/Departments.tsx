import { useState } from 'react';
import {
  Crosshair,
  Radar,
  Package,
  Check,
  ChevronRight,
} from 'lucide-react';
import { divisions as allDivisions } from '../data';

// Only Support & Logistics is shown here for now — Operations and Capital
// stay in data.ts for pages that still reference them (e.g. Command page).
const divisions = allDivisions.filter((d) => d.id === 'support');

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  Crosshair,
  Radar,
  Package,
};

const accentMap: Record<string, {
  text: string; ring: string; chip: string; dot: string; bar: string; bg: string;
}> = {
  amber: {
    text: 'text-amber-300',
    ring: 'ring-amber-500/30',
    chip: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
    bar: 'from-amber-500 to-yellow-400',
    bg: 'bg-amber-500/10',
  },
  sky: {
    text: 'text-sky-300',
    ring: 'ring-sky-500/30',
    chip: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    dot: 'bg-sky-400',
    bar: 'from-sky-500 to-blue-400',
    bg: 'bg-sky-500/10',
  },
  emerald: {
    text: 'text-emerald-300',
    ring: 'ring-emerald-500/30',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
    bar: 'from-emerald-500 to-teal-400',
    bg: 'bg-emerald-500/10',
  },
};

export default function Departments() {
  const [activeId, setActiveId] = useState(divisions[0].id);
  const active = divisions.find((d) => d.id === activeId)!;
  const a = accentMap[active.accent];
  const ActiveIcon = icons[active.icon];

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-4 flex flex-col gap-3">
        {divisions.map((d) => {
          const da = accentMap[d.accent];
          const Icon = icons[d.icon];
          const isActive = d.id === activeId;
          return (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={`group flex items-start gap-4 rounded-2xl border p-5 text-left transition-all ${
                isActive
                  ? `border-zinc-700 bg-zinc-900/80 ring-1 ${da.ring}`
                  : 'border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/60'
              }`}
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${da.bg} ring-1 ${da.ring} ${da.text}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-base font-semibold text-white">
                    {d.shortName}
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${da.dot} ${isActive ? '' : 'opacity-40'}`} />
                </span>
                <span className="mt-1 block text-xs text-zinc-400">
                  {d.name}
                </span>
              </span>
              <ChevronRight
                className={`mt-2 h-4 w-4 shrink-0 text-zinc-600 transition-all ${
                  isActive ? `${da.text} translate-x-0.5` : 'group-hover:translate-x-0.5'
                }`}
              />
            </button>
          );
        })}

        {active.units.length === 0 && (
          <p className="px-1 text-xs leading-relaxed text-zinc-600">
            Units are assigned within divisions as specialized capabilities are stood up.
          </p>
        )}
      </div>

      <div className="lg:col-span-8">
        <div
          key={active.id}
          className="animate-fade-up relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 p-7 lg:p-9"
        >
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${a.bar}`} />
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] ${a.chip}`}
            >
              <ActiveIcon className="h-3.5 w-3.5" />
              {active.shortName}
            </span>
            {active.units.length > 0 && (
              <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                {active.units.length} specialized {active.units.length === 1 ? 'unit' : 'units'}
              </span>
            )}
          </div>

          <h3 className="mt-5 text-2xl font-bold text-white sm:text-3xl">
            {active.name}
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            {active.description}
          </p>

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {active.responsibilities.map((r) => (
              <div
                key={r}
                className="flex items-center gap-2.5 rounded-lg bg-zinc-800/40 px-3.5 py-2.5 text-sm text-zinc-200"
              >
                <Check className={`h-4 w-4 shrink-0 ${a.text}`} />
                {r}
              </div>
            ))}
          </div>

          {active.units.length > 0 && (
            <div className="mt-8">
              <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Specialized Units
              </h4>
              <div className="mt-4 grid gap-4">
                {active.units.map((u) => (
                  <div
                    key={u.name}
                    className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-5 transition-all hover:border-zinc-700 hover:bg-zinc-900/60"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`h-2 w-2 rounded-full ${a.dot}`} />
                      <h5 className="text-sm font-bold text-white">
                        {u.name}
                      </h5>
                    </div>
                    <p className="mt-2.5 text-sm leading-relaxed text-zinc-400">
                      {u.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
