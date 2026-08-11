

export function laneTone(status: string): string {
  const s = status.toLowerCase();
  if (/(passed|verified|approved|^ok$)/.test(s)) return "text-emerald-400";
  if (/(fail|blocked|changes|unsafe|reject)/.test(s)) return "text-rose-300";
  if (s.includes("environment")) return "text-amber-soft";
  return "text-chalk-400";
}

/** One gate cell in the assurance grid (label over a status-tinted value). */

export function LaneCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="rounded-[12px] bg-coal-500/50 px-3 py-2">
      <div className="text-[12px] font-semibold text-violet-soft">
        {label}
      </div>
      <div className={`mt-0.5 text-[12.5px] font-semibold ${tone}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[10.5px] leading-snug text-chalk-400">{sub}</div> : null}
    </div>
  );
}

/** Why the orchestrator chose this Flow (only for selected runs). */

/** Where the run's work lives. Answers "how do I get into that git
 *  worktree?" - shows the worktree path + branch and a copy-able `cd` line.
 *  Read-only; the worktree is bounded to the run and never edited from here. */
