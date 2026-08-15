import {
  ANSWER_ACTION_IDS_NONE,
  ANSWER_ROUTE_KINDS,
  parseNavigateRoute,
  type AnswerRouteKind,
} from "../../../core/assist/answer-actions.js";
import type { Route } from "../../app/route.js";
import type { Guide, GuideStep } from "./guides.js";

/**
 * Walkthroughs a model wrote, for the questions nobody authored a guide for.
 *
 * The catalog next door is compiler-checked: every route and anchor in guides.ts
 * is a source literal, which is why five hand-written walkthroughs can be
 * trusted to point at something. This file is the other half of that sentence -
 * a sequence built per question, where every target is UNTRUSTED INPUT and is
 * therefore checked at runtime instead. Both kinds run through the same overlay;
 * there is one walkthrough engine, and this only changes where the steps came
 * from.
 *
 * Three rules make that safe rather than theatre:
 *
 *   * A step is a DESTINATION, nothing else. Its route goes through the gate a
 *     model-authored button already goes through (core/assist/answer-actions),
 *     so a generated step has exactly the privilege a `navigate` action has: it
 *     lands you on a page and stops. It cannot press, fill, save, or start a
 *     run. "Would you like me to help you fill this?" is a line of text on a
 *     card - the filling stays the user's, or a control on the page they were
 *     taken to.
 *   * The anchor is matched against {@link ANCHOR_PAGES}, which is every
 *     ringable control the app has. A model does not get to name a new one: an
 *     anchor that is not here would ring nothing, so its step is dropped.
 *   * Ids are never accepted ({@link ANSWER_ACTION_IDS_NONE}). A generated
 *     walkthrough goes to pages and to blank editors, never to "the flow you
 *     mentioned" - that id-space has no allowlist on this path, and a wrong
 *     deep link is worse than a right page.
 *
 * The anchor table lives here rather than in core because a `data-tour`
 * attribute is dashboard truth: the rot check greps src/ui for them, and this
 * list is asserted against that grep.
 */

/**
 * Every ringable control, and the page it lives on. `null` means app chrome -
 * the sidebar and the consult orb are mounted on every route, so a step may ring
 * them from wherever the user already is.
 *
 * The route is a source literal checked against the real `Route` union, so an
 * anchor's page cannot drift into a page that does not exist. It is also what a
 * step gets when the model names a control but no page: the control's own screen
 * is not a guess.
 */
const ANCHOR_PAGES = {
  "nav-runs": null,
  "nav-flows": null,
  "nav-board": null,
  "nav-crew": null,
  "nav-policies": null,
  "nav-new-run": null,
  "consult-orb": null,
  "compose-task": { kind: "compose" },
  "compose-flow": { kind: "compose" },
  "crew-editor-identity": { kind: "crew-editor", crewId: null },
  "crew-editor-seats": { kind: "crew-editor", crewId: null },
  "crew-editor-save": { kind: "crew-editor", crewId: null },
  "flow-editor-identity": { kind: "flow-editor", flowId: null },
  "flow-editor-steps": { kind: "flow-editor", flowId: null },
  "flow-editor-save": { kind: "flow-editor", flowId: null },
  "policies-new": { kind: "policies" },
  "mission-approvals": { kind: "mission" },
} as const satisfies Record<string, Route | null>;

export type WalkthroughAnchor = keyof typeof ANCHOR_PAGES;

/** The closed vocabulary, in prompt order: chrome first, then per-screen. */
export const WALKTHROUGH_ANCHORS = Object.keys(ANCHOR_PAGES) as WalkthroughAnchor[];

/**
 * Route kinds a generated step may name.
 *
 * The id-bearing kinds are left out of the OFFER rather than only refused at the
 * gate: they need an id the server vouched for, this path passes none, so
 * naming them in the prompt would advertise a destination that is guaranteed to
 * be dropped. `source` is out for the same reason - its required `tab` makes a
 * bare `{ kind: "source" }` a dead step.
 */
const ID_BEARING_KINDS = new Set<AnswerRouteKind>([
  "task",
  "run",
  "control",
  "proposal",
  "source",
]);

export const WALKTHROUGH_ROUTE_KINDS: readonly AnswerRouteKind[] = ANSWER_ROUTE_KINDS.filter(
  (kind) => !ID_BEARING_KINDS.has(kind),
);

/** Beyond this an itinerary has stopped being a walkthrough. */
export const GENERATED_WALKTHROUGH_STEPS_MAX = 8;

/** How many raw steps are even looked at, so a thousand-entry array costs a
 *  bounded amount of work rather than the tab. */
const STEP_CANDIDATES_MAX = 24;

const TITLE_MAX = 60;
const SUMMARY_MAX = 140;
const BODY_MAX = 240;
const TODO_MAX = 180;

/** Control characters and angle brackets, refused so a generated line can never
 *  read as markup wherever it ends up rendered or logged. */
const FORBIDDEN = /[\u0000-\u001F\u007F-\u009F<>]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One line of card copy, or null.
 *
 * Whitespace collapses because a card renders one line whatever the model
 * emitted, and em/en dashes become "-" because house copy has no em-dashes and
 * a generated line is still our copy.
 */
function line(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (text.length === 0 || text.length > max) return null;
  if (FORBIDDEN.test(text)) return null;
  return text;
}

/**
 * One model-authored step, or null.
 *
 * Null is the whole error vocabulary on purpose: there is nothing a caller could
 * usefully do differently for "invented anchor" versus "invented page", and a
 * dropped step is the same outcome either way.
 */
function parseStep(raw: unknown, index: number): GuideStep | null {
  if (!isRecord(raw)) return null;

  const title = line(raw["title"], TITLE_MAX);
  const body = line(raw["body"], BODY_MAX);
  if (title === null || body === null) return null;
  // A bad `todo` costs the line, not the step: it is prose about what the user
  // does next, and a step that still navigates and explains is worth keeping.
  const todo = line(raw["todo"], TODO_MAX);

  const rawAnchor = raw["anchor"];
  let anchor: WalkthroughAnchor | null = null;
  if (rawAnchor !== undefined && rawAnchor !== null && rawAnchor !== "") {
    if (typeof rawAnchor !== "string") return null;
    // `Object.hasOwn`, not `in`: `"toString" in ANCHOR_PAGES` is true, and an
    // inherited key would index to undefined and ring nothing.
    if (!Object.hasOwn(ANCHOR_PAGES, rawAnchor)) return null;
    anchor = rawAnchor as WalkthroughAnchor;
  }

  const rawRoute = raw["route"];
  const named = rawRoute !== undefined && rawRoute !== null;
  const route = named ? parseNavigateRoute(rawRoute, ANSWER_ACTION_IDS_NONE) : null;
  // Naming a page that does not survive the gate is not a step to salvage: the
  // body was written about a screen this app does not have.
  if (named && route === null) return null;

  const anchorPage: Route | null = anchor ? ANCHOR_PAGES[anchor] : null;
  // A ring that is not on the page the step opens can only ever point at
  // nothing, which is the one thing a walkthrough must never do.
  if (anchorPage && route && route.kind !== anchorPage.kind) return null;

  const destination: Route | null = route ?? anchorPage;
  if (destination === null && anchor === null) return null;

  return {
    // Ids are ours. The model has no reason to name one, and a duplicate would
    // break the overlay's step lookup.
    id: `step-${index + 1}`,
    title,
    body,
    ...(todo === null ? {} : { todo }),
    ...(destination === null ? {} : { route: destination }),
    ...(anchor === null ? {} : { anchor }),
  };
}

/**
 * A walkthrough that passed the gate.
 *
 * The brand is not decoration: {@link launchGeneratedWalkthrough} takes this
 * type and nothing else, so the only way to open a generated walkthrough is to
 * have run one through {@link validateWalkthrough} first. A future caller cannot
 * hand-roll a `Guide` and dispatch it by accident.
 */
declare const validated: unique symbol;
export type GeneratedWalkthrough = Guide & {
  generated: true;
  readonly [validated]: true;
};

/** Why nothing is being shown. A code, not a sentence: the copy is chosen once,
 *  in {@link describeWalkthroughRefusal}. */
export type WalkthroughRefusal = "no-json" | "not-an-object" | "no-steps" | "no-valid-steps";

export type GeneratedWalkthroughResult =
  | { ok: true; walkthrough: GeneratedWalkthrough; dropped: number }
  | { ok: false; reason: WalkthroughRefusal; dropped: number };

/**
 * THE ENTRY POINT for a model-authored walkthrough object.
 *
 * Never throws for a JSON value, which is what both callers pass: a hostile
 * payload is a refusal with a reason, not a broken surface. Each step is
 * validated inside its own boundary, so one bad entry costs that step and not
 * the itinerary. (An object with a throwing getter is not a JSON value and is
 * not defended against here - JSON.parse cannot produce one, and the surfaces
 * that call this already show a thrown error as a refusal.)
 */
export function validateWalkthrough(raw: unknown): GeneratedWalkthroughResult {
  if (!isRecord(raw)) return { ok: false, reason: "not-an-object", dropped: 0 };
  const rawSteps = raw["steps"];
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return { ok: false, reason: "no-steps", dropped: 0 };
  }

  const steps: GuideStep[] = [];
  let dropped = 0;
  for (const candidate of rawSteps.slice(0, STEP_CANDIDATES_MAX)) {
    if (steps.length >= GENERATED_WALKTHROUGH_STEPS_MAX) {
      dropped += 1;
      continue;
    }
    try {
      const step = parseStep(candidate, steps.length);
      if (step) steps.push(step);
      else dropped += 1;
    } catch {
      dropped += 1;
    }
  }
  // Everything past the candidate bound was refused too, and saying so keeps
  // the count honest rather than flattering.
  if (rawSteps.length > STEP_CANDIDATES_MAX) dropped += rawSteps.length - STEP_CANDIDATES_MAX;

  if (steps.length === 0) return { ok: false, reason: "no-valid-steps", dropped };

  const walkthrough = {
    id: "generated-walkthrough",
    // A title is cosmetic, so an unusable one falls back rather than costing a
    // walkthrough whose steps all check out.
    title: line(raw["title"], TITLE_MAX) ?? "Show me how",
    summary: line(raw["summary"], SUMMARY_MAX) ?? "",
    // Never matchable: `matchGuide` reads the authored catalog, and a generated
    // walkthrough is not in it.
    asks: [],
    steps,
    generated: true,
    // The brand is a phantom - `validated` is `declare const`, so it exists in
    // the type system and never at runtime. This double cast is where it is
    // minted, and it is the ONLY place allowed to do it: every step above has
    // already been through parseStep, so a value reaching here is validated by
    // construction. Widening this cast, or repeating it elsewhere, throws away
    // the guarantee that launchGeneratedWalkthrough can only be handed checked
    // steps.
  } as unknown as GeneratedWalkthrough;
  return { ok: true, walkthrough, dropped };
}

/**
 * The first JSON object in a block of text, or null.
 *
 * Models fence their JSON, or introduce it, or both, and a strict `JSON.parse`
 * of the whole answer would refuse a perfectly good walkthrough for its
 * preamble. Brace matching is string-aware so a `{` inside a body sentence does
 * not end the scan early.
 */
export function extractWalkthroughObject(text: string): unknown {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Text in, walkthrough or refusal out. The one call a surface needs. */
export function parseGeneratedWalkthrough(answerText: string): GeneratedWalkthroughResult {
  const raw = extractWalkthroughObject(answerText);
  if (raw === null) return { ok: false, reason: "no-json", dropped: 0 };
  return validateWalkthrough(raw);
}

/** What to put on screen when there is no walkthrough. Stated plainly, because
 *  the alternative to saying this is a card pointing at nothing. */
export function describeWalkthroughRefusal(reason: WalkthroughRefusal): string {
  switch (reason) {
    case "no-json":
    case "not-an-object":
      return "The answer came back as prose, so there is no sequence to walk.";
    case "no-steps":
      return "The walkthrough came back empty.";
    case "no-valid-steps":
      return "Every step named a screen or a control this app does not have.";
  }
}

/** The consult question is capped server-side; a request that overruns is a 400
 *  rather than a walkthrough, so the excerpt is trimmed to fit here. */
const QUESTION_MAX = 3_900;
const ASK_MAX = 600;

/** Chrome anchors ring from anywhere; the rest name their screen, which is what
 *  stops a model pairing a control with the wrong page. */
function anchorVocabulary(): string {
  return WALKTHROUGH_ANCHORS.map((anchor) => {
    const page = ANCHOR_PAGES[anchor];
    return `  ${anchor} - ${page === null ? "any screen (sidebar and orb are always mounted)" : `only with route kind "${page.kind}"`}`;
  }).join("\n");
}

/**
 * The output contract, restated LAST.
 *
 * Load-bearing, and measured rather than assumed. This question rides on the
 * ordinary consult instruction, which tells the model to be short and lead with
 * the answer - and against a live provider that instruction beat an output
 * contract stated only at the top: 2 asks out of 2 came back as prose and were
 * refused `no-json`, so the whole generated half always failed. With the same
 * contract repeated here, after the question and the answer excerpt, 2 out of 2
 * returned a valid itinerary. Moving this back up the prompt puts the feature
 * back to always refusing.
 */
const OUTPUT_CONTRACT =
  "\n\nYour entire `answer` field is that JSON object and nothing else - no prose, no preamble, no explanation. An answer that does not start with { is discarded.";

/**
 * The question that asks for a walkthrough.
 *
 * It goes to the ordinary read-only consult endpoint, which is the point: the
 * walkthrough is authored by the same gated, redacted, project-grounded call
 * that answers questions, and gains no privilege by being asked for a sequence.
 * The closed vocabularies are stated here so a model has something real to pick
 * from; everything it picks is checked again on the way back regardless.
 */
export function buildWalkthroughRequest(input: { ask: string; answer?: string }): string {
  const ask = input.ask.replace(/\s+/g, " ").trim().slice(0, ASK_MAX);
  const head = [
    `Build a walkthrough of the Vibestrate dashboard for this request: ${ask || "show me how to do what the answer below describes"}`,
    "",
    "Reply with ONLY this JSON object as your entire `answer`, no prose around it:",
    `{"title":"short title","summary":"one line","steps":[{"title":"Flows","body":"What this screen is, in one line.","todo":"What the user does here.","route":{"kind":"flows"},"anchor":"nav-flows"}]}`,
    "",
    "Rules:",
    `- Between 2 and ${GENERATED_WALKTHROUGH_STEPS_MAX} steps, in the order the user does them. One screen per step.`,
    `- "route.kind" is one of: ${WALKTHROUGH_ROUTE_KINDS.join(", ")}. Anything else is discarded with its step.`,
    '- A route names a PAGE only, never a specific task, run, flow or crew. {"kind":"flow-editor"} is the blank new-flow form, {"kind":"crew-editor"} the blank new-crew form.',
    '- "anchor" is optional and rings one control on that step\'s screen. It is one of:',
    anchorVocabulary(),
    "- An anchor paired with a route it does not live on is discarded, and so is an invented one. Never name an anchor or a route kind that is not listed above.",
    "- A step lands the user on a screen and says what is there. It cannot press, type, save or start anything, so write `todo` as what THEY do next. Offering to help fill a form is a sentence, not a step.",
    "- `body` is one declarative line about the screen. `todo` is one line about the next move.",
  ].join("\n");

  // The contract is reserved out of the budget rather than trimmed to fit it:
  // an excerpt long enough to push it off the end would silently restore the
  // prose-only behaviour it exists to prevent.
  const budget = QUESTION_MAX - OUTPUT_CONTRACT.length;
  const answer = (input.answer ?? "").trim();
  if (!answer) return `${head.slice(0, budget)}${OUTPUT_CONTRACT}`;
  const tail = "\n\nThe answer this walkthrough should carry out:\n";
  const room = budget - head.length - tail.length;
  if (room <= 0) return `${head.slice(0, budget)}${OUTPUT_CONTRACT}`;
  return `${head}${tail}${answer.slice(0, room)}${OUTPUT_CONTRACT}`;
}
