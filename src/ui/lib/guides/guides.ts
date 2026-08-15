import type { Route } from "../../app/route.js";

/**
 * Authored product walkthroughs.
 *
 * The steps to make a crew are known, so they are written down here rather
 * than asked of a model: a model asked "how do I make a crew" invents buttons
 * that do not exist and sends the user hunting for them. Every target in this
 * file is a source literal the compiler checks - `route` against the real
 * Route union, `anchor` against a `data-tour` attribute that the guides test
 * greps for in src/ui. A model-authored navigation target is a different
 * problem and belongs in src/core/assist/answer-actions.ts, which validates
 * untrusted input at runtime; running authored steps through that gate would
 * be theatre.
 *
 * That other problem now has a surface: `generated.ts` beside this file builds
 * a walkthrough per question for everything the catalog does not cover, and
 * runs every target through the runtime gate. The two produce the same
 * {@link Guide} shape and the same overlay walks both.
 *
 * A guide navigates and points. It never writes config and never starts a run.
 *
 * This file holds zero React and zero browser-only imports at module scope so
 * it stays unit-testable under the node-only Vitest environment, the same
 * reason app/route.ts does.
 */

export type GuideStep = {
  id: string;
  title: string;
  /** One declarative line: what this thing is. */
  body: string;
  /** One line: what to do on this screen. Omitted when the step is orientation only. */
  todo?: string;
  /**
   * Where the step lives. The walkthrough overlay moves the user itself once
   * the step is showing; consult's "Take me there" is the button that opens the
   * walkthrough AT this step, so the move and the ring happen in one place. The
   * comparison is by route KIND, so someone already inside an editor is not
   * thrown back to a blank one.
   */
  route?: Route;
  /**
   * `data-tour` value to ring. Absent means the step navigates and explains
   * without pointing, which is honest for a screen that has no anchor yet;
   * a step must never name an anchor that does not exist, because a missing
   * anchor is a dead step.
   */
  anchor?: string;
};

export type Guide = {
  id: string;
  title: string;
  /** One line for the launcher. */
  summary: string;
  /**
   * The phrases that mean "show me this". Required, so a walkthrough added to
   * the catalog cannot silently be unmatchable, and literal, so what a typed
   * question offers is readable here rather than derived.
   *
   * Every phrase is VERB-LED, which is the rule that keeps a complaint from
   * being answered with a tutorial: "the new crew keeps failing" is about a
   * crew that exists, and only "make a crew" asks for one. A phrase that reads
   * as a noun ("first run", "new crew") matches both and belongs nowhere.
   */
  asks: readonly string[];
  steps: readonly GuideStep[];
  /**
   * Set only by `generated.ts`, on a walkthrough a model wrote for one question.
   * The overlay says so on the card: an itinerary built a moment ago carries
   * different weight from one that was written down and tested.
   */
  generated?: boolean;
};

/**
 * Detail carried by the launch event. Absent id opens the dashboard tour;
 * `stepId` starts it at one named step, which is what consult's "Take me there"
 * sends so the walkthrough opens on the step you asked about rather than at the
 * beginning of a tour you did not ask for.
 *
 * `guide` carries a walkthrough that is not in the catalog to look up, which is
 * the generated case. It is the whole reason the event takes an object.
 */
export type GuideLaunchDetail = { guideId?: string; stepId?: string; guide?: Guide };

export const GUIDE_LAUNCH_EVENT = "vibestrate:tour";
export const DEFAULT_GUIDE_ID = "dashboard-tour";

/**
 * The first-visit tour. Every anchor here is app chrome that is mounted on
 * every route, which is why none of these steps carry a route.
 */
const DASHBOARD_TOUR: Guide = {
  id: DEFAULT_GUIDE_ID,
  title: "Tour the dashboard",
  summary: "The six surfaces the rest of the app hangs off.",
  asks: ["tour the dashboard", "take the tour", "show me around", "give me a tour"],
  steps: [
    {
      id: "runs",
      title: "Runs",
      body: "Every run you start shows up here: queued, working, or waiting on you.",
      anchor: "nav-runs",
    },
    {
      id: "flows",
      title: "Flows",
      body: "A flow is the playbook a run follows. Use a builtin, or add your own.",
      anchor: "nav-flows",
    },
    {
      id: "board",
      title: "Board",
      body: "Every active run side by side, with its phase and agent.",
      anchor: "nav-board",
    },
    {
      id: "policies",
      title: "Policies",
      body: "Rules every run is checked against. Advise rules guide the reviewer; a block rule caps the merge even when the reviewer approved.",
      anchor: "nav-policies",
    },
    {
      id: "consult",
      title: "Consult",
      body: "The orb answers from your project's own context. It never changes your code.",
      anchor: "consult-orb",
    },
    {
      id: "new-run",
      title: "New run",
      body: "Describe what you want, and it takes it from there. Press ? any time for help.",
      anchor: "nav-new-run",
    },
  ],
};

const MAKE_A_CREW: Guide = {
  id: "make-a-crew",
  title: "Make a crew",
  summary: "Roles, the seats that fill them, and the profiles behind the seats.",
  asks: [
    "make a crew",
    "make a new crew",
    "create a crew",
    "add a crew",
    "set up a crew",
    "build a crew",
    "add a role",
    "add a seat",
  ],
  steps: [
    {
      id: "catalog",
      title: "Crew",
      body: "A crew is the set of roles a run can hand work to.",
      todo: "See what you already have before adding another.",
      route: { kind: "crew", crewId: null },
      anchor: "nav-crew",
    },
    {
      id: "providers",
      title: "Providers",
      body: "A seat can only use a CLI that is installed on this machine.",
      todo: "Check the provider you want reports as installed.",
      route: { kind: "providers" },
    },
    {
      id: "profiles",
      title: "Profiles",
      body: "A profile pairs a provider with a model and an effort level.",
      todo: "Decide which profile each role should run on.",
      route: { kind: "profiles" },
    },
    {
      id: "new",
      title: "New crew",
      body: "A new crew starts empty, with a name and a description.",
      todo: "Name it after the work it does, not the models in it.",
      route: { kind: "crew-editor", crewId: null },
      anchor: "crew-editor-identity",
    },
    {
      id: "seats",
      title: "Seats",
      body: "A seat binds one role to one profile, and the profile is what picks the model.",
      todo: "Give every role a seat.",
      route: { kind: "crew-editor", crewId: null },
      anchor: "crew-editor-seats",
    },
    {
      id: "save",
      title: "Save the crew",
      body: "A saved crew is selectable under Crew on the new-run form.",
      todo: "Save it, then start a run and pick it.",
      route: { kind: "crew-editor", crewId: null },
      anchor: "crew-editor-save",
    },
  ],
};

const MAKE_A_FLOW: Guide = {
  id: "make-a-flow",
  title: "Make a flow",
  summary: "The playbook a run follows, step by step.",
  asks: [
    "make a flow",
    "make a new flow",
    "create a flow",
    "add a flow",
    "set up a flow",
    "write a flow",
    "edit a flow",
  ],
  steps: [
    {
      id: "catalog",
      title: "Flows",
      body: "A flow is the playbook a run follows, step by step.",
      todo: "Open a builtin and read its steps before writing your own.",
      route: { kind: "flows" },
      anchor: "nav-flows",
    },
    {
      id: "new",
      title: "New flow",
      body: "A new flow needs an id, a label, and at least one step.",
      todo: "Use an id you will recognise in the run list.",
      route: { kind: "flow-editor", flowId: null },
      anchor: "flow-editor-identity",
    },
    {
      id: "steps",
      title: "Steps",
      body: "Each step names a kind of work and the role that does it.",
      todo: "Order them the way you would do the work by hand.",
      route: { kind: "flow-editor", flowId: null },
      anchor: "flow-editor-steps",
    },
    {
      id: "save",
      title: "Save the flow",
      body: "A saved flow is selectable under Flow on the new-run form.",
      todo: "Save it, then start a run and pick it.",
      route: { kind: "flow-editor", flowId: null },
      anchor: "flow-editor-save",
    },
  ],
};

const FIRST_RUN: Guide = {
  id: "first-run",
  title: "Run something for the first time",
  summary: "One task, one flow, one crew, and where it lands.",
  // "first run" and "a run" are missing on purpose: both appear in "why did the
  // first run block" and "how do i cancel a run", which are questions about a
  // run that already exists and belong on the project side.
  asks: [
    "start a run",
    "start my first run",
    "run something",
    "kick off a run",
    "start a task",
    "run my first",
  ],
  steps: [
    {
      id: "compose",
      title: "New run",
      body: "A run is one task, handed to a flow and a crew.",
      todo: "Open the new-run form.",
      route: { kind: "compose" },
      anchor: "nav-new-run",
    },
    {
      id: "task",
      title: "Task",
      body: "The task text is the whole brief, and the plan is derived from it.",
      todo: "Describe the change the way you would to a colleague.",
      route: { kind: "compose" },
      anchor: "compose-task",
    },
    {
      id: "flow-and-crew",
      title: "Flow and crew",
      body: "The flow decides the steps; the crew decides who runs them.",
      todo: "Leave both on auto for a first run.",
      route: { kind: "compose" },
      anchor: "compose-flow",
    },
    {
      id: "watch",
      title: "Runs",
      body: "A started run shows its phase and the agent working on it.",
      todo: "Open it to read the plan as it lands.",
      route: { kind: "runs", status: "active" },
      anchor: "nav-runs",
    },
    {
      id: "gates",
      title: "Waiting on you",
      body: "A run that hits a gate stops and waits rather than guessing.",
      todo: "Answer it from Mission control when it appears.",
      route: { kind: "mission" },
      anchor: "mission-approvals",
    },
  ],
};

const SET_A_POLICY: Guide = {
  id: "set-a-policy",
  title: "Set a policy",
  summary: "A rule you teach the project once, checked on every run.",
  asks: [
    "set a policy",
    "add a policy",
    "make a policy",
    "create a policy",
    "write a policy",
    "add a rule",
    "teach it a rule",
  ],
  steps: [
    {
      id: "catalog",
      title: "Policies",
      body: "A policy is a rule you teach the project, and every run is checked against it.",
      todo: "Read the rules already set before adding one.",
      route: { kind: "policies" },
      anchor: "nav-policies",
    },
    {
      // The tier control and the New-policy button can never be ringed as two
      // separate steps: ProjectPoliciesSection renders the tier Select only
      // while `adding` is true, and hides the New-policy button in that same
      // state. Tier and rule are one form, so they are one step.
      id: "write",
      title: "Write the rule",
      body: "An advise rule steers the reviewer; a block rule caps the merge even when the reviewer approved.",
      todo: "Pick the tier, then write one rule rather than a checklist.",
      route: { kind: "policies" },
      anchor: "policies-new",
    },
    {
      id: "effect",
      title: "When it applies",
      body: "A run reads the policy set as it starts, so one already going never sees a new rule.",
      todo: "Start a fresh run to see it enforced.",
      route: { kind: "runs" },
      anchor: "nav-runs",
    },
  ],
};

export const GUIDES: readonly Guide[] = [
  DASHBOARD_TOUR,
  MAKE_A_CREW,
  MAKE_A_FLOW,
  FIRST_RUN,
  SET_A_POLICY,
];

export function findGuide(id: string): Guide | null {
  return GUIDES.find((g) => g.id === id) ?? null;
}

/** Lowercase, and reduce every run of non-alphanumerics to one space, so
 *  "How do I make a *new crew*?" and "how do i make a crew" normalize alike.
 *  The padding spaces make containment a whole-phrase test. */
function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/**
 * The walkthrough a typed question is really asking for, or null.
 *
 * Literal phrase containment against each guide's authored {@link Guide.asks},
 * first guide in catalog order winning a tie. Deterministic by construction,
 * because the whole point of the product-help side is that nothing here is
 * improvised.
 *
 * It only ever OFFERS. A question that matches can still be asked as it stands
 * - so the cost of a miss is a button that does not appear, and the cost of a
 * false positive is a button that is wrong, which is why the phrases are
 * verb-led rather than derived from a title. Deriving them turned "how do i
 * cancel a run" into an offer to walk the user through starting their first
 * one.
 */
export function matchGuide(text: string): Guide | null {
  const haystack = normalize(text);
  for (const guide of GUIDES) {
    if (guide.asks.some((ask) => haystack.includes(normalize(ask)))) return guide;
  }
  return null;
}

/**
 * Phrases that mean "take me there", as opposed to "tell me".
 *
 * The catalog's own {@link Guide.asks} name the five things it can walk; this
 * list is the shape of the question rather than its subject, which is what a
 * surface needs to decide whether to offer a walkthrough for a question NOBODY
 * authored a guide for. A phrase here says the user wants to be stood in front
 * of the thing, and that is all it says - what the walkthrough turns out to be
 * is decided later, by a validator, against the real screens.
 *
 * Deliberately narrow at the "what" end: "what is a crew" is a concept being
 * explained and a screen that explains it better, while "what is the status of
 * this run" is a question about state and gets prose. Deliberately quiet on
 * complaints - "the run failed, what do i do" is not in here, for the same
 * reason {@link matchGuide} refuses it.
 *
 * Apostrophes are written as they are typed. {@link normalize} flattens
 * punctuation on both sides, so "what's a" and the phrase below meet in the
 * middle; the second spelling covers people who leave it out.
 */
const WALKTHROUGH_ASKS: readonly string[] = [
  // The procedure itself.
  "how do i",
  "how do you",
  "how can i",
  "how would i",
  "how to",
  // Asked for outright.
  "show me how",
  "walk me through",
  "walk through",
  "guide me",
  "teach me",
  "step by step",
  "steps to",
  "what are the steps",
  // The place it happens.
  "where do i",
  "where can i",
  // The concept, when the concept has a screen.
  "what is a",
  "what is an",
  "what's a",
  "what's an",
  "whats a",
  "whats an",
];

/**
 * Whether an answer to this question should carry a "Show me how".
 *
 * An OFFER, exactly like {@link matchGuide}: the answer is already on screen
 * and stands on its own, so a miss costs a button that does not appear and a
 * false positive costs a button that builds a walkthrough for a question that
 * did not need one - which either lands on real screens or is refused with its
 * reason. Neither outcome touches the project.
 *
 * A question the catalog already matches always qualifies: an authored
 * walkthrough exists for it, and the surface should dispatch that rather than
 * ask a model to reinvent it.
 */
export function wantsWalkthrough(text: string): boolean {
  if (typeof text !== "string" || text.trim().length === 0) return false;
  if (matchGuide(text)) return true;
  const haystack = normalize(text);
  return WALKTHROUGH_ASKS.some((ask) => haystack.includes(normalize(ask)));
}
