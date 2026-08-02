import { ArrowRight } from 'lucide-react';
import { DiscordIcon } from './Navbar';

const APPLICATIONS_URL = 'https://discord.com/channels/1462468082931990551/1462504644285698273';

export default function HowToJoin() {
  return (
    <section id="join" className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="text-amber-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            &gt;&gt;&gt;
          </span>
          <span
            className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Getting Started
          </span>
        </div>
        <h2
          className="mt-2 text-4xl tracking-wide text-white sm:text-5xl"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          How to Join
        </h2>

        <div className="relative mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-amber-500/25 bg-zinc-900/40">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-600/15 blur-3xl" />
          <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-amber-800/10 blur-3xl" />

          <div className="relative flex items-center justify-between border-b border-amber-500/20 px-6 py-3 sm:px-10">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Enlistment Record
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Form CSO-04
            </span>
          </div>

          <div className="relative p-8 sm:p-12">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex gap-4">
                <span
                  className="shrink-0 text-3xl text-amber-500/50"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  01
                </span>
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-white">
                    Join our Discord
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Connect with the CSO community and get access to the applications channel.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <span
                  className="shrink-0 text-3xl text-amber-500/50"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  02
                </span>
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-white">
                    Fill out the application
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Tell us about yourself, we'd love to have you on the team.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10 flex justify-center">
              <div className="rotate-[-2deg] rounded-lg border-2 border-amber-400 p-1 transition-transform hover:rotate-0">
                <a
                  href={APPLICATIONS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="spotlight group flex items-center gap-2.5 rounded-md bg-[#5865F2] px-7 py-4 text-base font-semibold text-white shadow-xl shadow-indigo-600/30 transition-all hover:bg-[#4752c4]"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    e.currentTarget.style.setProperty('--x', `${x}%`);
                    e.currentTarget.style.setProperty('--y', `${y}%`);
                  }}
                >
                  <DiscordIcon className="h-5 w-5" />
                  Join Discord & Apply
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
