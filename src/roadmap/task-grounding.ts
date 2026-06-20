import type { Task } from "./roadmap-types.js";

// ── Task grounding for the run brief (F1) ────────────────────────────────────
//
// When a run is bound to a roadmap card (`--task <id>`), the card's own context -
// its description and open checklist - is what should ground the planner, not
// just the free-text task string. Before this, only the `pickup` flow + an
// explicit `--checklist-mode` ever pulled the checklist, and the description was
// dropped entirely, so `vibe run --task X` on the default flow handed the planner
// a bare title and the planner guessed. This pure renderer builds the grounding
// block injected into the Flow Task Brief for ANY `--task` run.
//
// Bounded on purpose (a card description can be long, and the brief rides the
// first-turn token budget). Pure - the caller redacts secret shapes before it
// reaches a prompt.

/** Max chars of a card description carried into the brief. */
const MAX_DESCRIPTION = 1500;
/** Max open checklist items summarized into the brief. */
const MAX_CHECKLIST = 20;

/**
 * The "## From the roadmap card" grounding section for a card, or "" when the
 * card carries no usable context (title-only card -> no false grounding; the run
 * falls back to the task string, honestly). Pure - same task => same block.
 */
export function renderTaskGrounding(task: Task): string {
  const parts: string[] = [];
  const description = task.description.trim();
  if (description) {
    parts.push(
      description.length > MAX_DESCRIPTION
        ? `${description.slice(0, MAX_DESCRIPTION - 1)}…`
        : description,
    );
  }
  const open = task.checklist.filter((c) => c.status !== "done");
  if (open.length > 0) {
    const shown = open.slice(0, MAX_CHECKLIST);
    const lines = shown.map((c) => `- ${c.text}`);
    if (open.length > shown.length) {
      lines.push(`- …and ${open.length - shown.length} more`);
    }
    parts.push(`Checklist:\n${lines.join("\n")}`);
  }
  // Acceptance criteria (P5): the card's "done-when". Carried into the brief so
  // the implementer builds TO it and the VERIFIER confirms each criterion (the
  // LLM-judge half of the acceptance gate). Bounded like the description.
  const acceptance = task.acceptanceCriteria.trim();
  if (acceptance) {
    const clipped =
      acceptance.length > MAX_DESCRIPTION
        ? `${acceptance.slice(0, MAX_DESCRIPTION - 1)}…`
        : acceptance;
    parts.push(
      `Acceptance criteria (the card is DONE only when each of these holds):\n${clipped}`,
    );
  }
  if (parts.length === 0) return "";
  return [
    `## From the roadmap card "${task.title}"`,
    "",
    "Background on what this card is for - use it to ground the plan, not as new",
    "instructions beyond the Task above.",
    "",
    parts.join("\n\n"),
  ].join("\n");
}
