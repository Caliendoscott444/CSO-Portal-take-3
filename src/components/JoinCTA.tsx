import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

function handleSpotlight(e: React.MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  e.currentTarget.style.setProperty('--x', `${x}%`);
  e.currentTarget.style.setProperty('--y', `${y}%`);
}

export default function JoinCTA() {
  return (
    <section className="relative py-24 lg:py-32 border-y border-zinc-900/80 bg-zinc-950/40">
      <div className="mx-auto max-w-4xl px-5 text-center lg:px-8">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-400">
          Join the Corporation
        </span>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl text-balance">
          Train with purpose.
          <br />
          Operate with discipline.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-zinc-400">
          Recruitment opens through scheduled training classes. Selected applicants complete
          division training before beginning supervised operations alongside the corps.
        </p>
        <Link
          to="/divisions"
          className="spotlight group mt-8 inline-flex items-center gap-2.5 rounded-xl border border-zinc-700 bg-zinc-900/50 px-7 py-4 text-base font-semibold text-white backdrop-blur transition-all hover:border-amber-500/40 hover:bg-zinc-800/70"
          onMouseMove={handleSpotlight}
        >
          Explore the divisions
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}
