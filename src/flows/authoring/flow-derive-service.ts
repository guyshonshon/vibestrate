// Derive a flow from the task itself.
//
// `flows draft` asks a model for a whole flow definition. This asks it for
// something much smaller and much harder to get dangerously wrong: a DECOMPOSITION
// of the work - the units, what depends on what, and what each unit is risky
// about, from a closed tag set. Deterministic code (flow-derive.ts) compiles
// that into the graph.
//
// The split is the safety property. Every step id, every `needs` edge and every
// review lens comes from the compiler, so a model can influence WHAT gets
// reviewed only through a closed vocabulary, and can never remove a gate,
// reorder one, or emit a step that writes its own verdict. Same reasoning that
// makes a `block` policy owner-only.
//
// Writes NOTHING. The result is a draft; adopting it is `vibe flows import`,
// which validates again on the way in.
import path from "node:path";
import YAML from "yaml";
import { runAssist, type AssistProviderRunner } from "../../core/assist/assist-runner.js";
import { loadConfig } from "../../project/config-loader.js";
import { getCrew } from "../../agents/crew-registry.js";
import { discoverFlowCatalog } from "../catalog/flow-discovery.js";
import { computeFlowSeatCoverage, type FlowCoverage } from "../runtime/seat-coverage.js";
import {
  flowShapeOutputSchema,
  FLOW_SHAPE_CONTRACT,
  type FlowShapeOutput,
} from "../schemas/flow-output-contracts.js";
import { compileFlowFromShape, FlowDeriveError } from "../runtime/flow-derive.js";
import type { FlowDefinition } from "../schemas/flow-schema.js";
import { VibestrateError } from "../../utils/errors.js";

export class FlowDeriveServiceError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("FLOW_DERIVE_ERROR", message, cause);
    this.name = "FlowDeriveServiceError";
  }
}

const MAX_TASK = 4_000;
const AUDIT_BUCKET = "flow-derive";
const MAX_ATTEMPTS = 3;

const SHAPE_SCHEMA_HINT =
  `{ "contract": "${FLOW_SHAPE_CONTRACT}", ` +
  '"units": [ { "id": "kebab-id", "title": "what this unit delivers", ' +
  '"dependsOn": ["another-unit-id"], "risk": ["auth"] } ], ' +
  '"validateOnlyWhenComplete": true, "rationale": "why this decomposition" }';

const SHAPE_GUIDANCE = [
  "Decompose a task into the units of work it actually contains, so a flow can be built around it.",
  "",
  "You are NOT designing the workflow. You do not choose steps, ordering machinery, or which reviews run - that is compiled from what you say here. Describe the WORK.",
  "",
  "units: one per separable deliverable. Two units only if one could be built and checked without the other existing.",
  "  BE STINGY. Each unit is a separate model turn on the same worktree, run one after another - they cannot overlap. Splitting one cohesive change into six units multiplies its cost sixfold and improves nothing. Measured: a small CRUD app split into eight units cost 2.6x the implementation spend of the same app built in one turn, and scored slightly WORSE.",
  "  Describing a change in parts is not the same as it having parts. 'A schema, some routes and a page' is usually ONE unit - one person would write it in one sitting, and no piece ships without the others. Prefer one unit unless a reviewer could genuinely accept one and reject another.",
  "  Two to three units is a normal ceiling for a feature. More than that needs a real reason, like separately-deployable surfaces or a migration that must land before anything else can.",
  "dependsOn: name a unit only when this one genuinely cannot be built until that one exists (a route needs its schema; a screen needs its endpoint). Do not encode preference or a nice reading order.",
  "risk: why this unit is dangerous to get wrong. Choose ONLY from:",
  "  auth              - who may do it, ownership, privilege",
  "  untrusted-input   - caller-supplied data reaching a sink, encoding, injection",
  "  secrets           - credentials, tokens, PII, over-broad responses",
  "  data-integrity    - invariants, lost updates, corruption",
  "  concurrency       - races, ordering, partial writes",
  "  money             - amounts, rounding, billing",
  "  migration         - schema or data moves that are hard to reverse",
  "  public-api        - a contract other people depend on",
  "  ui                - the rendered surface a person operates",
  "  performance       - work that grows with input",
  "An empty risk list is fine and common. Tag what is TRUE, not what sounds thorough: every tag you add buys a real review turn and real time.",
  "validateOnlyWhenComplete: true when the work can only be exercised end to end once every unit exists.",
].join("\n");

export type DerivedFlowDraft = {
  flow: FlowDefinition;
  /** Canonical YAML - byte-for-byte what adopting this would write. */
  yaml: string;
  /** The decomposition the model returned, for the confirmation screen. */
  shape: FlowShapeOutput;
  /** Decisions the COMPILER made, in plain language. */
  notes: string[];
  lenses: { lens: string; because: string[] }[];
  coverage: FlowCoverage;
  /** Project-relative path adopting it would write. */
  targetPath: string;
  exists: boolean;
};

/**
 * Shape a task, compile it, and return the draft. Never writes.
 */
export async function deriveFlowFromTask(input: {
  projectRoot: string;
  task: string;
  flowId: string;
  crewId?: string | null;
  /** Refuse a decomposition with more units than this. Each unit is a model
   *  turn, so unit count is the run's cost multiplier. */
  maxUnits?: number;
  runner?: AssistProviderRunner;
}): Promise<DerivedFlowDraft> {
  const task = input.task.trim();
  if (!task) throw new FlowDeriveServiceError("A task is required.");
  if (task.length > MAX_TASK) {
    throw new FlowDeriveServiceError(`Task exceeds ${MAX_TASK} characters.`);
  }
  if (!/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(input.flowId)) {
    throw new FlowDeriveServiceError(
      `"${input.flowId}" is not a valid flow id (lowercase, digits and hyphens).`,
    );
  }
  const loaded = await loadConfig(input.projectRoot);
  const { crewId, crew } = getCrew(loaded.config, input.crewId);

  const res = await runAssist({
    projectRoot: input.projectRoot,
    loaded,
    label: "flow-derive",
    instruction:
      SHAPE_GUIDANCE +
      "\n\nThe task:\n" +
      // Raw on purpose: runAssist redacts the assembled prompt.
      `"""${task}"""\n\n` +
      "Return the decomposition.",
    schema: flowShapeOutputSchema,
    schemaHint: SHAPE_SCHEMA_HINT,
    auditBucket: AUDIT_BUCKET,
    maxAttempts: MAX_ATTEMPTS,
    crewId,
    runner: input.runner,
  });

  let compiled;
  try {
    compiled = compileFlowFromShape(res.parsed, {
      id: input.flowId,
      label: `Derived: ${input.flowId}`,
      maxUnits: input.maxUnits,
    });
  } catch (err) {
    if (err instanceof FlowDeriveError) {
      // Refuse, never repair. A decomposition that is not a graph is bad input,
      // and quietly dropping an edge to make it compile would hide the problem
      // in a flow someone then runs.
      throw new FlowDeriveServiceError(
        `The decomposition cannot be compiled into a flow: ${err.message}`,
        err,
      );
    }
    throw err;
  }

  const catalog = await discoverFlowCatalog(input.projectRoot);
  const exists = catalog.flows.some(
    (f) => f.id === compiled.flow.id && f.source.kind === "project",
  );

  return {
    flow: compiled.flow,
    yaml: YAML.stringify(compiled.flow, { lineWidth: 80 }),
    shape: res.parsed,
    notes: compiled.notes,
    lenses: compiled.lenses.map((l) => ({ lens: l.lens, because: [...l.because] })),
    coverage: computeFlowSeatCoverage({ flow: compiled.flow, crew, crewId }),
    targetPath: path.posix.join(".vibestrate", "flows", compiled.flow.id, "flow.yml"),
    exists,
  };
}
