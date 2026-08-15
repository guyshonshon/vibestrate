// ── Flow assist: draft a flow from English, or revise the one being edited ───
//
// Two entry points on one seam. `draftFlowFromDescription` turns a description
// into a whole new flow; `reviseFlowFromInstruction` takes the flow the owner
// is editing plus one instruction and proposes a revision OF THAT flow - or
// just answers, when the instruction was a question. Both make one model call
// through `runAssist`, Zod-validate the result, and write NOTHING. Shared by
// the CLI and the dashboard routes so the two can never drift.
//
// SECURITY INVARIANTS (do not weaken):
//   1. NO WRITE, AND NO WRITER IN SCOPE. This module imports `validateFlowObject`
//      - a pure validator - and nothing else from the portability module. It
//      cannot create a flow file; accepting a draft or a revision is a separate,
//      explicit owner action (POST /api/flows or `vibe flows import`).
//   2. REDACTION BEFORE THE MODEL. `runAssist` redacts the whole assembled
//      prompt - description, the flow being edited, rules, schema hint, retry
//      text - and is the single funnel for it. A second call here would only
//      cover one of those, and a test pinned to it would pass with the real
//      guard deleted.
//   3. REFUSE, NEVER REDACT, ON THE WAY BACK. A drafted or revised flow whose
//      YAML carries a secret shape is refused outright. A flow file is committed
//      and its text lands in agent prompts, so silently redacting it would ship
//      a broken flow that looks accepted.
//   4. NO OUTBOUND NETWORK CALL. Vibestrate opens no socket to check a current
//      fact. When a draft depends on one, the AGENT uses its own tools inside
//      its provider CLI and reports the result in `currency`; an agent with no
//      such tool reports the gap in `currency.unverified` instead of guessing.

import path from "node:path";
import { z } from "zod";
import YAML from "yaml";
import { ConfigError, VibestrateError } from "../../utils/errors.js";
import { runAssist, type AssistProviderRunner } from "../../core/assist/assist-runner.js";
import { loadConfig } from "../../project/config-loader.js";
import { getCrew } from "../../agents/crew-registry.js";
import type { CrewConfig } from "../../agents/crew-schema.js";
import { pathExists } from "../../utils/fs.js";
import { projectFlowsDir } from "../../utils/paths.js";
import { discoverFlowCatalog } from "../catalog/flow-discovery.js";
import {
  flowDefinitionSchema,
  flowStepSchema,
  type FlowDefinition,
} from "../schemas/flow-schema.js";
// Validator only. `flow-portability.ts` also holds the guarded writer; that
// function is deliberately NOT imported here (invariant 1). Reusing its
// validator is the point: a draft is held to exactly the checks the accept path
// enforces, so "it drafted" and "it saved" can never disagree.
import { validateFlowObject } from "../runtime/flow-portability.js";
import {
  computeFlowSeatCoverage,
  type FlowCoverage,
} from "../runtime/seat-coverage.js";

export class FlowAssistError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("FLOW_ASSIST_ERROR", message, cause);
    this.name = "FlowAssistError";
  }
}

const AUDIT_BUCKET = "flow-assist";

/** Bound on the owner's free-text description. Long enough for a real request,
 *  short enough that a caller can't flood the provider. */
const MAX_DESCRIPTION = 1_000;

/** The flow schema carries roughly fifteen cross-field rules in one refinement,
 *  and Zod reports them together; a model that trips three of them needs more
 *  than the single retry the assist default allows. */
const MAX_ATTEMPTS = 3;

/**
 * What the model checked with a live tool, and what it could not. Empty on both
 * sides = nothing in this draft depended on a fact that changes over time.
 * `checked` entries name the source the AGENT's own web tool returned;
 * Vibestrate opens no socket to produce them.
 *
 * This is model self-report and nothing here can verify it. Render it always,
 * including when empty, so an empty list reads as a claim rather than silence.
 * Shared with `crew-assist.ts` so both drafts report currency identically.
 */
export const currencySchema = z
  .object({
    checked: z.array(z.string().min(1).max(300)).max(10).default([]),
    unverified: z.array(z.string().min(1).max(300)).max(10).default([]),
  })
  .strict()
  .default({ checked: [], unverified: [] });

/**
 * The model's output. `flow` is the REAL `flowDefinitionSchema`, so every
 * cross-field rule in flow-schema.ts becomes a Zod issue that `runAssist` feeds
 * back verbatim on the retry: the model corrects against the same validator the
 * writer enforces, and a drafted flow parses first time.
 */
const flowDraftAssistSchema = z
  .object({
    flow: flowDefinitionSchema,
    rationale: z.string().min(1).max(1_200),
    currency: currencySchema,
  })
  .strict();

export type FlowDraft = {
  flow: FlowDefinition;
  /** Canonical YAML - byte-for-byte what accepting this draft would write. */
  yaml: string;
  rationale: string;
  currency: { checked: string[]; unverified: string[] };
  /** Seat gaps against the target crew, computed locally (no model involved). */
  coverage: FlowCoverage;
  /** Project-relative: `.vibestrate/flows/<id>/flow.yml`. */
  targetPath: string;
  /** A project flow with this id already exists (accepting needs overwrite). */
  exists: boolean;
};

const FLOW_DRAFT_SCHEMA_HINT =
  '{ "flow": { "id": "kebab-id", "version": 1, "label": "...", "description": "...", ' +
  '"seats": { "implementer": { "label": "Implementer", "description": "..." } }, ' +
  '"steps": [ { "id": "implement", "label": "Implement", "kind": "agent-turn", ' +
  '"seat": "implementer", "stage": "executing", "inputs": ["task-brief"], ' +
  '"outputs": ["execution", "diff"] } ] }, ' +
  '"rationale": "why this shape", ' +
  '"currency": { "checked": ["claim - source"], "unverified": ["claim you could not check"] } }';

/** Everything true of a Flow whether it is being drafted from nothing or
 *  revised in place: the token rules, the six step kinds, the ten seats, the
 *  input/output vocabulary, the validator's hard rules, and the no-network fact
 *  policy. Shared so a rule tightened for one surface is tightened for both. */
const FLOW_SHAPE_GUIDANCE = `
TOKENS
- Flow id, every seat key, every step id, and every inputs/outputs/needs entry
  must match ^[a-z][a-z0-9-]*$ - lowercase, digits, dashes. No underscores, no
  capitals, no leading digit. This is the single most common failure.

STEP KINDS - exactly six, no others
- agent-turn     produces work (plan, architect, implement). Needs a seat.
- review-turn    a DIFFERENT seat judges a prior artifact. Needs a seat. The only
                 kind allowed as loop.decisionStep.
- response-turn  the original seat answers the findings. Needs a seat.
- summary-turn   an arbiter/verifier writes the final summary. Needs a seat.
- validation     runs the project's configured validation commands. No seat, no
                 approval, no retries, no skills, no continueOnError.
- approval-gate  halts for a human decision. Requires an "approval" object with
                 "reason" and "requestedAction". No repeat, no retries, no skills.

SEATS - use only these ten names, or the flow will not resolve against a crew:
planner, architect, implementer, executor, builder, fixer, reviewer, challenger,
verifier, arbiter. Writer seats are implementer and fixer; every other seat is
read-only. Declare each seat you use in the top-level "seats" map with a label.

TOKEN VOCABULARY for inputs/outputs - draw from these, do not invent:
task-brief (seeded before step 1), plan, architecture, execution, diff,
validation, findings, review-decision, finding-responses, finding-resolutions,
decision-summary, verification.

HARD RULES the validator enforces
- Turn kinds require a seat; approval-gate requires approval metadata; approval
  metadata is illegal on any other kind.
- continueOnError and retries only exist in GRAPH flows (some step declares
  "needs"). Omit them from a plain linear flow.
- Every "needs" target must be declared EARLIER in the steps array. Steps are in
  topological order; a forward reference is a cycle.
- A parallel group (steps sharing the same "needs") is capped at 4 members, its
  members must all be seated model turns on READ-ONLY seats, and no two members
  may write the same output token. Never fan out implementer or fixer.
- skipWhen accepts only "inert_diff", only on review-turn or summary-turn, and
  only in a linear non-checklist flow outside any loop body.
- Prefer the simplest shape that satisfies the request. A linear flow of 3-6
  steps is usually right. Do not add a loop, a graph, a checklist segment, or
  params unless the owner asked for that behaviour.

CURRENT FACTS - read this before you write anything
Vibestrate itself makes no outbound network call. If this draft depends on a
fact that changes over time - a tool's current version, a model name, a CLI
flag, a package's present API, a service's limits - then:
 - If you have a web search or fetch tool available, USE IT, and list each claim
   you confirmed in "currency.checked" as "<claim> - <source>".
 - If you have NO such tool, do NOT answer from memory. Choose the conservative
   option that does not depend on the fact, and list the claim you could not
   check in "currency.unverified", phrased so the owner knows exactly what to
   confirm. For example: "assumed the project's Node version; could not check
   what is current".
An empty "currency" is correct only when nothing in the draft depends on a
current fact. Stating an unverified assumption is always better than guessing.

You may read files and search to ground your answer. You may NOT write files,
run commands, or take any other action. Return structured data only.
`.trim();

const FLOW_DRAFT_GUIDANCE =
  `
You are drafting a Vibestrate Flow: the ordered recipe a run follows, and which
seat performs each step. This is a SUGGESTION the owner reviews and explicitly
saves. You are not creating anything.
`.trim() +
  "\n\n" +
  FLOW_SHAPE_GUIDANCE;

/**
 * Turn one English description into an editable Flow draft. NO WRITE: the
 * returned draft carries the canonical YAML and the seat coverage the owner
 * reviews before accepting it through the (separate) create/import path.
 */
export async function draftFlowFromDescription(input: {
  projectRoot: string;
  description: string;
  /** Coverage target, and the crew whose planner drafts it. Default: the
   *  project's `defaultCrew`. */
  crewId?: string | null;
  /** Test seam - defaults to the real provider runner. */
  runner?: AssistProviderRunner;
}): Promise<{ draft: FlowDraft }> {
  const description = input.description.trim();
  if (!description) throw new FlowAssistError("A description is required.");
  if (description.length > MAX_DESCRIPTION) {
    throw new FlowAssistError(`Description exceeds ${MAX_DESCRIPTION} characters.`);
  }
  // Read config once and reuse it for the assist target, the crew check, and
  // the coverage computation.
  const loaded = await loadConfig(input.projectRoot);
  // Resolve the crew BEFORE spending a provider call: an unknown crew id is bad
  // input, and finding that out after the model has answered wastes the spawn.
  let resolvedCrew: { crewId: string; crew: CrewConfig };
  try {
    resolvedCrew = getCrew(loaded.config, input.crewId);
  } catch (err) {
    if (err instanceof ConfigError) throw new FlowAssistError(err.message, err);
    throw err;
  }
  const { crewId, crew } = resolvedCrew;

  const catalog = await discoverFlowCatalog(input.projectRoot);
  const takenIds = catalog.flows.map((f) => f.id).sort();

  const instruction =
    FLOW_DRAFT_GUIDANCE +
    "\n\nIds already taken (pick a different one): " +
    (takenIds.join(", ") || "none") +
    "\n\nThe owner describes the flow they want:\n" +
    // Raw here on purpose: runAssist redacts the assembled prompt (INVARIANT 2).
    `"""${description}"""\n\n` +
    "Produce ONE flow definition capturing it.";

  const res = await runAssist({
    projectRoot: input.projectRoot,
    loaded,
    label: "flow-draft",
    instruction,
    schema: flowDraftAssistSchema,
    schemaHint: FLOW_DRAFT_SCHEMA_HINT,
    auditBucket: AUDIT_BUCKET,
    maxAttempts: MAX_ATTEMPTS,
    crewId,
    runner: input.runner,
  });

  // Deterministic post-Zod layer: no re-prompt, no model judgment.
  const validated = validateFlowObject(res.parsed.flow);
  if (!validated.ok) {
    // INVARIANT 3: refuse, never redact. This is also the second line of defence
    // for the schema itself, so a future looser assist schema still cannot
    // return a flow the writer would reject.
    throw new FlowAssistError(
      `Refusing to return this drafted flow: ${validated.reasons.join(" ")}`,
    );
  }
  const definition = validated.definition;

  const coverage = computeFlowSeatCoverage({ flow: definition, crew, crewId });
  const filePath = path.join(projectFlowsDir(input.projectRoot), definition.id, "flow.yml");

  return {
    draft: {
      flow: definition,
      yaml: YAML.stringify(definition),
      rationale: res.parsed.rationale,
      currency: res.parsed.currency,
      coverage,
      targetPath: path.relative(input.projectRoot, filePath),
      exists: await pathExists(filePath),
    },
  };
}

// ── Revising the flow the owner is editing ───────────────────────────────────
//
// A drafter is the wrong tool for an editor: accepting a fresh draft throws away
// the work the owner is holding. A revision takes the flow AS IT STANDS plus one
// instruction and proposes a revision of that same flow, so accepting it is an
// edit rather than a replacement.
//
// Two things follow from that, and both are load-bearing:
//   - The flow arriving here is the EDITOR's flow, which may not parse. "this
//     flow never validates - fix that" is a legitimate instruction, so the input
//     is `unknown` and only the model's ANSWER is held to `flowDefinitionSchema`.
//   - An instruction may be a question ("why is the architect seat uncovered?").
//     A null revision plus an answer is a success, not a failure.

/** Bound on the instruction. Same reasoning as MAX_DESCRIPTION: long enough for
 *  a real request, short enough that a caller can't flood the provider. */
export const MAX_INSTRUCTION = 1_000;

/** Bound on the serialized flow embedded in the prompt. A flow definition is a
 *  few kilobytes; this is a ceiling on what one HTTP caller can push through a
 *  provider, not a target. */
export const MAX_FLOW_JSON = 64 * 1024;

/** Bound on the editor's reported problems, forwarded verbatim as the stated
 *  fault to fix. */
export const MAX_PROBLEMS = 40;
export const MAX_PROBLEM_CHARS = 400;

/**
 * The model's output. `flow` is the REAL `flowDefinitionSchema` again, so a
 * revision is corrected against the same validator the writer enforces. It is
 * NULLABLE on purpose: an instruction that asks a question has a right answer
 * with no edit in it, and forcing a flow back would make the model invent one.
 */
const flowRevisionAssistSchema = z
  .object({
    flow: flowDefinitionSchema.nullable().default(null),
    answer: z.string().min(1).max(2_000),
    currency: currencySchema,
  })
  .strict();

/** One field that differs between the flow as it stands and the revision.
 *  `before`/`after` are rendered for display; `null` means the key was absent
 *  on that side (distinct from present-but-empty, which renders as "none"). */
export type FlowFieldChange = {
  name: string;
  before: string | null;
  after: string | null;
};

/** One difference, anchored where the editor already pins messages: a top-level
 *  flow field, a step, a seat, or the loop. */
export type FlowRevisionChange = {
  target: "flow" | "step" | "seat" | "loop";
  op: "added" | "removed" | "edited" | "moved";
  /** Step id, seat id, or the flow field's name. Null for the loop. */
  id: string | null;
  /** Position in the REVISED steps array. Null for a removed step and for
   *  every non-step change. */
  index: number | null;
  fields: FlowFieldChange[];
  /** One rendered line. */
  summary: string;
};

export type FlowRevision = {
  /** The revised definition, or null when the instruction was a question. */
  flow: FlowDefinition | null;
  /** Canonical YAML of the revision. Null when there is no revision. */
  yaml: string | null;
  /** What the model changed, or its answer to the question. Always present. */
  answer: string;
  /**
   * What ACTUALLY changed, computed from the two definitions here. Deliberately
   * not model self-report: an assistant claiming "I added a review step" while
   * adding none is exactly the failure this surface must not have. Empty when
   * there is no revision, and empty is also the honest answer when a revision
   * came back byte-identical to the flow it was given.
   */
  changes: FlowRevisionChange[];
  currency: { checked: string[]; unverified: string[] };
  /** Seat coverage of the flow this result describes - the revision when there
   *  is one, otherwise the flow as it stands. Null when neither parses.
   *  Computed locally, no model involved. */
  coverage: FlowCoverage | null;
};

const FLOW_REVISION_SCHEMA_HINT =
  '{ "flow": <the WHOLE revised flow definition, same shape as the one you were ' +
  "given, or null if no edit is called for>, " +
  '"answer": "what you changed, or the answer to the question", ' +
  '"currency": { "checked": ["claim - source"], "unverified": ["claim you could not check"] } }';

const FLOW_REVISION_GUIDANCE =
  `
You are revising a Vibestrate Flow the owner is editing right now: the ordered
recipe a run follows, and which seat performs each step. You are given the flow
AS IT CURRENTLY STANDS and one instruction. This is a SUGGESTION the owner
reviews and accepts or rejects. You are not changing anything.

WHAT TO RETURN
- If the instruction calls for a change, return the WHOLE revised flow in
  "flow": every key you were given, carried through, with your edit applied. A
  key you drop is a key the owner loses, including keys you do not recognise.
- If the instruction is a QUESTION and no edit is called for, return
  "flow": null and answer it in "answer". That is a complete, correct response.
- Keep the flow's "id" as it is unless you were asked to rename it.
- Make the smallest change that satisfies the instruction. Leave every step,
  seat and field the instruction did not reach exactly as you found it.
- The flow you were given may be mid-edit and may not be valid yet. Fix what the
  instruction asks about; do not quietly rewrite the rest to make it parse.
- "answer" is one or two plain sentences. The owner is shown the actual diff, so
  do not list the fields you touched.
`.trim() +
  "\n\n" +
  FLOW_SHAPE_GUIDANCE;

/**
 * Propose a revision of the flow the owner is editing. NO WRITE: the returned
 * revision is applied to the owner's draft only if they accept it, and saving
 * that draft is the (separate) guarded writer's job.
 */
export async function reviseFlowFromInstruction(input: {
  projectRoot: string;
  /** The flow AS IT STANDS in the editor. Unvalidated on purpose - a flow that
   *  does not parse is a legitimate thing to ask for help with. */
  flow: unknown;
  instruction: string;
  /** Problems the editor already reports with the flow as it stands, forwarded
   *  verbatim so the model fixes the stated fault rather than guessing at it. */
  problems?: readonly string[];
  /** Coverage target, and the crew whose planner answers. Default: the
   *  project's `defaultCrew`. */
  crewId?: string | null;
  /** Test seam - defaults to the real provider runner. */
  runner?: AssistProviderRunner;
}): Promise<{ revision: FlowRevision }> {
  const instruction = input.instruction.trim();
  if (!instruction) throw new FlowAssistError("An instruction is required.");
  if (instruction.length > MAX_INSTRUCTION) {
    throw new FlowAssistError(`Instruction exceeds ${MAX_INSTRUCTION} characters.`);
  }
  if (!input.flow || typeof input.flow !== "object" || Array.isArray(input.flow)) {
    throw new FlowAssistError("A flow object is required.");
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(input.flow, null, 2);
  } catch (err) {
    throw new FlowAssistError("The flow could not be serialized.", err);
  }
  if (serialized.length > MAX_FLOW_JSON) {
    throw new FlowAssistError(`Flow exceeds ${MAX_FLOW_JSON} characters serialized.`);
  }
  const problems = (input.problems ?? []).slice(0, MAX_PROBLEMS);

  const loaded = await loadConfig(input.projectRoot);
  // Resolve the crew BEFORE spending a provider call - same cheap-fail-first
  // ordering as the drafter.
  let resolvedCrew: { crewId: string; crew: CrewConfig };
  try {
    resolvedCrew = getCrew(loaded.config, input.crewId);
  } catch (err) {
    if (err instanceof ConfigError) throw new FlowAssistError(err.message, err);
    throw err;
  }
  const { crewId, crew } = resolvedCrew;

  // Coverage of the flow as it stands, when it parses. This is what makes a
  // question like "why is this seat uncovered?" answerable from fact instead of
  // from the model's guess at who is in the crew.
  const standing = flowDefinitionSchema.safeParse(input.flow);
  const standingCoverage = standing.success
    ? computeFlowSeatCoverage({ flow: standing.data, crew, crewId })
    : null;

  const promptInstruction =
    FLOW_REVISION_GUIDANCE +
    "\n\nThe flow as it currently stands:\n" +
    // Raw here on purpose: runAssist redacts the assembled prompt (INVARIANT 2).
    "```json\n" +
    serialized +
    "\n```\n" +
    (problems.length
      ? "\nThe editor reports these problems with it:\n" +
        problems.map((p) => `- ${p.slice(0, MAX_PROBLEM_CHARS)}`).join("\n") +
        "\n"
      : "") +
    (standingCoverage ? `\n${renderCoverageForPrompt(standingCoverage)}\n` : "") +
    "\nThe owner's instruction:\n" +
    `"""${instruction}"""\n\n` +
    "Revise the flow to satisfy it, or answer it if it asks for no change.";

  const res = await runAssist({
    projectRoot: input.projectRoot,
    loaded,
    label: "flow-revise",
    instruction: promptInstruction,
    schema: flowRevisionAssistSchema,
    schemaHint: FLOW_REVISION_SCHEMA_HINT,
    auditBucket: AUDIT_BUCKET,
    maxAttempts: MAX_ATTEMPTS,
    crewId,
    runner: input.runner,
  });

  // An answer with no revision is a success. Everything below is the revision
  // path only.
  if (res.parsed.flow === null) {
    return {
      revision: {
        flow: null,
        yaml: null,
        answer: res.parsed.answer,
        changes: [],
        currency: res.parsed.currency,
        coverage: standingCoverage,
      },
    };
  }

  // Deterministic post-Zod layer: no re-prompt, no model judgment. Same checks
  // the drafter and the writer apply (INVARIANT 3: refuse, never redact).
  const validated = validateFlowObject(res.parsed.flow);
  if (!validated.ok) {
    throw new FlowAssistError(
      `Refusing to return this revised flow: ${validated.reasons.join(" ")}`,
    );
  }
  const definition = validated.definition;

  return {
    revision: {
      flow: definition,
      yaml: YAML.stringify(definition),
      answer: res.parsed.answer,
      changes: diffFlowDefinitions(input.flow, definition),
      currency: res.parsed.currency,
      coverage: computeFlowSeatCoverage({ flow: definition, crew, crewId }),
    },
  };
}

function renderCoverageForPrompt(coverage: FlowCoverage): string {
  const lines = coverage.seats.map((seat) => {
    const who =
      seat.status === "filled"
        ? `filled by ${seat.resolvedRoleId}`
        : seat.status === "ambiguous"
          ? `ambiguous - ${seat.candidateRoleIds.join(", ")} all fill it`
          : "no role in this crew fills it";
    return `- ${seat.seatId}: ${who}${seat.usedByStep ? "" : " (no step uses it)"}`;
  });
  return `Seat coverage against crew "${coverage.crewId}":\n${lines.join("\n")}`;
}

// ── What actually changed ────────────────────────────────────────────────────

/** Top-level keys handled by their own pass, not the field-by-field one. */
const OWN_PASS_KEYS = new Set(["seats", "steps", "loop"]);

/** The per-step defaults, read off the schema rather than retyped, so a step the
 *  editor sent without `needs` compares equal to a revision that came back with
 *  `needs: []`. Retyping them here would drift the day a default changes. */
const STEP_FIELD_DEFAULTS: Record<string, unknown> = (() => {
  // id/label/kind are the step's identity, taken from the real step; the rest
  // is what the schema fills in when a key is absent.
  const { id, label, kind, ...defaults } = flowStepSchema.parse({
    id: "x",
    label: "x",
    kind: "validation",
  }) as Record<string, unknown>;
  return defaults;
})();

const RENDER_CAP = 200;

function truncate(text: string): string {
  return text.length > RENDER_CAP ? `${text.slice(0, RENDER_CAP - 3)}...` : text;
}

/** Key-sorted JSON, so a field whose value is an object compares by content.
 *  Zod's parse output orders keys by the schema; what the editor sent orders
 *  them however it built the object, and a plain stringify would read that as a
 *  change. */
function stableJson(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const source = val as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) sorted[key] = source[key];
      return sorted;
    }
    return val;
  });
}

function renderValue(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null) return "null";
  if (typeof value === "string") return truncate(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "none";
    if (value.every((entry) => typeof entry === "string")) {
      return truncate((value as string[]).join(", "));
    }
    return truncate(stableJson(value) ?? "");
  }
  if (typeof value === "object") return truncate(stableJson(value) ?? "");
  return truncate(String(value));
}

/** A record with null/undefined values dropped. The editor omits an optional it
 *  has no value for, so an explicit null arriving over HTTP means the same thing
 *  and must not read as a change against a revision that omits the key. */
function withoutEmpty(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry !== null && entry !== undefined) out[key] = entry;
  }
  return out;
}

function opFor(before: unknown, after: unknown): "added" | "removed" | "edited" {
  if (before === undefined) return "added";
  if (after === undefined) return "removed";
  return "edited";
}

/** Steps keyed by id, in order, first occurrence wins. A step with no usable id
 *  cannot be matched to anything in the revision, so it is left out and its
 *  counterpart reads as added - honest, and only reachable from a mid-edit flow
 *  where the owner has not named the step yet. */
function stepsById(raw: unknown): Map<string, { step: Record<string, unknown>; index: number }> {
  const out = new Map<string, { step: Record<string, unknown>; index: number }>();
  const steps = (raw as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return out;
  steps.forEach((entry, index) => {
    const step = withoutEmpty(entry);
    const id = step.id;
    if (typeof id !== "string" || !id || out.has(id)) return;
    out.set(id, { step: { ...STEP_FIELD_DEFAULTS, ...step }, index });
  });
  return out;
}

/** Ids present in both, whose ORDER changed. Anything off the longest common
 *  subsequence moved; everything else kept its place, so inserting one step does
 *  not read as every later step moving. */
function movedStepIds(beforeIds: string[], afterIds: string[]): Set<string> {
  const shared = new Set(beforeIds.filter((id) => afterIds.includes(id)));
  const a = beforeIds.filter((id) => shared.has(id));
  const b = afterIds.filter((id) => shared.has(id));
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const inPlace = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      inPlace.add(a[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++;
    else j++;
  }
  return new Set([...shared].filter((id) => !inPlace.has(id)));
}

function labelOf(step: Record<string, unknown>, fallbackId: string): string {
  const label = step.label;
  return typeof label === "string" && label ? label : fallbackId;
}

function seatOf(step: Record<string, unknown>): string | null {
  const seat = step.seat;
  return typeof seat === "string" && seat ? seat : null;
}

/**
 * The difference between the flow as it stands and the revision, derived from
 * the two definitions. The `before` side is `unknown` because the editor's flow
 * need not parse; it is read leniently, and anything unreadable degrades to
 * "the revision added this" rather than throwing.
 */
export function diffFlowDefinitions(
  before: unknown,
  after: FlowDefinition,
): FlowRevisionChange[] {
  const changes: FlowRevisionChange[] = [];
  const beforeTop = withoutEmpty(before);
  const afterTop = withoutEmpty(after);

  // Top-level fields, including keys the form does not surface (params,
  // capabilities, checklistSegment...). A revision that drops one of those is a
  // silent loss for the owner unless it lands here as a removal.
  const topKeys = [...new Set([...Object.keys(beforeTop), ...Object.keys(afterTop)])]
    .filter((key) => !OWN_PASS_KEYS.has(key))
    .sort();
  for (const key of topKeys) {
    const a = beforeTop[key];
    const b = afterTop[key];
    if (stableJson(a) === stableJson(b)) continue;
    const op = opFor(a, b);
    const summary =
      op === "added"
        ? `Set ${key} to ${renderValue(b)}.`
        : op === "removed"
          ? `Dropped ${key} (was ${renderValue(a)}).`
          : `Changed ${key}: ${renderValue(a)} -> ${renderValue(b)}.`;
    changes.push({
      target: "flow",
      op,
      id: key,
      index: null,
      fields: [{ name: key, before: renderValue(a), after: renderValue(b) }],
      summary,
    });
  }

  // Seats.
  const beforeSeats = withoutEmpty(beforeTop.seats);
  const afterSeats = withoutEmpty(afterTop.seats);
  for (const seatId of [
    ...new Set([...Object.keys(beforeSeats), ...Object.keys(afterSeats)]),
  ].sort()) {
    const a = beforeSeats[seatId];
    const b = afterSeats[seatId];
    if (stableJson(a) === stableJson(b)) continue;
    const op = opFor(a, b);
    const fields =
      op === "edited"
        ? fieldDiff(withoutEmpty(a), withoutEmpty(b))
        : [{ name: "seat", before: renderValue(a), after: renderValue(b) }];
    const summary =
      op === "added"
        ? `Added the ${seatId} seat.`
        : op === "removed"
          ? `Removed the ${seatId} seat.`
          : `Edited the ${seatId} seat: ${fields.map((f) => f.name).join(", ")}.`;
    changes.push({ target: "seat", op, id: seatId, index: null, fields, summary });
  }

  // Steps, keyed by id so a reorder does not read as every step changing.
  const beforeSteps = stepsById(before);
  const afterSteps = stepsById(after);
  const moved = movedStepIds([...beforeSteps.keys()], [...afterSteps.keys()]);
  for (const [stepId, { step: afterStep, index }] of afterSteps) {
    const prior = beforeSteps.get(stepId);
    if (!prior) {
      const seat = seatOf(afterStep);
      changes.push({
        target: "step",
        op: "added",
        id: stepId,
        index,
        fields: [],
        summary: `Added step "${labelOf(afterStep, stepId)}"${seat ? ` on the ${seat} seat` : ""}.`,
      });
      continue;
    }
    const fields = fieldDiff(prior.step, afterStep);
    const didMove = moved.has(stepId);
    if (!fields.length && !didMove) continue;
    if (didMove) {
      fields.push({
        name: "position",
        before: String(prior.index + 1),
        after: String(index + 1),
      });
    }
    const label = labelOf(prior.step, stepId);
    const seatChange = fields.find((f) => f.name === "seat");
    const others = fields.filter((f) => f.name !== "seat").map((f) => f.name);
    let summary: string;
    if (!fields.length) {
      summary = `Moved step "${label}" from position ${prior.index + 1} to ${index + 1}.`;
    } else if (seatChange) {
      summary =
        `Step "${label}" moved from the ${seatChange.before ?? "unseated"} seat ` +
        `to the ${seatChange.after ?? "unseated"} seat.` +
        (others.length ? ` Also changed: ${others.join(", ")}.` : "");
    } else {
      summary = `Edited step "${label}": ${others.join(", ")}.`;
    }
    changes.push({
      target: "step",
      op: fields.length === 1 && didMove ? "moved" : "edited",
      id: stepId,
      index,
      fields,
      summary,
    });
  }
  for (const [stepId, { step }] of beforeSteps) {
    if (afterSteps.has(stepId)) continue;
    changes.push({
      target: "step",
      op: "removed",
      id: stepId,
      index: null,
      fields: [],
      summary: `Removed step "${labelOf(step, stepId)}".`,
    });
  }

  // The loop, one row: its four keys only mean anything together.
  const beforeLoop = beforeTop.loop;
  const afterLoop = afterTop.loop;
  if (stableJson(beforeLoop) !== stableJson(afterLoop)) {
    const op = opFor(beforeLoop, afterLoop);
    changes.push({
      target: "loop",
      op,
      id: null,
      index: null,
      fields: fieldDiff(withoutEmpty(beforeLoop), withoutEmpty(afterLoop)),
      summary:
        op === "added"
          ? "Added the review loop."
          : op === "removed"
            ? "Removed the review loop."
            : "Changed the review loop.",
    });
  }

  return changes;
}

/** Per-key differences between two already-normalized objects. */
function fieldDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FlowFieldChange[] {
  const out: FlowFieldChange[] = [];
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    if (stableJson(before[key]) === stableJson(after[key])) continue;
    out.push({
      name: key,
      before: renderValue(before[key]),
      after: renderValue(after[key]),
    });
  }
  return out;
}
