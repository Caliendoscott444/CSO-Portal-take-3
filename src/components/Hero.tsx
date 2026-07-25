import { ArrowRight, ChevronDown } from 'lucide-react';
import { DISCORD_URL, stats, ORG_ABBR } from '../data';
import { DiscordIcon } from './Navbar';

export default function Hero() {
  return (
    <section id="home" className="relative overflow-hidden pt-32 pb-20 lg:pt-44 lg:pb-28">
      <div className="absolute inset-0 bg-grid opacity-50" />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 60% at 50% 0%, rgba(217,119,6,0.12) 0%, transparent 70%)' }} />
      <div className="absolute -top-32 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-amber-600/15 blur-3xl animate-pulse-glow" />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="animate-fade-up inline-flex items-center gap-3">
            <img
              src="/CSO_CORPORATION_LOGO_1-2.png"
              alt={`${ORG_ABBR} Logo`}
              className="h-16 w-16 object-contain opacity-95 sm:h-20 sm:w-20"
            />
          </div>

          <h1
            className="animate-fade-up mt-6 text-balance text-4xl font-black leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl"
            style={{ animationDelay: '60ms' }}
          >
            Comet Strategic
            <span className="block bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
              Operations
            </span>
            Corporation
          </h1>

          <p
            className="animate-fade-up mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-zinc-300 sm:text-lg"
            style={{ animationDelay: '120ms' }}
          >
            A professional and organized corporation built for protecting partnered
            server VIPs, military combat training, and armed protection. Three elite
            divisions. One mission.
          </p>

          <div
            className="animate-fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ animationDelay: '180ms' }}
          >
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#5865F2] px-7 py-4 text-base font-semibold text-white shadow-xl shadow-indigo-600/30 transition-all hover:bg-[#4752c4] hover:-translate-y-0.5 hover:shadow-indigo-600/50 sm:w-auto"
            >
              <DiscordIcon className="h-5 w-5" />
              Join Our Discord
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#divisions"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/40 px-7 py-4 text-base font-semibold text-zinc-100 backdrop-blur transition-colors hover:border-zinc-500 hover:bg-zinc-800/60 sm:w-auto"
            >
              Explore Divisions
            </a>
          </div>
        </div>

        <div
          className="animate-fade-up mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4"
          style={{ animationDelay: '240ms' }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-5 py-6 text-center backdrop-blur transition-colors hover:border-amber-500/30"
            >
              <div className="bg-gradient-to-b from-amber-300 to-amber-600 bg-clip-text text-3xl font-black text-transparent sm:text-4xl">
                {s.value}
              </div>
              <div className="mt-1.5 text-xs uppercase tracking-[0.14em] text-zinc-400">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <a
          href="#divisions"
          className="mt-14 flex items-center justify-center text-zinc-500 transition-colors hover:text-zinc-300"
          aria-label="Scroll to divisions"
        >
          <ChevronDown className="h-6 w-6 animate-bounce" />
        </a>
      </div>
    </section>
  );
}
