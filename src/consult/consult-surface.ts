// ── Consult surface: where the answer will be read ──────────────────────────
//
// An answer read in a browser and an answer read in a terminal are not the same
// answer. Asked "how can I make a new flow?" from the dashboard, consult used to
// reply with `vibe config view`, `vibe config view --json`, `vibe config show`
// and "add a flow to .vibestrate/project.yml by hand" - four things the reader
// cannot do from where they asked, while the flow editor was one click away.
//
// The cause was that `runConsult` had no idea which surface it was answering on:
// the HTTP route and `vibe consult` looked identical to the answerer, and the
// handbook corpus is half CLI reference, so retrieval handed over commands and
// the model faithfully repeated them.
//
// So the surface is a REQUIRED field with no default - a caller that does not
// say is a type error, not a guess - and it is enforced where it cannot be
// ignored:
//
//   * RETRIEVAL drops the CLI reference pages and strips `vibe ...` examples out
//     of what is left (handbook-retrieval.ts). A prompt instruction is a request;
//     an entry that never reached the context cannot be repeated.
//   * The dashboard answer is handed the REAL screens, below, so it has
//     somewhere to point instead of a YAML file.
//
// The screen map is derived from the authored walkthroughs in
// ui/lib/guides/guides.ts rather than written again here, because a second
// hand-maintained list of screens is exactly how an answer starts naming a page
// that no longer exists. That file holds zero React and its only import is
// type-only, so importing it costs nothing at runtime and nothing at bundle
// time; the same reason core/assist/answer-actions.ts reaches for app/route.ts.

import { GUIDES } from "../ui/lib/guides/guides.js";
import { ANSWER_ROUTE_KINDS } from "../core/assist/answer-actions.js";

/** Where the answer will be read. No third value and no default: a surface the
 *  enforcement does not know about would silently get the unfiltered context. */
export type ConsultSurface = "dashboard" | "cli";

export const CONSULT_SURFACES = ["dashboard", "cli"] as const;

export function isConsultSurface(value: unknown): value is ConsultSurface {
  return value === "dashboard" || value === "cli";
}

const SCREENS_HEADER = [
  "## Dashboard screens (the surface this answer is read on)",
  "The reader is in the Vibestrate dashboard, in a browser, not at a terminal. Answer with the screens below: name the screen and what to do on it. A terminal command or a hand-edit of .vibestrate/project.yml is not an answer here - the reader cannot run one from where they are asking, and every screen below is a real page in this build.",
].join("\n");

function renderGuide(guide: {
  title: string;
  summary: string;
  steps: readonly { title: string; body: string; todo?: string; route?: { kind: string } }[];
}): string {
  const lines = [`### ${guide.title} - ${guide.summary}`];
  guide.steps.forEach((step, i) => {
    const screen = step.route ? ` [screen: ${step.route.kind}]` : "";
    const todo = step.todo ? ` ${step.todo}` : "";
    lines.push(`${i + 1}. ${step.title}${screen} - ${step.body}${todo}`);
  });
  return lines.join("\n");
}

/**
 * The dashboard's screen map, or null on any other surface.
 *
 * Null rather than a terminal-flavoured twin on the CLI side: the docs corpus is
 * already written command-first, so the terminal surface needs nothing added -
 * it needs nothing TAKEN AWAY, which is what handbook-retrieval does (or rather,
 * does not do) there.
 */
export function renderSurfaceScreens(surface: ConsultSurface): string | null {
  if (surface !== "dashboard") return null;
  const guides = GUIDES.map((g) => renderGuide(g)).join("\n\n");
  const rest = `Other pages this build has, by their route name: ${ANSWER_ROUTE_KINDS.join(", ")}.`;
  return [SCREENS_HEADER, "", guides, "", rest].join("\n");
}

/** The one instruction line that states the surface rule to the model. Retrieval
 *  has already enforced it; this is what stops the model reaching for a command
 *  it remembers from training rather than from the context. */
export function surfaceInstruction(surface: ConsultSurface): string {
  if (surface === "dashboard") {
    return "SURFACE: this answer is read in the Vibestrate dashboard, in a browser. Answer with screens and the controls on them, naming them from the `Dashboard screens` block. Do NOT recommend a terminal command, a `vibe ...` invocation, or hand-editing .vibestrate/project.yml - the reader cannot run one from where they asked. The only exception is a question that names a command outright, which you answer about the command. `recommendedActions` obeys the same rule.";
  }
  return "SURFACE: this answer is read in a terminal, from `vibe consult`. Answer with commands: quote the exact `vibe ...` invocation and its flags from the documentation block rather than paraphrasing them. Do not send the reader to a dashboard screen unless they asked about the dashboard.";
}
