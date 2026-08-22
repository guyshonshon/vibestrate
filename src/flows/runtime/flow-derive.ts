// Derive a flow graph from a task decomposition.
//
// A flow is a generic layer, so a fixed recipe is always either too heavy for a
// small change or too light for a risky one. This compiles one from the actual
// work: the shaping turn says what the units are, what depends on what, and
// what each unit is risky about; this file turns that into steps, `needs` edges
// and review lenses.
//
// THE MODEL NEVER AUTHORS A GATE. It supplies semantics (units, dependencies,
// risk tags from a closed set); every step id, every `needs` edge and every
// review lens is computed here. That is the same reason a `block` policy is
// owner-only: a model choosing what checks it will be subjected to is not a
// check. A bad decomposition can therefore produce a wrong-but-valid graph and
// never an ungated one.
//
// Three questions this answers, which a static flow cannot:
//   "c depends on b"                  -> implement-c needs implement-b
//   "test only once a, b, c are made" -> validation needs every unit step
//   "when do we review, and what"     -> risk tags map to lenses, below
import {
  flowDefinitionSchema,
  type FlowDefinition,
} from "../schemas/flow-schema.js";
import type {
  FlowRiskTag,
  FlowShapeOutput,
  FlowShapeUnit,
} from "../schemas/flow-output-contracts.js";
import type { ReviewLens } from "../../supervisor/review-lenses.js";

export class FlowDeriveError extends Error {
  constructor(
    message: string,
    readonly code:
      | "duplicate-unit"
      | "unknown-dependency"
      | "self-dependency"
      | "cycle"
      | "invalid-graph",
  ) {
    super(message);
    this.name = "FlowDeriveError";
  }
}

/**
 * Risk tag -> review lens. Total over the closed tag set, so every tag a shaper
 * may emit provably aims a lens; a tag that mapped to nothing would read as
 * "reviewed" while reviewing nothing.
 */
/** The lenses this compiler can aim. A strict subset of ReviewLens, declared so
 *  the tag->lens map and the instruction map are both provably TOTAL: a tag
 *  that mapped to nothing would read as reviewed while reviewing nothing. */
type DerivedLens = Extract<
  ReviewLens,
  | "correctness"
  | "authz"
  | "injection"
  | "secrets"
  | "tests"
  | "accessibility"
  | "performance"
>;

const RISK_TO_LENS: Record<FlowRiskTag, DerivedLens> = {
  auth: "authz",
  "untrusted-input": "injection",
  secrets: "secrets",
  "data-integrity": "correctness",
  concurrency: "correctness",
  money: "correctness",
  migration: "correctness",
  "public-api": "correctness",
  ui: "accessibility",
  performance: "performance",
};

/** Stable lens order, so the same decomposition always compiles byte-identically. */
const LENS_ORDER: DerivedLens[] = [
  "correctness",
  "authz",
  "injection",
  "secrets",
  "tests",
  "accessibility",
  "performance",
];

const LENS_INSTRUCTION: Record<DerivedLens, string> = {
  correctness:
    "Your lens is CORRECTNESS only. Hunt for logic that is wrong under real inputs: off-by-one and boundary errors, lost updates, races between check and write, money handled in floats, invariants enforced in application code that the database would let through. Cite file:line.",
  authz:
    "Your lens is AUTHENTICATION & AUTHORIZATION only. Hunt for unprotected endpoints, privilege escalation, object-ownership gaps, tenant boundary leaks and open-by-default surfaces. Cite file:line.",
  injection:
    "Your lens is INJECTION & UNSAFE INPUT only. Hunt for SQL/command/path/template injection, unvalidated input reaching a sink, output-encoding gaps and unsafe deserialization. Cite the source->sink path with file:line.",
  secrets:
    "Your lens is SECRETS & DATA EXPOSURE only. Hunt for hardcoded credentials, secrets in logs or errors, PII leakage and over-broad responses. Cite what is exposed and where.",
  tests:
    "Your lens is TEST COVERAGE only. Does a test fail if the change is reverted? Name the untested branch, not the missing file.",
  accessibility:
    "Your lens is ACCESSIBILITY & UI SEMANTICS only. Hunt for unlabelled controls, keyboard traps, contrast failures and state conveyed by colour alone. Cite the element.",
  performance:
    "Your lens is PERFORMANCE only. Hunt for work that grows with input where it need not: N+1 queries, unbounded reads, repeated work in a loop. Cite the call site.",
};

export type DerivedFlow = {
  flow: FlowDefinition;
  /** Human-readable decisions the compiler made, for the confirmation screen. */
  notes: string[];
  /** Lenses chosen, and the tags that earned each one. */
  lenses: { lens: DerivedLens; because: FlowRiskTag[] }[];
};

/** Topological order, or throw with the cycle named. Kahn's algorithm. */
function topoOrder(units: readonly FlowShapeUnit[]): FlowShapeUnit[] {
  const byId = new Map<string, FlowShapeUnit>();
  for (const u of units) {
    if (byId.has(u.id)) {
      throw new FlowDeriveError(`Duplicate unit id "${u.id}".`, "duplicate-unit");
    }
    byId.set(u.id, u);
  }
  for (const u of units) {
    for (const d of u.dependsOn) {
      if (d === u.id) {
        throw new FlowDeriveError(`Unit "${u.id}" depends on itself.`, "self-dependency");
      }
      if (!byId.has(d)) {
        throw new FlowDeriveError(
          `Unit "${u.id}" depends on "${d}", which is not a unit.`,
          "unknown-dependency",
        );
      }
    }
  }
  const indegree = new Map<string, number>();
  for (const u of units) indegree.set(u.id, u.dependsOn.length);
  // Seed in declaration order so the output is deterministic, not set-ordered.
  const queue = units.filter((u) => (indegree.get(u.id) ?? 0) === 0).map((u) => u.id);
  const out: FlowShapeUnit[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    out.push(byId.get(id)!);
    for (const u of units) {
      if (!u.dependsOn.includes(id)) continue;
      const next = (indegree.get(u.id) ?? 0) - 1;
      indegree.set(u.id, next);
      if (next === 0) queue.push(u.id);
    }
  }
  if (out.length !== units.length) {
    const stuck = units.filter((u) => !out.some((o) => o.id === u.id)).map((u) => u.id);
    throw new FlowDeriveError(
      `Dependencies form a cycle among: ${stuck.sort().join(", ")}.`,
      "cycle",
    );
  }
  return out;
}

/** Deterministic: which lenses this decomposition earns, and why. */
export function selectLenses(
  units: readonly FlowShapeUnit[],
): { lens: DerivedLens; because: FlowRiskTag[] }[] {
  const because = new Map<DerivedLens, Set<FlowRiskTag>>();
  for (const u of units) {
    for (const tag of u.risk) {
      const lens = RISK_TO_LENS[tag];
      const set = because.get(lens) ?? new Set<FlowRiskTag>();
      set.add(tag);
      because.set(lens, set);
    }
  }
  // No declared risk still gets one review turn. "Nothing risky" is a claim
  // about the work, not a licence to ship it unread.
  if (because.size === 0) because.set("correctness", new Set());
  return LENS_ORDER.filter((l) => because.has(l)).map((lens) => ({
    lens,
    because: [...(because.get(lens) ?? [])].sort(),
  }));
}

/**
 * Compile a shape into a runnable flow. Pure and deterministic: the same shape
 * always produces the same graph. Throws FlowDeriveError on a decomposition
 * that cannot be a graph (duplicate id, dangling or self dependency, cycle).
 */
export function compileFlowFromShape(
  shape: FlowShapeOutput,
  opts: { id: string; label?: string; maxUnits?: number },
): DerivedFlow {
  // Deterministic owner guard. Unit count drives cost linearly, and a shaper
  // that over-splits produces a valid graph that is simply expensive - nothing
  // downstream would refuse it. Refuse here rather than silently merging units,
  // which would hide the disagreement inside a flow someone then runs.
  if (opts.maxUnits !== undefined && shape.units.length > opts.maxUnits) {
    throw new FlowDeriveError(
      `Decomposition has ${shape.units.length} units but the limit is ${opts.maxUnits}. Each unit is a separate model turn, so this would cost about ${shape.units.length}x a single-turn flow. Raise --max-units to accept it.`,
      "invalid-graph",
    );
  }
  const ordered = topoOrder(shape.units);
  const lenses = selectLenses(shape.units);
  const notes: string[] = [];

  const unitStepId = (id: string) => `implement-${id}`;
  const steps: Record<string, unknown>[] = [];

  steps.push({
    id: "plan",
    label: "Plan",
    kind: "agent-turn",
    seat: "planner",
    stage: "planning",
    inputs: ["task-brief"],
    outputs: ["plan-handoff"],
    needs: [],
  });
  steps.push({
    id: "architecture",
    label: "Architecture",
    kind: "agent-turn",
    seat: "architect",
    stage: "architecting",
    inputs: ["task-brief", "plan-handoff"],
    outputs: ["architecture-handoff"],
    needs: ["plan"],
  });

  // One implement step per unit, wired to its declared dependencies. This is
  // where "c depends on b" stops being prose.
  //
  // Unit steps are also CHAINED in topological order, even when two units are
  // independent. They share one git worktree and both write `diff`, so running
  // them concurrently races on the tree - the flow schema rejects it outright,
  // and it would be wrong even if it did not. The declared dependency edges are
  // kept alongside the chain edge so the graph still SHOWS what depends on
  // what; the chain only decides execution order among units that do not care.
  let previousUnitStep: string | null = null;
  for (const u of ordered) {
    const declared = u.dependsOn.map(unitStepId);
    const deps = [...new Set([...declared, ...(previousUnitStep ? [previousUnitStep] : [])])];
    previousUnitStep = unitStepId(u.id);
    steps.push({
      id: unitStepId(u.id),
      label: u.title.slice(0, 80),
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      inputs: ["task-brief", "plan-handoff", "architecture-handoff"],
      outputs: ["execution-handoff", "diff"],
      needs: deps.length > 0 ? deps : ["architecture"],
      instructions: `Implement ONLY this unit of the task: ${u.title}. Leave the other units to their own steps; another step is already responsible for each. ${
        deps.length > 0
          ? `It runs after ${u.dependsOn.join(", ")}, whose work is already in the worktree.`
          : "It has no prerequisites."
      }`,
    });
  }
  if (ordered.length > 1) {
    notes.push(
      `Split into ${ordered.length} implement steps so each unit is scoped to its own turn.`,
    );
    // Decomposition is not free and the cost is LINEAR in units: each one is a
    // full model turn on the same worktree, and they cannot be parallelised
    // (they would race on the diff). A shaper that splits a small task into
    // eight units has multiplied the implementation spend by eight for no
    // structural gain, and nothing else in the pipeline will say so.
    if (ordered.length >= 4) {
      notes.push(
        `COST: ${ordered.length} implement turns run one after another, so implementation costs about ${ordered.length}x a single-turn flow. Worth it when the units are genuinely separable; wasteful when they are one change described in parts.`,
      );
    }
    const withDeps = ordered.filter((u) => u.dependsOn.length > 0);
    for (const u of withDeps) {
      notes.push(`${unitStepId(u.id)} waits for ${u.dependsOn.map(unitStepId).join(", ")}.`);
    }
  }

  // Validation gated behind every unit: "testing can only be done once a, b and
  // c are made". When the shaper says otherwise, it still lands after the last
  // unit in topological order, because a partial tree cannot be validated.
  const allUnitSteps = ordered.map((u) => unitStepId(u.id));
  steps.push({
    id: "validation",
    label: "Validate",
    kind: "validation",
    inputs: ["diff"],
    outputs: ["validation"],
    needs: allUnitSteps,
  });
  if (shape.validateOnlyWhenComplete && allUnitSteps.length > 1) {
    notes.push(`Validation waits for all ${allUnitSteps.length} units before it runs.`);
  }

  const lensStepIds: string[] = [];
  for (const { lens, because } of lenses) {
    const id = `review-${lens}`;
    lensStepIds.push(id);
    steps.push({
      id,
      label: `Review: ${lens}`,
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      inputs: ["task-brief", "execution-handoff", "validation"],
      outputs: [`findings-${lens}`],
      needs: ["validation"],
      continueOnError: true,
      instructions: LENS_INSTRUCTION[lens],
    });
    notes.push(
      because.length > 0
        ? `Review lens "${lens}" because a unit is tagged ${because.join(", ")}.`
        : `Review lens "${lens}" as the floor - no unit declared a risk.`,
    );
  }

  // One reviewer needs no arbiter; several verdicts must be joined into one.
  const decisionStep = lensStepIds.length > 1 ? "arbiter" : lensStepIds[0]!;
  if (lensStepIds.length > 1) {
    steps.push({
      id: "arbiter",
      label: "Arbiter verdict",
      kind: "review-turn",
      seat: "arbiter",
      stage: "reviewing",
      inputs: ["task-brief", "validation", ...lenses.map((l) => `findings-${l.lens}`)],
      outputs: ["review-decision"],
      needs: lensStepIds,
      instructions:
        "Read every lens's findings and render ONE verdict. De-duplicate, weigh severity against the evidence, and do not launder a reviewer's confidence - cite it. Your verdict line must be exactly `DECISION: APPROVED` or `DECISION: CHANGES_REQUESTED` on its own line.",
    });
    notes.push(`${lensStepIds.length} lenses run in parallel and join at an arbiter.`);
  } else {
    // The single lens IS the decision, so it must emit one.
    const only = steps.find((s) => s.id === lensStepIds[0]);
    if (only) {
      only.outputs = ["review-decision"];
      only.instructions = `${only.instructions as string} Your verdict line must be exactly \`DECISION: APPROVED\` or \`DECISION: CHANGES_REQUESTED\` on its own line.`;
      only.continueOnError = false;
    }
  }

  steps.push({
    id: "fix",
    label: "Fix",
    kind: "response-turn",
    seat: "fixer",
    stage: "executing",
    inputs: ["task-brief", "execution-handoff", "review-decision", "validation"],
    outputs: ["finding-responses", "diff"],
    needs: [decisionStep],
  });
  steps.push({
    id: "revalidation",
    label: "Re-validate",
    kind: "validation",
    inputs: ["diff"],
    outputs: ["validation"],
    needs: ["fix"],
  });
  steps.push({
    id: "verify",
    label: "Verify",
    kind: "summary-turn",
    seat: "verifier",
    stage: "verifying",
    inputs: ["task-brief", "execution-handoff", "review-decision", "validation"],
    outputs: ["verification"],
    needs: ["revalidation"],
  });

  const seats: Record<string, { label: string; description: string }> = {
    planner: { label: "Planner", description: "Turns the task into a plan." },
    architect: { label: "Architect", description: "Designs the approach." },
    implementer: { label: "Implementer", description: "Implements one unit of the task." },
    reviewer: { label: "Reviewer", description: "Reviews the diff under one assigned lens." },
    fixer: { label: "Fixer", description: "Addresses the verdict's must-fix list." },
    verifier: { label: "Verifier", description: "Independently verifies the result." },
  };
  if (lensStepIds.length > 1) {
    seats.arbiter = {
      label: "Arbiter",
      description: "Joins every lens's findings into one verdict.",
    };
  }

  const candidate = {
    id: opts.id,
    version: 1,
    label: opts.label ?? "Derived flow",
    description: `Derived from the task: ${shape.rationale}`.slice(0, 600),
    seats,
    steps,
    complexity: steps.length > 8 ? "high" : "medium",
  };

  const parsed = flowDefinitionSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new FlowDeriveError(
      `Derived graph is not a valid flow: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      "invalid-graph",
    );
  }
  return { flow: parsed.data, notes, lenses };
}
