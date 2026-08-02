import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function RecruitmentBanner() {
  return (
    <div className="relative mx-auto -mt-6 max-w-5xl px-5 lg:px-8">
      <Link
        to="/applications"
        className="group relative flex flex-col items-stretch gap-5 overflow-hidden rounded-2xl border border-amber-500/25 bg-zinc-900/70 px-6 py-6 backdrop-blur transition-all hover:border-amber-500/50 sm:flex-row sm:items-center sm:gap-8 sm:px-8"
      >
        {/* Diagonal stripe texture, left edge */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-24 opacity-[0.12] sm:w-32"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-45deg, #f5b942 0px, #f5b942 3px, transparent 3px, transparent 14px)',
          }}
        />

        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-amber-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              &gt;&gt;&gt;
            </span>
            <span
              className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Recruitment Status: Active
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse-glow" />
          </div>

          <h3
            className="mt-2 text-3xl leading-none tracking-wide text-white sm:text-4xl"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            Applications Open
          </h3>

          <p className="mt-2 max-w-md text-sm text-zinc-400">
            We're looking for our next class of operators. All divisions currently accepting recruits.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
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

        <div className="relative shrink-0 self-center sm:self-auto">
          <div
            className="flex -rotate-3 items-center gap-2 rounded border-2 border-amber-400 px-5 py-2.5 text-amber-400 transition-transform group-hover:rotate-0 group-hover:scale-105"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            <span className="text-xl tracking-widest">Apply Now</span>
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </Link>
    </div>
  );
}
