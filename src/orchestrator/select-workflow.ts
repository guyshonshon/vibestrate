// ── Workflow selection ──────────────────────────────────────────────────────
//
// The responsible orchestrator picks the Flow for a task instead of silently
// falling back to a default. The chosen flow is ALWAYS resolved and ALWAYS shown
// (the CLI prints `Flow: <name> · <source>`), never hidden.
//
// Precedence is deterministic and mostly free:
//   forced (--flow) > project default (config.defaultFlow) > orchestrator
//   selection (only when there's a real choice) > the single available flow.
// Only the "selection" branch spends an LLM turn, and only when >= 2 flows are
// available - so simple projects pay nothing. The selection turn is read-only
// (the assist primitive: broker-gated, structured, no writes; bucket
// runs/selection/). It states a confidence + reasons + risks, never faking
// authority. See docs/design/responsible-orchestrator.md.

import { z } from "zod";
import { classifyEffort } from "../core/effort-heuristic.js";
import { runAssist, type AssistProviderRunner } from "../assist/assist-runner.js";
import {
  classifyObviousTrivial,
  classifyPlanWorthy,
  SIZER_TARGET_FLOW,
  SHAPE_TARGET_FLOW,
} from "./flow-sizing.js";
import { discoverFlows } from "../flows/catalog/flow-discovery.js";
import {
  classifyTaskRisk,
  resolvePersona,
  type ResolvedPersona,
} from "./personas.js";
import type { LoadedConfig } from "../project/config-loader.js";
import type { ProjectConfig } from "../project/config-schema.js";
import type { FlowCapabilities, FlowComplexity } from "../flows/schemas/flow-schema.js";

export type WorkflowSelectionSource =
  | "forced"
  | "default"
  | "selected"
  | "only-flow"
  | "sized"
  | "shaped"
  | "supervisor-upgraded";
export type WorkflowPosture = "normal" | "sandbox-suggested" | "approval-suggested";

/** Record of a persona's upgrade-only flow bias (orchestrator-personas.md). */
export type PersonaUpgrade = {
  from: string;
  to: string;
  /** The matched risk signals that triggered the upgrade (deterministic). */
  signals: string[];
};

export type WorkflowSelection = {
  flowId: string;
  /** Recommended crew, when the orchestrator chose one (else null = config/default). */
  crewId: string | null;
  source: WorkflowSelectionSource;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  risks: string[];
  posture: WorkflowPosture;
  /** A short, human-facing note (e.g. why a heavier flow, or a posture nudge). */
  advisory: string | null;
  /** The active supervisor persona id (always set by chooseRunFlow). */
  personaId?: string | null;
  /** Set when the persona upgraded the flow for a risk-tagged task. */
  personaUpgrade?: PersonaUpgrade | null;
};

export type AvailableFlow = {
  id: string;
  label: string;
  description?: string;
  complexity?: FlowComplexity | null;
  capabilities?: FlowCapabilities | null;
};

export type SelectWorkflowRequest = {
  projectRoot: string;
  task: string;
  files?: string[];
  /** Set when the user passed --flow / a flow in the request: forces that id. */
  forcedFlowId?: string | null;
  /** config.defaultFlow, when set: applied unless `forceSelect`. */
  defaultFlowId?: string | null;
  /** --select: run selection even when a default flow is configured. */
  forceSelect?: boolean;
  /** Every flow the run could use (built-in + project). */
  availableFlows: AvailableFlow[];
  /** The crews the run could use; the orchestrator may pick one when >1 exists. */
  availableCrews?: { id: string; label: string }[];
  loaded?: LoadedConfig | null;
  signal?: AbortSignal;
  /** Test seam, forwarded to the assist primitive. */
  runner?: AssistProviderRunner;
};

const selectionAnswerSchema = z
  .object({
    flowId: z.string().min(1),
    crewId: z.string().min(1).nullable().default(null),
    confidence: z.enum(["low", "medium", "high"]),
    reasons: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
    posture: z.enum(["normal", "sandbox-suggested", "approval-suggested"]).default("normal"),
  })
  .strict();

const SELECTION_SCHEMA_HINT = `{
  "flowId": "string - the id of the chosen flow (MUST be one of the available ids)",
  "crewId": "string|null - a crew id to recommend (MUST be available), or null to keep the default",
  "confidence": "low | medium | high",
  "reasons": ["string - why this flow, grounded in the task + flow capabilities"],
  "risks": ["string - risks you noticed (e.g. security-sensitive paths)"],
  "posture": "normal | sandbox-suggested | approval-suggested"
}`;

function only(flows: AvailableFlow[]): string {
  return flows[0]?.id ?? "default";
}

function describeFlow(f: AvailableFlow): string {
  const caps = f.capabilities;
  const bits = [
    f.complexity ? `complexity ${f.complexity}` : null,
    caps?.costClass ? `cost ${caps.costClass}` : null,
    caps?.strengths?.length ? `strengths ${caps.strengths.join("/")}` : null,
    caps?.taskKinds?.length ? `for ${caps.taskKinds.join("/")}` : null,
  ].filter(Boolean);
  return `- ${f.id} ("${f.label}")${bits.length ? ` - ${bits.join(", ")}` : ""}${f.description ? `: ${f.description}` : ""}`;
}

function buildInstruction(
  task: string,
  flows: AvailableFlow[],
  crews: { id: string; label: string }[],
): string {
  const effort = classifyEffort({ text: task });
  const lines = [
    "You are Vibestrate's workflow selector. Choose the best Flow to run this task.",
    "Prefer the **lowest-cost** flow that adequately covers the task - do not over-spend. Choose a heavier flow (higher cost) only when the task is security-sensitive, broadly architectural, risky/irreversible, or the requirement is ambiguous.",
    `Task effort heuristic: ${effort.effort} (confidence ${effort.confidence}). ${effort.reasons.join("; ")}`,
    "",
    "Available flows:",
    flows.map(describeFlow).join("\n"),
  ];
  if (crews.length > 1) {
    lines.push(
      "",
      "Available crews (set `crewId` only if one clearly fits better; else null):",
      crews.map((c) => `- ${c.id} ("${c.label}")`).join("\n"),
    );
  }
  lines.push(
    "",
    "# Task",
    task.trim(),
    "",
    "Pick exactly one `flowId` from the available ids. Give concise, evidence-based reasons; list any risks; suggest a posture (sandbox/approval) only when the task truly warrants it.",
  );
  return lines.join("\n");
}

/**
 * Decide which Flow a run should use, transparently. Returns the chosen flow id
 * plus where the choice came from and why. Only the `selected` branch spends an
 * LLM turn (and only with >= 2 available flows).
 */
export async function selectWorkflow(req: SelectWorkflowRequest): Promise<WorkflowSelection> {
  const ids = new Set(req.availableFlows.map((f) => f.id));

  const crews = req.availableCrews ?? [];
  const crewIds = new Set(crews.map((c) => c.id));

  // 1. Forced by the user.
  if (req.forcedFlowId) {
    return {
      flowId: req.forcedFlowId,
      crewId: null,
      source: "forced",
      confidence: "high",
      reasons: ["Flow chosen explicitly with --flow."],
      risks: [],
      posture: "normal",
      advisory: null,
    };
  }

  // 2. Project/session default - applied unless the user asked to select.
  if (req.defaultFlowId && !req.forceSelect) {
    return {
      flowId: req.defaultFlowId,
      crewId: null,
      source: "default",
      confidence: "high",
      reasons: ["Project default flow (config.defaultFlow)."],
      risks: [],
      posture: "normal",
      advisory: null,
    };
  }

  // 3. No real choice - one (or zero) flow available. Free.
  if (req.availableFlows.length <= 1) {
    return {
      flowId: only(req.availableFlows),
      crewId: null,
      source: "only-flow",
      confidence: "high",
      reasons: ["Only one flow is available."],
      risks: [],
      posture: "normal",
      advisory: null,
    };
  }

  // 4. A real choice - ask the orchestrator (read-only, structured).
  const result = await runAssist({
    projectRoot: req.projectRoot,
    label: "select-workflow",
    auditBucket: "selection",
    instruction: buildInstruction(req.task, req.availableFlows, crews),
    schema: selectionAnswerSchema,
    schemaHint: SELECTION_SCHEMA_HINT,
    loaded: req.loaded ?? undefined,
    signal: req.signal,
    runner: req.runner,
  });

  const picked = result.parsed;
  const risks = [...picked.risks];
  let flowId = picked.flowId;
  // Guard against a hallucinated id: fall back to the default / first flow.
  if (!ids.has(flowId)) {
    risks.push(`Selector returned an unknown flow "${picked.flowId}"; fell back to a known flow.`);
    flowId = req.defaultFlowId && ids.has(req.defaultFlowId) ? req.defaultFlowId : only(req.availableFlows);
  }
  // Only accept a crew the project actually has; otherwise keep the default.
  const crewId = picked.crewId && crewIds.has(picked.crewId) ? picked.crewId : null;

  const advisory =
    picked.posture === "sandbox-suggested"
      ? "Sandbox mode suggested for this task."
      : picked.posture === "approval-suggested"
        ? "An approval gate is suggested for this task."
        : null;

  return {
    flowId,
    crewId,
    source: "selected",
    confidence: picked.confidence,
    reasons: picked.reasons,
    risks,
    posture: picked.posture,
    advisory,
  };
}

export type ChooseRunFlowInput = {
  projectRoot: string;
  task: string;
  config: ProjectConfig;
  /** --flow / request flow id: forces that flow (one-off). */
  forcedFlowId?: string | null;
  /** --select: select even when a default flow is configured. */
  forceSelect?: boolean;
  /** --no-select: skip selection; use the default (or built-in default) flow. */
  noSelect?: boolean;
  files?: string[];
  loaded?: LoadedConfig | null;
  signal?: AbortSignal;
  runner?: AssistProviderRunner;
  /** --supervisor / request persona id: the active supervisor persona override. */
  personaOverride?: string | null;
};

/** Rank a flow's weight class so the persona bias can stay genuinely
 *  upgrade-only. Unknown/undeclared complexity is treated as "medium". */
const COMPLEXITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };
const flowWeight = (complexity: FlowComplexity | null | undefined): number =>
  COMPLEXITY_RANK[complexity ?? "medium"] ?? 1;

/**
 * The persona's one behavioral lever this slice (orchestrator-personas.md): for a
 * NON-forced selection, if the task matches the persona's risk signals, UPGRADE
 * the flow to a preferred review flow. Strictly UPGRADE-ONLY: the target must not
 * be a LIGHTER weight class than the chosen flow (else a project persona could
 * downgrade a heavy default while mislabeling it "upgraded"). Never overrides an
 * explicit --flow; always logged.
 */
async function maybeUpgradeForPersona(input: {
  base: WorkflowSelection;
  persona: ResolvedPersona;
  task: string;
  projectRoot: string;
}): Promise<WorkflowSelection> {
  const { base, persona } = input;
  const signals = persona.config.riskSignals ?? [];
  const targets = persona.config.prefersFlows ?? [];
  if (base.source === "forced" || signals.length === 0 || targets.length === 0) {
    return base;
  }
  if (targets.includes(base.flowId)) return base; // already on a preferred flow
  const matched = classifyTaskRisk(input.task, signals);
  if (matched.length === 0) return base;
  const discovered = await discoverFlows(input.projectRoot).catch(() => []);
  const byId = new Map(discovered.map((f) => [f.id, f]));
  const baseWeight = flowWeight(byId.get(base.flowId)?.definition.complexity ?? null);
  // First available preferred flow that is NOT lighter than the current one.
  const target = targets.find((t) => {
    const f = byId.get(t);
    return f !== undefined && t !== base.flowId && flowWeight(f.definition.complexity) >= baseWeight;
  });
  if (!target) return base;
  return {
    ...base,
    flowId: target,
    source: "supervisor-upgraded",
    reasons: [
      ...base.reasons,
      `Supervisor "${persona.config.label}" upgraded ${base.flowId} -> ${target} for a risk-tagged task (signal: ${matched.join(", ")}).`,
    ],
    risks: [...base.risks, `Task matched risk signal(s): ${matched.join(", ")}.`],
    personaUpgrade: { from: base.flowId, to: target, signals: matched },
  };
}

/**
 * The single entry point both run launchers (CLI + API) use to choose a Flow,
 * so behavior is identical. The chosen flow is ALWAYS resolved and ALWAYS shown.
 *
 * Precedence: forced (--flow) > orchestrator selection (only on opt-in --select)
 * > project default (config.defaultFlow) > the built-in default. The LLM is
 * spent ONLY in the explicit --select branch - a plain run applies the default
 * flow exactly as before (just now shown), so it costs nothing extra.
 */
export async function chooseRunFlow(input: ChooseRunFlowInput): Promise<WorkflowSelection> {
  const defaultFlowId = input.config.defaultFlow ?? null;
  const persona = resolvePersona(input.config, input.personaOverride);
  const tag = (s: WorkflowSelection): WorkflowSelection => ({
    ...s,
    personaId: persona.id,
    personaUpgrade: s.personaUpgrade ?? null,
  });
  const upgrade = (base: WorkflowSelection): Promise<WorkflowSelection> =>
    maybeUpgradeForPersona({
      base,
      persona,
      task: input.task,
      projectRoot: input.projectRoot,
    });

  // 1. Forced by --flow (or the interactive picker). The persona never overrides
  //    an explicit user choice - it is only tagged for the record.
  if (input.forcedFlowId) {
    return tag({
      flowId: input.forcedFlowId,
      crewId: null,
      source: "forced",
      confidence: "high",
      reasons: ["Flow chosen explicitly with --flow."],
      risks: [],
      posture: "normal",
      advisory: null,
    });
  }

  // 2. Orchestrator selection - opt-in only (--select), and never with --no-select.
  if (input.forceSelect && !input.noSelect) {
    const discovered = await discoverFlows(input.projectRoot).catch(() => []);
    // Exclude no-write flows (e.g. plan-only) from AUTO selection: they produce
    // no diff, so a cost-minimizing selector could otherwise route an
    // implement-style task to one and silently write nothing. They stay
    // explicitly selectable - a forced pick bypasses this branch entirely.
    const availableFlows: AvailableFlow[] = discovered
      .filter((f) =>
        f.definition.steps.some((s) => (s.outputs ?? []).includes("diff")),
      )
      .map((f) => ({
        id: f.id,
        label: f.label,
        description: f.description,
        complexity: f.definition.complexity ?? null,
        capabilities: f.definition.capabilities ?? null,
      }));
    const availableCrews = Object.entries(input.config.crews ?? {}).map(([id, c]) => ({
      id,
      label: (c as { label?: string }).label ?? id,
    }));
    const selected = await selectWorkflow({
      projectRoot: input.projectRoot,
      task: input.task,
      files: input.files,
      defaultFlowId,
      forceSelect: true,
      availableFlows,
      availableCrews,
      loaded: input.loaded,
      signal: input.signal,
      runner: input.runner,
    });
    // No persona upgrade here: --select means the LLM already made a risk-aware
    // choice (buildInstruction tells it to go heavier for risky tasks), and the
    // persona's "move to prefersFlows[0]" isn't guaranteed heavier, so applying
    // it over an LLM pick could downgrade it. The deterministic upgrade is the
    // safety net for the NON-LLM default path below.
    return tag(selected);
  }

  // 3a-shape. Adaptive depth: a plan-worthy greenfield/system brief is routed
  //     into the read-only `shape-intake` flow (which asks the gap questions)
  //     BEFORE any execution. Same guard as the sizer (no --flow, no --select,
  //     no --no-select, no config.defaultFlow) so an explicit choice always wins.
  //     It BIASES TO EXECUTE - classifyPlanWorthy fires only on a clear
  //     build-a-system reading, never when a concrete code file is named. The
  //     resulting run is read-only (shape-intake emits no diff -> launcher clamp).
  //     `--flow shape-intake` force-shapes; `adaptiveShape: "off"` disables it.
  if (
    defaultFlowId === null &&
    !input.noSelect &&
    (input.config.adaptiveShape ?? "auto") !== "off" &&
    classifyPlanWorthy(input.task).planWorthy
  ) {
    const pw = classifyPlanWorthy(input.task);
    return tag({
      flowId: SHAPE_TARGET_FLOW,
      crewId: null,
      source: "shaped",
      confidence: "medium",
      reasons: [
        "Plan-worthy brief - shaping it (scope, spec, architecture, risks) before any code.",
        ...pw.reasons,
      ],
      risks: [],
      posture: "normal",
      advisory: null,
    });
  }

  // 3a. A1 flow sizing (flow-sizing.ts) - ONLY when nothing explicit applies:
  //     no --flow, no --select, and no config.defaultFlow (an explicit user
  //     choice always wins). The sizer may pick FRONT leanness only - its sole
  //     target is the diff-floored `express` flow, whose back gates are decided
  //     by the actual diff at run time, never by this task-text read. The
  //     persona upgrade below still runs and beats a downsize.
  if (defaultFlowId === null && (input.config.flowSizing ?? "deterministic") !== "off") {
    const sized = await maybeSizeToExpress(input);
    if (sized) return tag(await upgrade(sized));
  }

  // 3b. The default/session flow (or the built-in default) - applied + shown,
  //     no LLM. The persona may still UPGRADE this for a risk-tagged task (the
  //     teeth that fires on the default path).
  const base: WorkflowSelection = {
    flowId: defaultFlowId ?? "default",
    crewId: null,
    source: "default",
    confidence: "high",
    reasons: [defaultFlowId ? "Project default flow (config.defaultFlow)." : "Built-in default flow."],
    risks: [],
    posture: "normal",
    advisory: null,
  };
  return tag(await upgrade(base));
}

const sizingAnswerSchema = z
  .object({
    size: z.enum(["trivial", "standard"]),
    reasons: z.array(z.string()).default([]),
  })
  .strict();

const SIZING_SCHEMA_HINT = `{
  "size": "trivial | standard - trivial ONLY for a small, low-risk change (docs/text tweaks, one tiny file); anything touching code, config, CI, auth, or that you are unsure about is standard",
  "reasons": ["string - what made it trivial/standard"]
}`;

/** A1: decide whether this run sizes down to `express`. Deterministic tier
 *  first (free); gray-zone assist tier only on `flowSizing: "assisted"`. Any
 *  failure/uncertainty -> null (the caller falls through to the default flow -
 *  fail toward more checking). */
async function maybeSizeToExpress(
  input: ChooseRunFlowInput,
): Promise<WorkflowSelection | null> {
  // The target must actually exist (it's a builtin, but a project can shadow
  // ids - resolve from discovery so we never route to a missing flow).
  const discovered = await discoverFlows(input.projectRoot).catch(() => []);
  if (!discovered.some((f) => f.id === SIZER_TARGET_FLOW)) return null;

  const sizedSelection = (
    tier: "deterministic" | "assisted",
    reasons: string[],
  ): WorkflowSelection => ({
    flowId: SIZER_TARGET_FLOW,
    crewId: null,
    source: "sized",
    confidence: tier === "deterministic" ? "high" : "medium",
    reasons: [
      `Sized to "${SIZER_TARGET_FLOW}" (${tier} tier): ${reasons.join("; ")}.`,
      "Back gates stay diff-decided: a non-prose or protected change still gets a real review turn.",
    ],
    risks: [],
    posture: "normal",
    advisory:
      "Trivial-task sizing - set flowSizing: off (or a defaultFlow) to disable.",
  });

  const det = classifyObviousTrivial(input.task);
  if (det.trivial) return sizedSelection("deterministic", det.reasons);

  if ((input.config.flowSizing ?? "deterministic") !== "assisted") return null;
  try {
    const result = await runAssist({
      projectRoot: input.projectRoot,
      label: "size-flow",
      auditBucket: "selection",
      instruction: [
        "Size this task. Reply ONLY with the JSON.",
        "",
        `Task: ${input.task}`,
        "",
        "trivial = a small, low-risk change (docs/text tweaks, one tiny file).",
        "standard = anything touching code, config, CI, auth/security, or that you're unsure about.",
      ].join("\n"),
      schema: sizingAnswerSchema,
      schemaHint: SIZING_SCHEMA_HINT,
      loaded: input.loaded ?? undefined,
      signal: input.signal,
      runner: input.runner,
    });
    if (result.parsed.size === "trivial") {
      return sizedSelection(
        "assisted",
        result.parsed.reasons.length ? result.parsed.reasons : ["assist call sized it trivial"],
      );
    }
    return null;
  } catch {
    return null; // assist failure -> default flow (more checking)
  }
}
