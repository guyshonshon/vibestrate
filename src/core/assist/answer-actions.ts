// ── Answer actions: the buttons a model may offer under an answer ───────────
//
// A supervisor or consult answer can end with a couple of buttons: one fills
// the composer with a follow-up, another opens a page ("New crew", "Pick a
// flow"). This module is the contract for those buttons, and the ONLY gate
// they pass through.
//
// THE INVARIANT THAT SHAPES THIS FILE: AN ACTION NEVER PERFORMS A WRITE AND
// NEVER STARTS A RUN. `navigate` lands the user on a page and stops there -
// the page's own broker-gated controls are what act. `prompt` fills the
// composer and sends nothing. There is deliberately no third kind, because a
// third kind is how a chat button turns into an unreviewed effect.
//
// THE OTHER RULE: a model-authored action is untrusted input, in exactly the
// sense the intake router means it - the text that produced it can come from a
// merged agent diff, a dependency README, or an annotation somebody posted
// over HTTP. So:
//
//   * `kind` and route `kind` are matched against hand-written literal sets
//     here. `serializeRoute` is NOT a validator: it will happily stringify any
//     string as a taskId, so using it as the gate would render a dead - or
//     worse, a wrong - button.
//   * every id is checked against a list the SERVER built. A model naming a
//     task it invented gets its action dropped, not fuzzy-matched.
//   * a route kind that takes no parameters must arrive carrying none. Extra
//     keys are a mismatch between what the model thinks it is doing and what
//     this table thinks, and a mismatch is dropped.
//   * labels and prompt text are text: bounded, single-purpose, no control
//     characters, and no angle brackets in a label so it can never be mistaken
//     for markup by any renderer downstream.
//   * an answer is not a menu. The cap is enforced here, not by whoever
//     renders it.
//
// Everything that does not pass is DROPPED, per item. One malformed action
// never costs the user the other three, and never costs them the answer.

import { z } from "zod";
// Type-only, and therefore erased at build time: no runtime dependency from
// core on the dashboard. The point is that the route table stays ONE table -
// a hand-copied list in this file is exactly the drift that produces a button
// pointing at a page that no longer exists. `route.ts` holds no React or
// browser imports for the same reason (the route tests already import it under
// the node tsconfig).
import type { Route } from "../../ui/app/route.js";

/** Most buttons the user will ever want under one answer. Beyond this the
 *  answer has stopped answering and started offering a menu. */
export const ANSWER_ACTIONS_MAX = 4;

/** How many raw candidates are even looked at. Bounds the work a model can
 *  cause by emitting a thousand-entry array. */
const ANSWER_ACTION_CANDIDATES_MAX = 16;

/** A button label, not a sentence. */
export const ANSWER_ACTION_LABEL_MAX = 48;

/** A follow-up prompt, not a document. */
export const ANSWER_ACTION_PROMPT_MAX = 2_000;

/** Control characters, allowing tab and newline. Carriage returns are excluded
 *  deliberately: `text` normalizes CRLF first, so a surviving lone \r is noise. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/;

/** A label is one line of plain text. Angle brackets are refused so a label
 *  can never read as markup wherever it ends up rendered or logged. */
const LABEL_FORBIDDEN = /[\u0000-\u001F\u007F-\u009F<>]/;

// ── The navigable route vocabulary ──────────────────────────────────────────
//
// A strict subset of the app's routes. Two things are left out on purpose:
// the legacy git/git-tree/merge aliases (a model has no reason to emit an old
// spelling of a page that still exists), and every deep-link parameter whose
// id-space the server cannot vouch for - run inspector tabs, replay focus, and
// codebase file paths.

/** Route kinds that are a page and nothing else. These carry no model-supplied
 *  data at all, which makes them the safe core of the vocabulary. */
const PARAMETERLESS_KINDS = [
  "mission",
  "compose",
  "dashboard",
  "board",
  "workspace",
  "proposals",
  "settings",
  "policies",
  "project",
  "flows",
  "metrics",
  "providers",
  "supervisors",
  "supervisors-new",
  "ledger",
  "profiles",
  "config",
] as const;

type ParameterlessKind = (typeof PARAMETERLESS_KINDS)[number];

/** Written as a mapped type rather than `{ kind: ParameterlessKind }` so it is
 *  a real union of single-kind members, which is what the assignability proof
 *  below needs in order to check each one. */
type ParameterlessRoute = {
  [K in ParameterlessKind]: { kind: K };
}[ParameterlessKind];

const RUN_FILTER_VALUES = ["active", "merge-ready", "failed"] as const;
const SOURCE_TABS = ["changes", "tree", "merge"] as const;

/** Where a `navigate` action may point. */
export type AnswerRoute =
  | ParameterlessRoute
  | { kind: "runs"; status?: (typeof RUN_FILTER_VALUES)[number] }
  | { kind: "source"; tab: (typeof SOURCE_TABS)[number]; runId: string | null }
  | { kind: "codebase"; filePath: null; line: null; runId: null }
  | { kind: "task"; taskId: string }
  | { kind: "run"; runId: string }
  | { kind: "control"; runId: string }
  | { kind: "proposal"; proposalId: string }
  | { kind: "consult"; taskId: string | null }
  | { kind: "flow"; flowId: string | null }
  | { kind: "flow-editor"; flowId: string | null }
  | { kind: "crew"; crewId: string | null }
  | { kind: "crew-editor"; crewId: string | null };

/**
 * Every kind a model-authored destination may name, in one place.
 *
 * Exported because a second surface now states this vocabulary in a prompt (the
 * generated walkthrough in ui/lib/guides/generated.ts). A hand-copied list there
 * is exactly the drift that offers a model a page this table will then drop.
 */
export const ANSWER_ROUTE_KINDS = [
  ...PARAMETERLESS_KINDS,
  "runs",
  "source",
  "codebase",
  "task",
  "run",
  "control",
  "proposal",
  "consult",
  "flow",
  "flow-editor",
  "crew",
  "crew-editor",
] as const;

export type AnswerRouteKind = (typeof ANSWER_ROUTE_KINDS)[number];

/**
 * Compile-time proof that every route this module can emit is a route the app
 * actually has. Delete a kind from the app's table, rename a param, or make an
 * optional param required, and this line stops compiling - which is the whole
 * reason the `Route` type is imported rather than copied.
 *
 * The bracket form is load-bearing: `AnswerRoute extends Route ? true : false`
 * DISTRIBUTES over the union and collapses `true | false` back to `boolean`,
 * so a single bad member would not be caught reliably.
 */
type Assert<T extends true> = T;
type AnswerRoutesAreRealRoutes = Assert<[AnswerRoute] extends [Route] ? true : false>;
// Referenced so the alias is not read as dead code by a future sweep.
export type { AnswerRoutesAreRealRoutes };

// ── The action shapes ───────────────────────────────────────────────────────

/** Fills the composer and sends nothing. The user reads it, edits it, sends it. */
export type PromptAnswerAction = {
  kind: "prompt";
  label: string;
  text: string;
};

/** Opens a page. Lands the user there; the page's own controls do the acting. */
export type NavigateAnswerAction = {
  kind: "navigate";
  label: string;
  route: AnswerRoute;
};

export type AnswerAction = PromptAnswerAction | NavigateAnswerAction;

/**
 * The id lists a route may reference, built by the SERVER from real project
 * state. Every field is required so a caller cannot quietly leave one id-space
 * unchecked by forgetting a key; pass {@link ANSWER_ACTION_IDS_NONE} when
 * nothing is known, and every id-bearing route is dropped.
 */
export type AnswerActionIds = {
  taskIds: readonly string[];
  runIds: readonly string[];
  flowIds: readonly string[];
  crewIds: readonly string[];
  proposalIds: readonly string[];
};

/** Nothing is known, so only parameterless destinations survive. */
export const ANSWER_ACTION_IDS_NONE: AnswerActionIds = {
  taskIds: [],
  runIds: [],
  flowIds: [],
  crewIds: [],
  proposalIds: [],
};

// ── Validation ──────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reject an object carrying anything this route kind does not define. An
 *  unexpected key means the model meant something this table does not model. */
function onlyKeys(raw: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(raw).every((k) => allowed.includes(k));
}

/** A required id: a non-empty string that the server vouched for. */
function knownId(value: unknown, allowed: readonly string[]): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return allowed.includes(value) ? value : null;
}

/** An optional id: absent/null is the "no target" form of the route and is
 *  always fine (it needs nothing from the model); a present id must be known. */
function optionalKnownId(
  value: unknown,
  allowed: readonly string[],
): { ok: true; id: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, id: null };
  const id = knownId(value, allowed);
  return id === null ? { ok: false } : { ok: true, id };
}

/**
 * Parse one model-authored route. Returns null for anything not in the table,
 * which is how an invented `"/billing"` becomes no button rather than a dead
 * one.
 *
 * `ids === null` means "structural check only", and is used exactly once: when
 * re-reading a route this module already validated and wrote to disk. Model
 * output never takes that path - {@link parseAnswerActions} requires ids.
 */
function parseAnswerRoute(raw: unknown, ids: AnswerActionIds | null): AnswerRoute | null {
  if (!isRecord(raw)) return null;
  const kind = raw["kind"];
  if (typeof kind !== "string") return null;

  // `find` rather than a Set so the result is the narrowed literal type: the
  // route is built from the entry in the table, never from the model's string.
  const parameterless = PARAMETERLESS_KINDS.find((k) => k === kind);
  if (parameterless) {
    // These take nothing, so they must arrive carrying nothing.
    if (!onlyKeys(raw, ["kind"])) return null;
    return { kind: parameterless };
  }

  switch (kind) {
    case "runs": {
      if (!onlyKeys(raw, ["kind", "status"])) return null;
      const status = raw["status"];
      if (status === undefined || status === null) return { kind: "runs" };
      const match = RUN_FILTER_VALUES.find((v) => v === status);
      return match ? { kind: "runs", status: match } : null;
    }
    case "source": {
      if (!onlyKeys(raw, ["kind", "tab", "runId"])) return null;
      const tab = SOURCE_TABS.find((v) => v === raw["tab"]);
      if (!tab) return null;
      if (ids === null) {
        const runId = raw["runId"];
        if (runId !== undefined && runId !== null && typeof runId !== "string") return null;
        return { kind: "source", tab, runId: (runId as string | undefined) ?? null };
      }
      const runId = optionalKnownId(raw["runId"], ids.runIds);
      return runId.ok ? { kind: "source", tab, runId: runId.id } : null;
    }
    case "codebase": {
      // The file-path id-space has no server-built allowlist to check against,
      // so a model-named path is refused rather than opened. The bare browser
      // is still a useful destination.
      if (!onlyKeys(raw, ["kind"])) return null;
      return { kind: "codebase", filePath: null, line: null, runId: null };
    }
    case "task": {
      if (!onlyKeys(raw, ["kind", "taskId"])) return null;
      if (ids === null) {
        return typeof raw["taskId"] === "string" && raw["taskId"].length > 0
          ? { kind: "task", taskId: raw["taskId"] }
          : null;
      }
      const taskId = knownId(raw["taskId"], ids.taskIds);
      return taskId === null ? null : { kind: "task", taskId };
    }
    case "run":
    case "control": {
      if (!onlyKeys(raw, ["kind", "runId"])) return null;
      if (ids === null) {
        return typeof raw["runId"] === "string" && raw["runId"].length > 0
          ? { kind, runId: raw["runId"] }
          : null;
      }
      const runId = knownId(raw["runId"], ids.runIds);
      return runId === null ? null : { kind, runId };
    }
    case "proposal": {
      if (!onlyKeys(raw, ["kind", "proposalId"])) return null;
      if (ids === null) {
        return typeof raw["proposalId"] === "string" && raw["proposalId"].length > 0
          ? { kind: "proposal", proposalId: raw["proposalId"] }
          : null;
      }
      const proposalId = knownId(raw["proposalId"], ids.proposalIds);
      return proposalId === null ? null : { kind: "proposal", proposalId };
    }
    case "consult": {
      if (!onlyKeys(raw, ["kind", "taskId"])) return null;
      if (ids === null) {
        const taskId = raw["taskId"];
        if (taskId !== undefined && taskId !== null && typeof taskId !== "string") return null;
        return { kind: "consult", taskId: (taskId as string | undefined) ?? null };
      }
      const taskId = optionalKnownId(raw["taskId"], ids.taskIds);
      return taskId.ok ? { kind: "consult", taskId: taskId.id } : null;
    }
    case "flow":
    case "flow-editor": {
      if (!onlyKeys(raw, ["kind", "flowId"])) return null;
      if (ids === null) {
        const flowId = raw["flowId"];
        if (flowId !== undefined && flowId !== null && typeof flowId !== "string") return null;
        return { kind, flowId: (flowId as string | undefined) ?? null };
      }
      const flowId = optionalKnownId(raw["flowId"], ids.flowIds);
      return flowId.ok ? { kind, flowId: flowId.id } : null;
    }
    case "crew":
    case "crew-editor": {
      if (!onlyKeys(raw, ["kind", "crewId"])) return null;
      if (ids === null) {
        const crewId = raw["crewId"];
        if (crewId !== undefined && crewId !== null && typeof crewId !== "string") return null;
        return { kind, crewId: (crewId as string | undefined) ?? null };
      }
      const crewId = optionalKnownId(raw["crewId"], ids.crewIds);
      return crewId.ok ? { kind, crewId: crewId.id } : null;
    }
    default:
      return null;
  }
}

/**
 * THE ENTRY POINT for a model-authored DESTINATION on its own, for a caller
 * whose surrounding shape is not a button. A generated walkthrough step is a
 * place to stand plus a control to ring, not a label and a click, so it needs
 * the route gate without the action wrapper.
 *
 * Same table, same drop-on-mismatch rule, same server-built id allowlists. The
 * point of exposing it is that there stays exactly ONE route table: a caller
 * that re-implemented "is this a real page" would be the first place a dead
 * destination could get through.
 */
export function parseNavigateRoute(raw: unknown, ids: AnswerActionIds): AnswerRoute | null {
  try {
    return parseAnswerRoute(raw, ids);
  } catch {
    // A candidate that throws is a candidate that is dropped, exactly as it is
    // inside parseAnswerActions. A caller mapping over model output must never
    // lose the whole batch to one hostile entry.
    return null;
  }
}

function parseLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const label = raw.trim();
  if (label.length === 0 || label.length > ANSWER_ACTION_LABEL_MAX) return null;
  if (LABEL_FORBIDDEN.test(label)) return null;
  return label;
}

function parsePromptText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Normalize line endings before the control-character check so a model that
  // emits CRLF is not punished for its JSON encoder.
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length === 0 || text.length > ANSWER_ACTION_PROMPT_MAX) return null;
  if (CONTROL_CHARS.test(text)) return null;
  return text;
}

/** One action, or null. `ids === null` is the on-disk re-read path (see
 *  {@link parseAnswerRoute}). */
function parseAnswerAction(raw: unknown, ids: AnswerActionIds | null): AnswerAction | null {
  if (!isRecord(raw)) return null;
  const label = parseLabel(raw["label"]);
  if (label === null) return null;

  switch (raw["kind"]) {
    case "prompt": {
      // A prompt action has no destination. Carrying one means the model has
      // conflated the two kinds, and a conflated action is dropped rather than
      // half-honoured.
      if (!onlyKeys(raw, ["kind", "label", "text"])) return null;
      const text = parsePromptText(raw["text"]);
      return text === null ? null : { kind: "prompt", label, text };
    }
    case "navigate": {
      if (!onlyKeys(raw, ["kind", "label", "route"])) return null;
      const route = parseAnswerRoute(raw["route"], ids);
      return route === null ? null : { kind: "navigate", label, route };
    }
    default:
      return null;
  }
}

/**
 * THE ENTRY POINT for model output. Takes whatever the model produced and
 * returns the actions that survived, capped.
 *
 * Never throws: a bad batch is an answer with no buttons, not a failed turn.
 * Each candidate is validated inside its own boundary so one corrupt entry
 * cannot take the others down with it.
 */
export function parseAnswerActions(raw: unknown, ids: AnswerActionIds): AnswerAction[] {
  if (!Array.isArray(raw)) return [];
  const out: AnswerAction[] = [];
  for (const candidate of raw.slice(0, ANSWER_ACTION_CANDIDATES_MAX)) {
    if (out.length >= ANSWER_ACTIONS_MAX) break;
    try {
      const action = parseAnswerAction(candidate, ids);
      if (action) out.push(action);
    } catch {
      // A candidate that throws is a candidate that is dropped.
    }
  }
  return out;
}

/**
 * The persisted shape, for schemas that store actions alongside an answer.
 *
 * It runs the same validator rather than restating the union in Zod, so there
 * is one definition of a valid action and no way for the two to drift.
 *
 * Ids are NOT re-checked here: this path only ever reads back what
 * {@link parseAnswerActions} already allowlisted, and a stored button whose
 * task was since deleted should still render and land on the page that says so
 * - re-checking would silently blank the history instead.
 */
export const answerActionSchema: z.ZodType<AnswerAction, unknown> = z
  .unknown()
  .transform((value, ctx) => {
    const parsed = parseAnswerAction(value, null);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: "Not a valid answer action" });
      return z.NEVER;
    }
    return parsed;
  });

/**
 * The array field to embed in an answer schema.
 *
 * `.catch([])` is deliberate: a thread file whose actions will not parse loses
 * its buttons, never its messages. Dropping the conversation because a button
 * went bad is the failure mode this avoids.
 */
export const answerActionsField = z
  .array(answerActionSchema)
  .max(ANSWER_ACTIONS_MAX)
  .default([])
  .catch([]);

/** The JSON sketch to embed in a prompt, and the destinations it may name. */
export const ANSWER_ACTIONS_SCHEMA_HINT = `[
  { "kind": "prompt", "label": "string - <=${ANSWER_ACTION_LABEL_MAX} chars, one line", "text": "string - the follow-up to put in the composer" },
  { "kind": "navigate", "label": "string", "route": { "kind": "one of: ${ANSWER_ROUTE_KINDS.join(", ")}" } }
]
At most ${ANSWER_ACTIONS_MAX}. Routes that name a task/run/flow/crew/proposal must use an id from the list given above; any other id is discarded. Neither kind writes anything or starts a run.`;
