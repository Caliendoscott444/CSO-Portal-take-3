import { useState } from 'react';
import { Crosshair, Radar, Package, ArrowRight, RotateCcw, Check } from 'lucide-react';
import { divisions } from '../data';

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  Crosshair,
  Radar,
  Package,
};

const accentMap: Record<string, { text: string; ring: string; chip: string; bar: string; bg: string }> = {
  amber: {
    text: 'text-amber-300',
    ring: 'ring-amber-500/30',
    chip: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    bar: 'from-amber-500 to-yellow-400',
    bg: 'bg-amber-500/10',
  },
  sky: {
    text: 'text-sky-300',
    ring: 'ring-sky-500/30',
    chip: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    bar: 'from-sky-500 to-blue-400',
    bg: 'bg-sky-500/10',
  },
  emerald: {
    text: 'text-emerald-300',
    ring: 'ring-emerald-500/30',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    bar: 'from-emerald-500 to-teal-400',
    bg: 'bg-emerald-500/10',
  },
};

type MatchQuestion = {
  prompt: string;
  options: { label: string; divisionId: string }[];
};

const matchQuestions: MatchQuestion[] = [
  {
    prompt: 'What kind of role appeals to you most?',
    options: [
      { label: 'Leading events & keeping order', divisionId: 'operations' },
      { label: 'Training others & running convoys', divisionId: 'support' },
      { label: 'Specialized, technical work', divisionId: 'capital' },
    ],
  },
  {
    prompt: 'How do you prefer to operate?',
    options: [
      { label: 'Big picture — coordinating people', divisionId: 'operations' },
      { label: 'Hands-on with a tight-knit task force', divisionId: 'support' },
      { label: 'Independently, with a specialized skillset', divisionId: 'capital' },
    ],
  },
  {
    prompt: 'What draws you in most?',
    options: [
      { label: 'Discipline, structure, high-level oversight', divisionId: 'operations' },
      { label: 'Fast-paced training & logistics', divisionId: 'support' },
      { label: 'Aviation, medical, recon, or contracting', divisionId: 'capital' },
    ],
  },
];

const readinessOptions = [
  { label: 'Very active — daily Discord & regular shifts', score: 2 },
  { label: 'Moderately active — a few times a week', score: 1 },
  { label: 'Just getting started, still deciding', score: 0 },
];

const readinessNotes: Record<number, string> = {
  2: "You're ready to apply right now.",
  1: "You're in good shape — apply whenever you're ready.",
  0: 'No pressure — read through the divisions above and apply whenever you feel ready.',
};

const TOTAL_STEPS = matchQuestions.length + 1;

export default function ApplicationsQuiz() {
  const [step, setStep] = useState(0);
  const [divisionTally, setDivisionTally] = useState<Record<string, number>>({});
  const [readinessScore, setReadinessScore] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  function answerMatch(divisionId: string) {
    setDivisionTally((prev) => ({ ...prev, [divisionId]: (prev[divisionId] ?? 0) + 1 }));
    setStep((s) => s + 1);
  }

  function answerReadiness(score: number) {
    setReadinessScore(score);
    setFinished(true);
  }

  function restart() {
    setStep(0);
    setDivisionTally({});
    setReadinessScore(null);
    setFinished(false);
  }

  const matchedDivisionId = Object.entries(divisionTally).sort((a, b) => b[1] - a[1])[0]?.[0];
  const matchedDivision = divisions.find((d) => d.id === matchedDivisionId) ?? divisions[0];
  const accent = accentMap[matchedDivision.accent];
  const MatchedIcon = icons[matchedDivision.icon];

  return (
    <section className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-4xl px-5 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="text-amber-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            &gt;&gt;&gt;
          </span>
          <span
            className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Find Your Fit
          </span>
        </div>
        <h2
          className="mt-2 text-4xl tracking-wide text-white sm:text-5xl"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          Division Match Quiz
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Answer a few quick questions and we'll point you toward the division that fits you best.
        </p>

        <div className="relative mt-10 overflow-hidden rounded-2xl border border-amber-500/25 bg-zinc-900/40">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-600/15 blur-3xl" />

          {/* Progress dots */}
          <div className="relative flex items-center gap-2 border-b border-amber-500/20 px-6 py-4 sm:px-10">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < step || finished ? 'bg-amber-400' : i === step ? 'bg-amber-500/40' : 'bg-zinc-700/60'
                }`}
              />
            ))}
          </div>

          <div className="relative p-8 sm:p-12">
            {!finished && step < matchQuestions.length && (
              <div>
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Question {step + 1} of {matchQuestions.length + 1}
                </span>
                <h3 className="mt-3 text-xl font-bold text-white sm:text-2xl">
                  {matchQuestions[step].prompt}
                </h3>
                <div className="mt-6 grid gap-3">
                  {matchQuestions[step].options.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => answerMatch(opt.divisionId)}
                      className="group flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 px-5 py-4 text-left text-sm font-medium text-zinc-200 transition-all hover:border-amber-500/40 hover:bg-amber-500/5 hover:text-white"
                    >
                      {opt.label}
                      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-amber-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!finished && step === matchQuestions.length && (
              <div>
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Question {matchQuestions.length + 1} of {matchQuestions.length + 1}
                </span>
                <h3 className="mt-3 text-xl font-bold text-white sm:text-2xl">
                  How active can you be?
                </h3>
                <div className="mt-6 grid gap-3">
                  {readinessOptions.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => answerReadiness(opt.score)}
                      className="group flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 px-5 py-4 text-left text-sm font-medium text-zinc-200 transition-all hover:border-amber-500/40 hover:bg-amber-500/5 hover:text-white"
                    >
                      {opt.label}
                      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-amber-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {finished && (
              <div className="animate-fade-up">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Your Match
                </span>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accent.bg} ring-1 ${accent.ring} ${accent.text}`}
                  >
                    <MatchedIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="text-2xl font-bold text-white sm:text-3xl">
                      {matchedDivision.name}
                    </h3>
                  </div>
                </div>

                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
                  {matchedDivision.description}
                </p>

                <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {matchedDivision.responsibilities.slice(0, 4).map((r) => (
                    <div
                      key={r}
                      className="flex items-center gap-2.5 rounded-lg bg-zinc-800/40 px-3.5 py-2.5 text-sm text-zinc-200"
                    >
                      <Check className={`h-4 w-4 shrink-0 ${accent.text}`} />
                      {r}
                    </div>
                  ))}
                </div>

                {readinessScore !== null && (
                  <p className="mt-6 text-sm text-zinc-400">{readinessNotes[readinessScore]}</p>
                )}

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <a
                    href="#join"
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-300"
                  >
                    Jump to Application
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <button
                    onClick={restart}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 transition-colors hover:border-amber-500/40 hover:text-white"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retake Quiz
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
