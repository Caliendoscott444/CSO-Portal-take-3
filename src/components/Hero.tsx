import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ORG_NAME, ORG_ABBR } from '../data';

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#0a0f1c] pt-40 pb-24 lg:pt-48 lg:pb-32">
      {/* ambient glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(50% 60% at 20% 10%, rgba(217,119,6,0.10) 0%, transparent 70%)',
        }}
      />
      {/* diagonal hazard-stripe texture, right edge — matches Applications page language */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-32 opacity-[0.07] lg:w-48"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, #f5b942 0px, #f5b942 3px, transparent 3px, transparent 14px)',
        }}
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-5 lg:grid-cols-2 lg:px-8">
        {/* Left column — copy */}
        <div className="animate-fade-up">
          <div className="flex items-center gap-2">
            <span className="text-amber-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              &gt;&gt;&gt;
            </span>
            <span
              className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Roblox ER:LC Roleplay
            </span>
          </div>

          <h1
            className="mt-4 text-balance text-6xl leading-[0.95] tracking-wide text-white sm:text-7xl lg:text-8xl"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            Comet Strategic
            <span className="block text-amber-400">Operations</span>
          </h1>

          <p className="mt-6 max-w-xl text-balance text-base leading-relaxed text-zinc-300 sm:text-lg">
            A professional and organized corporation built for protecting
            partnered server VIPs, military combat training, and armed
            protection. Three elite divisions. One mission.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              to="/login"
              className="group relative -rotate-1 inline-flex items-center gap-2 border-2 border-amber-400 bg-amber-400 px-7 py-4 text-base font-bold text-zinc-950 shadow-lg shadow-amber-500/20 transition-all hover:rotate-0 hover:bg-amber-300"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              <span className="text-lg tracking-widest">Open {ORG_ABBR} Panel</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse-glow" />
              <span
                className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Recruitment Active
              </span>
            </div>
          </div>
        </div>

        {/* Right column — badge */}
        <div className="animate-fade-up flex justify-center lg:justify-end" style={{ animationDelay: '120ms' }}>
          <div className="relative">
            {/* corner brackets, tactical HUD framing */}
            <div className="pointer-events-none absolute -inset-6 hidden sm:block">
              <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-amber-400/40" />
              <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-amber-400/40" />
              <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-amber-400/40" />
              <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-amber-400/40" />
            </div>
            <img
              src="/CSO_CORPORATION_LOGO_1-2.png"
              alt={`${ORG_NAME} Crest`}
              className="h-64 w-64 object-contain drop-shadow-[0_0_60px_rgba(217,119,6,0.25)] sm:h-80 sm:w-80 lg:h-96 lg:w-96"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
