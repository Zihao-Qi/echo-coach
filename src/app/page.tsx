import Link from "next/link";

const tracks = [
  { id: "behavioral", number: "01", name: "Behavioral", description: "Turn coursework, projects, and setbacks into honest stories about how you work.", topics: "Ownership · Teamwork · Learning" },
  { id: "swe", number: "02", name: "Software engineering", description: "Explain the fundamentals, investigate problems, and make your trade-offs clear.", topics: "Data structures · Debugging · Design" },
  { id: "ai-ml", number: "03", name: "AI / ML", description: "Connect model choices and evaluation methods to the problem you are solving.", topics: "Evaluation · Metrics · Data quality" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f6f7fb] px-5 py-6 text-slate-900 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <Link href="/" className="text-xl font-extrabold tracking-tight">echo<span className="text-indigo-600">coach</span><span className="ml-3 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-indigo-700">Practice lab</span></Link>
          <nav aria-label="Main navigation" className="flex gap-5 text-sm font-semibold"><Link className="text-slate-500 hover:text-indigo-700" href="/legacy">Original voice demo</Link><Link className="text-indigo-700" href="/practice">Open practice →</Link></nav>
        </header>
        <main>
          <section className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">For your first engineering role</p>
              <h1 className="mt-5 max-w-xl text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">Good answers are built.<br /><span className="text-indigo-600">Not memorized.</span></h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">Practice explaining what you know, get specific feedback, and try again. Build the reasoning and stories behind a stronger interview.</p>
              <Link href="/practice" className="mt-8 inline-flex rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">Start a focused practice round →</Link>
              <p className="mt-4 text-xs text-slate-500">New-graduate SWE + AI/ML · Text practice now · Live interviews coming next</p>
            </div>
            <aside aria-label="Practice approach preview" className="rounded-3xl bg-slate-950 p-7 text-white shadow-xl sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">The learning loop</p>
              <ol className="mt-7 space-y-6">{[
                ["Answer in your own words", "Start with your reasoning—not a perfect script."],
                ["Find the missing piece", "Review correctness, evidence, and what to explain next."],
                ["Try again, see the difference", "Keep your earlier attempt and compare what changed."],
              ].map(([title, description], index) => <li key={title} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-400/10 text-sm font-bold text-indigo-300">{index + 1}</span><div><h2 className="font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{description}</p></div></li>)}</ol>
              <p className="mt-8 border-t border-white/10 pt-5 text-xs leading-6 text-slate-400">A coach, not a hiring predictor. No invented achievements or promises of interview success.</p>
            </aside>
          </section>
          <section aria-labelledby="tracks-title" className="pb-12">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Choose your focus</p><h2 id="tracks-title" className="mt-2 text-2xl font-bold tracking-tight">Small rounds. Specific skills.</h2></div><p className="text-sm text-slate-500">Start with a curated question, then go deeper.</p></div>
            <div className="grid gap-5 md:grid-cols-3">{tracks.map((track) => <Link href={`/practice?track=${track.id}`} key={track.id} className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-indigo-600"><p className="text-xs font-bold text-indigo-500">{track.number}</p><h3 className="mt-4 text-xl font-bold">{track.name}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{track.description}</p><p className="mt-5 text-xs font-medium text-slate-500">{track.topics}</p><span className="mt-6 inline-block text-sm font-bold text-indigo-700">Practice this track →</span></Link>)}</div>
          </section>
          <section className="mb-10 rounded-2xl border border-indigo-100 bg-indigo-50 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6"><div><h2 className="text-lg font-bold">Your experience is enough to start.</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">Coursework, research, internships, and personal projects all count. The goal is to explain your own contribution honestly—not invent a more impressive story.</p></div><Link href="/practice?track=behavioral" className="mt-4 inline-block shrink-0 text-sm font-bold text-indigo-700 sm:mt-0">Work on a project story →</Link></section>
        </main>
        <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 py-5 text-xs leading-6 text-slate-500"><p>Echo Coach · A supportive place to think out loud.</p><p>Preview: demo feedback is illustrative. Cloud mode requires configuration.</p></footer>
      </div>
    </div>
  );
}
