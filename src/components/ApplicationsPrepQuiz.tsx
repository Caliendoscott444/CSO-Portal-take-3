import { useState } from 'react';
import { Check, X, ArrowRight, RotateCcw } from 'lucide-react';
import { ORG_NAME, ORG_ABBR } from '../data';

type PrepQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
};

const questions: PrepQuestion[] = [
  {
    prompt: 'What does PMC stand for?',
    options: [
      'Private Military Company',
      'Public Military Command',
      'Police Marksman Corps',
      'Personnel Management Center',
    ],
    correctIndex: 0,
  },
  {
    prompt: 'Is a PMC considered law enforcement?',
    options: [
      'Yes, PMCs have full law enforcement authority',
      'No â€” PMCs are private contractors, not law enforcement, even if they work alongside LEO',
      'Only during active mass events',
      'Only if deputized by command',
    ],
    correctIndex: 1,
  },
  {
    prompt: 'What does ROE stand for?',
    options: [
      'Range of Engagement',
      'Report of Events',
      'Rules of Engagement',
      'Record of Entry',
    ],
    correctIndex: 2,
  },
  {
    prompt: 'Which best describes Rules of Engagement (ROE)?',
    options: [
      'A suggestion that operators can ignore if convenient',
      'The directives that define when and how force may be used during an operation',
      'A list of divisions within CSO',
      'The Discord server rules',
    ],
    correctIndex: 1,
  },
  {
    prompt: 'Which amendment protects freedom of speech, religion, press, and assembly?',
    options: ['1st Amendment', '2nd Amendment', '4th Amendment', '5th Amendment'],
    correctIndex: 0,
  },
  {
    prompt: 'Which amendment protects the right to bear arms?',
    options: ['1st Amendment', '2nd Amendment', '6th Amendment', '8th Amendment'],
    correctIndex: 1,
  },
  {
    prompt: 'Which amendment protects against unreasonable search and seizure?',
    options: ['3rd Amendment', '4th Amendment', '5th Amendment', '7th Amendment'],
    correctIndex: 1,
  },
  {
    prompt: 'Which amendment protects the right to remain silent (against self-incrimination)?',
    options: ['4th Amendment', '5th Amendment', '6th Amendment', '9th Amendment'],
    correctIndex: 1,
  },
  {
    prompt: 'Which amendment guarantees the right to a speedy and public trial?',
    options: ['5th Amendment', '6th Amendment', '7th Amendment', '10th Amendment'],
    correctIndex: 1,
  },
  {
    prompt: `What does ${ORG_ABBR} stand for?`,
    options: [
      ORG_NAME,
      'Combined Strategic Operations',
      'Central Security Organization',
      'Coastal Support & Operations',
    ],
    correctIndex: 0,
  },
];

export default function ApplicationsPrepQuiz() {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const question = questions[step];
  const isCorrect = selected !== null && selected === question.correctIndex;
  const answered = selected !== null;

  function choose(idx: number) {
    if (answered) return;
    setSelected(idx);
    if (idx === question.correctIndex) {
      setScore((s) => s + 1);
    }
  }

  function next() {
    if (step + 1 < questions.length) {
      setStep((s) => s + 1);
      setSelected(null);
    } else {
      setFinished(true);
    }
  }

  function restart() {
    setStep(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
  }

  const resultNote =
    score === questions.length
      ? 'Perfect score. You clearly know your stuff.'
      : score >= Math.ceil(questions.length * 0.7)
        ? 'Solid â€” you know the fundamentals well.'
        : score >= Math.ceil(questions.length * 0.4)
          ? "Not bad â€” worth brushing up before you apply."
          : 'Take some time to review the fundamentals before applying.';

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
            Test Your Knowledge
          </span>
        </div>
        <h2
          className="mt-2 text-4xl tracking-wide text-white sm:text-5xl"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          Prep Quiz
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Amendments, ROE, and PMC fundamentals â€” a quick check before you apply.
        </p>

        <div className="relative mt-10 overflow-hidden rounded-2xl border border-amber-500/25 bg-zinc-900/40">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-600/15 blur-3xl" />

          <div className="relative flex items-center gap-2 border-b border-amber-500/20 px-6 py-4 sm:px-10">
            {questions.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < step || finished ? 'bg-amber-400' : i === step ? 'bg-amber-500/40' : 'bg-zinc-700/60'
                }`}
              />
            ))}
          </div>

          <div className="relative p-8 sm:p-12">
            {!finished && (
              <div>
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Question {step + 1} of {questions.length}
                </span>
                <h3 className="mt-3 text-xl font-bold text-white sm:text-2xl">{question.prompt}</h3>

                <div className="mt-6 grid gap-3">
                  {question.options.map((opt, idx) => {
                    const isSelected = selected === idx;
                    const isRightAnswer = idx === question.correctIndex;

                    let stateClasses =
                      'border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:border-amber-500/40 hover:bg-amber-500/5 hover:text-white';

                    if (answered) {
                      if (isRightAnswer) {
                        stateClasses = 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200';
                      } else if (isSelected) {
                        stateClasses = 'border-red-500/50 bg-red-500/10 text-red-200';
                      } else {
                        stateClasses = 'border-zinc-800/60 bg-zinc-950/20 text-zinc-500';
                      }
                    }

                    return (
                      <button
                        key={opt}
                        onClick={() => choose(idx)}
                        disabled={answered}
                        className={`flex items-center justify-between rounded-xl border px-5 py-4 text-left text-sm font-medium transition-all ${stateClasses} ${
                          answered ? 'cursor-default' : 'cursor-pointer'
                        }`}
                      >
                        {opt}
                        {answered && isRightAnswer && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
                        {answered && isSelected && !isRightAnswer && (
                          <X className="h-4 w-4 shrink-0 text-red-400" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {answered && (
                  <div className="mt-5">
                    {isCorrect ? (
                      <p className="text-sm font-semibold text-emerald-300">Correct!</p>
                    ) : (
                      <p className="text-sm font-semibold text-red-300">
                        Incorrect â€” the correct answer is:{' '}
                        <span className="text-emerald-300">{question.options[question.correctIndex]}</span>
                      </p>
                    )}
                    <button
                      onClick={next}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-300"
                    >
                      {step + 1 < questions.length ? 'Next Question' : 'See Results'}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {finished && (
              <div className="animate-fade-up">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Results
                </span>
                <h3
                  className="mt-2 text-4xl text-white sm:text-5xl"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  {score} / {questions.length}
                </h3>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-300 sm:text-base">
                  {resultNote}
                </p>

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

