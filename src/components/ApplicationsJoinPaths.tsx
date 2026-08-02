import { Users, UserPlus } from 'lucide-react';

const paths = [
  {
    icon: Users,
    title: 'Personnel',
    description:
      "Personnel are the members who join CSO's divisions — they help carry out operations, train, and contribute directly to the corporation's missions.",
  },
  {
    icon: UserPlus,
    title: 'Recruiter',
    description:
      'Recruiters focus solely on bringing new members into CSO — connecting with potential applicants and guiding them through the joining process.',
  },
];

const steps = [
  {
    title: 'Talk to a recruiter.',
    description:
      "All recruiters know CSO well and can talk you through what it's like to join. They'll help you understand the different opportunities available and guide you to an informed decision.",
  },
  {
    title: 'Fill out the application.',
    description:
      'All members that want to join are to fill out the application so we know what you want to join.',
  },
  {
    title: 'Complete the CSO training.',
    description:
      'The CSO training is quick and easy — it briefly covers what CSO is and what we do, then asks you a few questions about it.',
  },
  {
    title: 'Complete all 3 warden trainings.',
    description:
      'After training you will become a Warden. To go up in ranks you must complete all 3 trainings, after which you will be placed into a division.',
  },
  {
    title: 'Pick a division.',
    description:
      "You'll be given 3 divisions and 3 units to choose from. After choosing, they'll host a tryout for you — once you pass, you're officially in that division or unit.",
  },
];

export default function ApplicationsJoinPaths() {
  return (
    <section className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <div className="flex items-center gap-2">
              <span className="text-amber-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                &gt;&gt;&gt;
              </span>
              <span
                className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Two Ways In
              </span>
            </div>
            <h2
              className="mt-3 text-4xl leading-[0.95] tracking-wide text-white sm:text-5xl"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              Personnel or Recruiter
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
              Every application follows the same five steps — pick the path that fits what you want out of CSO.
            </p>

            <div className="mt-8 flex flex-col gap-4">
              {paths.map((p) => (
                <div
                  key={p.title}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition-colors hover:border-amber-500/40"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
                    <p.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-white">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{p.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="flex flex-col gap-4">
              {steps.map((step, i) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 transition-colors hover:border-amber-500/40 lg:p-8"
                >
                  <span
                    className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    Step {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-2 text-xl font-bold text-white sm:text-2xl">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400 sm:text-base">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
