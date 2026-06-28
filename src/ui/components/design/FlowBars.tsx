// The flow step bar-meter - the signature "more colors" visual on every flow
// card. The bar chart reads a flow's shape (count, rhythm) AND its makeup
// (which steps are review / validation / approval gates) at a glance. Shared by
// Mission Control's composer and the Flows catalog so the flow card is one
// component everywhere, not two that drift.

// Per-step-kind colors. Ordinary work steps are neutral grey so flow cards
// don't read as walls of violet; only the meaningful step kinds (review /
// validation / approval) carry colour. Mid-grey reads on both themes.
export const STEP_TONE: Record<string, string> = {
  "review-turn": "#a78bfa", // violet - the review loop
  validation: "#7cc5ff", // sky - checks / gates that run commands
  "approval-gate": "#fb923c", // amber - a human-in-the-loop pause
};
export const STEP_TONE_DEFAULT = "#9a9aa2";

export function FlowBars({
  steps,
  on = true,
  height = "h-6",
}: {
  steps: Array<{ kind?: string }>;
  /** Dim the bars when the card isn't selected (composer picker). */
  on?: boolean;
  /** Tailwind height class for the meter (default h-6). */
  height?: string;
}) {
  const shown = steps.slice(0, 10);
  const bars: Array<{ kind?: string }> = shown.length > 0 ? shown : [{}];
  return (
    <div className={`my-2.5 flex ${height} items-end gap-[3px]`} aria-hidden>
      {bars.map((s, i) => (
        <span
          key={i}
          className="flex-1 rounded-[2px]"
          style={{
            background: STEP_TONE[s.kind ?? ""] ?? STEP_TONE_DEFAULT,
            opacity: on ? 1 : 0.42,
            height: `${9 + ((i * 5) % 11)}px`,
          }}
        />
      ))}
    </div>
  );
}
