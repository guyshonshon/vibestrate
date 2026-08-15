// ── Flow assist: describe a flow in English, get an editable draft ───────────
//
// The same seam the Policies surface uses: one model call through `runAssist`,
// a Zod-validated result, and NOTHING written. Shared by the CLI (`vibe flows
// draft`) and the dashboard route so the two can never drift.
//
// SECURITY INVARIANTS (do not weaken):
//   1. NO WRITE, AND NO WRITER IN SCOPE. This module imports `validateFlowObject`
//      - a pure validator - and nothing else from the portability module. It
//      cannot create a flow file; accepting a draft is a separate, explicit
//      owner action (POST /api/flows or `vibe flows import`).
//   2. REDACTION BEFORE THE MODEL. `runAssist` redacts the whole assembled
//      prompt - description, rules, schema hint, retry text - and is the single
//      funnel for it. A second call here would only cover the description, and
//      a test pinned to it would pass with the real guard deleted.
//   3. REFUSE, NEVER REDACT, ON THE WAY BACK. A drafted flow whose YAML carries
//      a secret shape is refused outright. A flow file is committed and its text
//      lands in agent prompts, so silently redacting it would ship a broken flow
//      that looks accepted.
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
import { flowDefinitionSchema, type FlowDefinition } from "../schemas/flow-schema.js";
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

const FLOW_DRAFT_GUIDANCE = `
You are drafting a Vibestrate Flow: the ordered recipe a run follows, and which
seat performs each step. This is a SUGGESTION the owner reviews and explicitly
saves. You are not creating anything.

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

You may read files and search to ground the draft. You may NOT write files, run
commands, or take any other action. Return structured data only.
`.trim();

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
