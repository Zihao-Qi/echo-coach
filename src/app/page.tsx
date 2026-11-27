import Link from "next/link";
import { starterQuestions } from "../content/questions/starter-bank";
import { PracticeHeader } from "../features/PracticeHeader";
import {
  PUBLIC_DEMO_BUILD,
  SAMPLE_FEEDBACK_NOTICE,
} from "../infrastructure/config/public-demo";

const tracks = [
  [
    "behavioral",
    "Behavioral",
    "Turn coursework, projects, and setbacks into honest stories about how you work.",
  ],
  [
    "swe",
    "Software engineering",
    "Explain the fundamentals, investigate problems, and make your trade-offs clear.",
  ],
  [
    "ai-ml",
    "AI / ML",
    "Connect model choices and evaluation methods to the problem you are solving.",
  ],
];
export default function HomePage() {
  return (
    <div className="refresh">
      <div className="shell">
        <PracticeHeader page="home" />
        <main>
          <section className="panel my-6 grid items-center gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h1 className="font-display text-4xl font-bold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
                Good answers are built.
                <br />
                Not memorized.
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-8 text-body">
                {PUBLIC_DEMO_BUILD
                  ? "Try a typed interview question, see sample feedback, and revise your answer."
                  : "Practice explaining what you know, get specific feedback, and try again."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="primary w-full sm:w-auto" href="/practice">
                  Start focused practice
                </Link>
                <Link className="action w-full sm:w-auto" href="/mock-interview">
                  Try a three-question mock interview
                </Link>
              </div>
              <p className="mt-3 text-xs text-muted">
                {PUBLIC_DEMO_BUILD
                  ? "No sign-in. Temporary history. Sample feedback only."
                  : "New-graduate SWE and AI/ML practice."}
              </p>
            </div>
            <aside className="rounded-3xl bg-night p-6 text-canvas sm:p-8">
              <h2 className="font-display text-2xl font-bold">
                How a round works
              </h2>
              <div className="my-5 rounded-xl bg-night-inset p-4">
                <p className="eyeline text-bright">Sample prompt</p>
                <p className="mt-2 text-sm leading-6">
                  {starterQuestions[0].prompt}
                </p>
              </div>
              <ol className="space-y-3">
                {[
                  "Answer in your own words",
                  PUBLIC_DEMO_BUILD
                    ? "Check against the rubric"
                    : "Get specific feedback",
                  "Retry and compare",
                ].map((step, i) => (
                  <li key={step} className="flex gap-3 text-sm font-semibold">
                    <span className="text-bright">0{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </aside>
          </section>
          <section className="pb-12">
            <h2 className="mb-4 font-display text-2xl font-bold">
              Choose a track
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {tracks.map(([id, name, description]) => (
                <article key={id} className="panel flex flex-col items-start">
                  <h3 className="font-display text-xl font-bold">{name}</h3>
                  <p className="my-3 grow text-sm leading-6 text-body">
                    {description}
                  </p>
                  <Link
                    href={`/practice?track=${id}`}
                    className="action w-full justify-between text-left"
                  >
                    <span>Practice {name}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </article>
              ))}
            </div>
          </section>
        </main>
        <footer className="border-t border-line py-5 text-xs leading-6 text-muted">
          Echo Coach · Interview practice for new-grad SWE and AI/ML candidates.
          {PUBLIC_DEMO_BUILD && <p>{SAMPLE_FEEDBACK_NOTICE}</p>}
        </footer>
      </div>
    </div>
  );
}
