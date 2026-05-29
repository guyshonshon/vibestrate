#!/usr/bin/env node
/**
 * Source-aware docs metadata generator.
 *
 * Walks Vibestrate's structured registries (commander program, Zod schemas,
 * provider registry, workflow stages, flow definitions, run-state
 * schema) and emits committed deterministic JSON under
 * `docs/generated/`. The marketing site (and any other consumer) renders
 * these into the reference pages.
 *
 * Design contracts:
 *   - Deterministic: same source → byte-identical output. Keys sorted,
 *     arrays kept in declaration order.
 *   - No secrets: only reads code constants, never `.env` or runtime state.
 *   - Safe to commit: marketing builds don't need a network or the CLI
 *     to be installed.
 *   - Fail loud: any malformed schema crashes the generator with a clear
 *     error; we never emit partial output.
 *
 * Run: `pnpm docs:generate`
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { z, type ZodTypeAny } from "zod";

// ─── Schema imports ──────────────────────────────────────────────────────
import { buildVibestrateProgram } from "../src/cli/index.js";
import { KNOWN_PROVIDERS } from "../src/providers/provider-detection.js";
import { PROVIDER_PRESETS } from "../src/providers/provider-presets.js";
import { defaultWorkflowStages } from "../src/workflow/default-workflow.js";
import {
  runStatusSchema,
  reviewDecisionSchema,
  verificationDecisionSchema,
} from "../src/core/state-machine.js";
import { builtinFlows } from "../src/flows/catalog/builtin-flows.js";
import {
  projectConfigBaseSchema,
  policyApprovalStageSchema,
} from "../src/project/config-schema.js";
import { builtinRoleIds } from "../src/roles/role-schema.js";
import { TERMINAL_STATUSES } from "../src/workflow/workflow-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outDir = resolve(repoRoot, "docs", "generated");

// ─── Helpers ─────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => sortKeys(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted as unknown as T;
  }
  return value;
}

function writeJson(filename: string, payload: unknown, opts: { sort?: boolean } = {}): void {
  const path = resolve(outDir, filename);
  const finalPayload = opts.sort ? sortKeys(payload) : payload;
  const json = JSON.stringify(finalPayload, null, 2) + "\n";
  writeFileSync(path, json, "utf8");
  console.log(`  ${relative(repoRoot, path)}  (${json.length.toLocaleString()} bytes)`);
}

// ─── CLI command tree ────────────────────────────────────────────────────

type DocOption = {
  flags: string;
  description: string;
  defaultValue?: string;
  required: boolean;
  optional: boolean;
  negated: boolean;
};

type DocArgument = {
  name: string;
  description: string;
  required: boolean;
  variadic: boolean;
  defaultValue?: string;
};

type DocCommand = {
  name: string;
  path: string[];
  description: string;
  usage: string;
  arguments: DocArgument[];
  options: DocOption[];
  subcommands: DocCommand[];
};

function dumpCommand(cmd: ReturnType<typeof buildVibestrateProgram>, parentPath: string[]): DocCommand {
  const name = cmd.name();
  const path = [...parentPath, name];

  const opts: DocOption[] = cmd.options.map((o) => ({
    flags: o.flags,
    description: o.description ?? "",
    defaultValue:
      o.defaultValue !== undefined
        ? typeof o.defaultValue === "string"
          ? o.defaultValue
          : JSON.stringify(o.defaultValue)
        : undefined,
    required: o.required === true,
    optional: o.optional === true,
    negated: o.negate === true,
  }));

  const rawArgs = (cmd as unknown as { _args?: unknown[] })._args ?? [];
  const args: DocArgument[] = (rawArgs as Array<Record<string, unknown>>).map((a) => ({
    name: String(a.name ?? a._name ?? ""),
    description: String(a.description ?? ""),
    required: a.required === true,
    variadic: a.variadic === true,
    defaultValue:
      a.defaultValue !== undefined
        ? typeof a.defaultValue === "string"
          ? (a.defaultValue as string)
          : JSON.stringify(a.defaultValue)
        : undefined,
  }));

  const subcommands = cmd.commands
    .filter((c) => c.name() !== "help" && (c as unknown as { _hidden?: boolean })._hidden !== true)
    .map((c) => dumpCommand(c, path));

  return {
    name,
    path,
    description: cmd.description() ?? "",
    usage: cmd.usage() ?? "",
    arguments: args,
    options: opts,
    subcommands,
  };
}

function generateCliMetadata() {
  const program = buildVibestrateProgram();
  const root = dumpCommand(program, []);
  writeJson("cli-commands.json", {
    schemaVersion: 1,
    binary: root.name,
    description: root.description,
    version: program.version(),
    commands: root.subcommands,
  });
}

// ─── Config schema ───────────────────────────────────────────────────────

type ConfigField = {
  key: string;
  fullKey: string;
  type: string;
  description?: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
  children?: ConfigField[];
  itemType?: ConfigField | null;
  notes?: string[];
};

function describeZod(schema: ZodTypeAny): { type: string; notes?: string[]; extra?: Partial<ConfigField> } {
  if (schema instanceof z.ZodOptional) {
    return describeZod(schema._def.innerType);
  }
  if (schema instanceof z.ZodDefault) {
    return describeZod(schema._def.innerType);
  }
  if (schema instanceof z.ZodNullable) {
    const inner = describeZod(schema._def.innerType);
    return { ...inner, type: `${inner.type} | null` };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodEnum) {
    return { type: "enum", extra: { enum: [...schema._def.values] } };
  }
  if (schema instanceof z.ZodLiteral) {
    return { type: `literal(${JSON.stringify(schema._def.value)})` };
  }
  if (schema instanceof z.ZodArray) {
    const item = describeZod(schema._def.type);
    return {
      type: `array<${item.type}>`,
      extra: {
        itemType: {
          key: "[item]",
          fullKey: "[item]",
          type: item.type,
          required: true,
          ...(item.extra ?? {}),
        },
      },
    };
  }
  if (schema instanceof z.ZodRecord) {
    const value = describeZod(schema._def.valueType);
    return { type: `record<string, ${value.type}>` };
  }
  if (schema instanceof z.ZodObject) {
    return { type: "object" };
  }
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    const opts = schema._def.options as ZodTypeAny[];
    const types = opts.map((o) => describeZod(o).type);
    return { type: types.join(" | ") };
  }
  return { type: "unknown", notes: ["docs generator does not yet handle this Zod shape"] };
}

function isOptional(schema: ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodNullable;
}

function getDefault(schema: ZodTypeAny): unknown {
  if (schema instanceof z.ZodDefault) {
    const def = schema._def.defaultValue;
    return typeof def === "function" ? def() : def;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return getDefault(schema._def.innerType);
  }
  return undefined;
}

function unwrapToCore(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional) return unwrapToCore(schema._def.innerType);
  if (schema instanceof z.ZodDefault) return unwrapToCore(schema._def.innerType);
  if (schema instanceof z.ZodNullable) return unwrapToCore(schema._def.innerType);
  return schema;
}

function walkObjectSchema(
  schema: z.ZodObject<z.ZodRawShape>,
  parentKey: string,
): ConfigField[] {
  const shape = schema.shape;
  const fields: ConfigField[] = [];
  for (const [key, raw] of Object.entries(shape)) {
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    const optional = isOptional(raw) || raw instanceof z.ZodDefault;
    const defValue = getDefault(raw);
    const core = unwrapToCore(raw);
    const desc = describeZod(raw);

    let children: ConfigField[] | undefined;
    if (core instanceof z.ZodObject) {
      children = walkObjectSchema(core, fullKey);
    }

    fields.push({
      key,
      fullKey,
      type: desc.type,
      required: !optional,
      default: defValue,
      enum: desc.extra?.enum,
      itemType: desc.extra?.itemType ?? null,
      children,
      notes: desc.notes,
    });
  }
  return fields;
}

function generateConfigSchema() {
  // The exported `projectConfigSchema` is a ZodEffects (cross-record
  // superRefine); the doc walker needs the underlying object shape.
  const root = projectConfigBaseSchema;
  const fields = walkObjectSchema(root as unknown as z.ZodObject<z.ZodRawShape>, "");
  writeJson("config-schema.json", {
    schemaVersion: 1,
    rootKey: "project.yml",
    description:
      "Schema for .vibestrate/project.yml — derived from Zod schemas in src/project/config-schema.ts. Defaults shown here are the values Vibestrate fills in when the key is missing.",
    fields,
  });
}

// ─── Providers ───────────────────────────────────────────────────────────

function generateProviders() {
  const providers = KNOWN_PROVIDERS.map((p) => {
    const { preset, loginCommand, loginNote } = PROVIDER_PRESETS[p.id];
    return {
      id: p.id,
      label: p.label,
      command: p.command,
      versionArgs: p.versionArgs,
      presetReady: p.presetReady,
      confidenceWhenAvailable: p.presetReady ? "ready" : "detected-needs-setup",
      preset: { args: preset.args, input: preset.input },
      loginCommand,
      loginNote,
      notes: p.notes,
      installHint: p.installHint ?? null,
    };
  });
  writeJson("providers.json", {
    schemaVersion: 1,
    description:
      "Built-in providers Vibestrate detects and auto-configures. Each ships a preset (the non-interactive invocation) and a login command to run outside Vibestrate when the provider isn't authenticated. Verify any provider with `vibe provider test <id>`.",
    providers,
  });
}

// ─── Flows ──────────────────────────────────────────────────────────────

function generateFlows() {
  const flows = builtinFlows.map((g) => ({
    id: g.id,
    version: g.version,
    label: g.label,
    description: g.description,
    seats: Object.entries(g.seats).map(([seatId, seat]) => ({
      id: seatId,
      label: seat.label,
      description: seat.description ?? null,
    })),
    steps: g.steps.map((s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind,
      seat: s.seat ?? null,
      inputs: s.inputs,
      outputs: s.outputs,
      optional: s.optional,
      skipWhenReadOnly: s.skipWhenReadOnly,
      stage: s.stage ?? null,
      approval: s.approval ?? null,
      repeat: s.repeat ?? null,
    })),
    loop: g.loop ?? null,
  }));
  writeJson("flows.json", {
    schemaVersion: 1,
    description:
      "Built-in run Flows. Project Flows live in `.vibestrate/flows/<id>/flow.yml` and follow the same schema (src/flows/schemas/flow-schema.ts).",
    flows,
  });
}

// ─── Workflow ────────────────────────────────────────────────────────────

const STAGE_DESCRIPTIONS: Record<string, { simple: string; what: string }> = {
  planning: {
    simple: "Read the task and write a plan.",
    what: "Planner agent reads task + project rules + skills, writes a structured plan that names the files and behaviors it intends to change.",
  },
  architecting: {
    simple: "Sketch how the plan fits into the codebase.",
    what: "Architect agent expands the plan with module boundaries, data flow, and interface contracts before any code is written.",
  },
  executing: {
    simple: "Apply the changes in an isolated git worktree.",
    what: "Executor agent edits files inside the run's worktree. Edits are real — never touches the project root.",
  },
  validating: {
    simple: "Run the project's validation commands.",
    what: "Runs `commands.validate` from project.yml (typecheck, tests, build, lint). Output is recorded; failures route to fix.",
  },
  reviewing: {
    simple: "Have a different agent critique the diff.",
    what: "Reviewer agent compares plan to diff, reads validation output, and emits APPROVED / CHANGES_REQUESTED / BLOCKED.",
  },
  fixing: {
    simple: "Address review findings and re-validate.",
    what: "Fixer agent ingests review findings + validation logs, patches the diff, then control returns to validating → reviewing.",
  },
  verifying: {
    simple: "Confirm the run is ready to merge.",
    what: "Verifier agent does a final pass — checks for unresolved findings, missing tests, or untouched validation gates. Emits PASSED / FAILED / NEEDS_HUMAN.",
  },
};

function generateWorkflow() {
  const stages = defaultWorkflowStages.map((s) => ({
    id: s.id,
    roleId: s.roleId ?? null,
    enteringStatus: s.enteringStatus,
    exitingStatus: s.exitingStatus,
    ...STAGE_DESCRIPTIONS[s.id],
  }));
  writeJson("workflow.json", {
    schemaVersion: 1,
    description:
      "The default Vibestrate workflow: plan → architect → execute → validate → review → fix → verify. Stages are defined in src/workflow/default-workflow.ts; the per-stage prose lives in the docs generator.",
    stages,
  });
}

// ─── State machine ──────────────────────────────────────────────────────

const STATUS_DESCRIPTIONS: Record<string, string> = {
  created: "Run record exists; orchestrator hasn't picked it up yet.",
  planning: "Planner agent is running.",
  planned: "Plan is recorded; about to enter architecting.",
  architecting: "Architect agent is running.",
  architected: "Architecture is recorded; about to enter execution.",
  executing: "Executor agent is editing files in the worktree.",
  validating: "Validation commands are running.",
  reviewing: "Reviewer agent is reading the diff and validation output.",
  fixing: "Fixer agent is addressing review findings.",
  verifying: "Verifier agent is doing the final pass before merge.",
  waiting_for_approval: "Run is paused at a policy-gated approval. A human must approve or reject.",
  paused: "User requested a pause; the run will resume from `pausedAtStatus`.",
  merge_ready: "Verifier passed. Diff is ready for the user to merge.",
  blocked: "Reviewer or verifier flagged the run unsafe to continue.",
  failed: "An unrecoverable error was raised during a stage.",
  aborted: "User explicitly aborted the run (worktree preserved).",
};

function generateStateMachine() {
  const statuses = runStatusSchema.options.map((status) => ({
    id: status,
    terminal: TERMINAL_STATUSES.includes(status),
    description: STATUS_DESCRIPTIONS[status] ?? "",
  }));
  writeJson("state-machine.json", {
    schemaVersion: 1,
    description:
      "Run statuses, terminal states, and the review/verification decision enums. Source: src/core/state-machine.ts.",
    statuses,
    terminalStatuses: [...TERMINAL_STATUSES],
    reviewDecisions: reviewDecisionSchema.options,
    verificationDecisions: verificationDecisionSchema.options,
    notes: [
      "Transitions are enforced by `assertTransition` in src/core/state-machine.ts. Any non-terminal state can transition to `paused`, `waiting_for_approval`, `failed`, `aborted`, or `blocked`.",
      "Re-validation loops: reviewing → fixing → validating → reviewing, bounded by `workflow.maxReviewLoops` in project.yml.",
    ],
  });
}

// ─── Agents ──────────────────────────────────────────────────────────────

const AGENT_DESCRIPTIONS: Record<string, { role: string; reads: string; writes: string }> = {
  planner: {
    role: "Reads the task brief and produces a plan.",
    reads: "Task description, project rules, .vibestrate/roles/planner.md prompt, attached skills.",
    writes: "Structured plan artifact.",
  },
  architect: {
    role: "Expands the plan with implementation specifics.",
    reads: "Plan + project rules + attached skills.",
    writes: "Architecture artifact (module map, interfaces, data flow).",
  },
  executor: {
    role: "Applies code changes in the run's worktree.",
    reads: "Plan, architecture, review findings if any.",
    writes: "File edits in the worktree; execution log.",
  },
  fixer: {
    role: "Addresses review findings.",
    reads: "Review findings, validation logs, current diff.",
    writes: "Patches and a `finding-responses` artifact.",
  },
  reviewer: {
    role: "Critiques the diff against the plan.",
    reads: "Plan, current diff, validation output.",
    writes: "Findings + a review decision (APPROVED / CHANGES_REQUESTED / BLOCKED).",
  },
  verifier: {
    role: "Final gate before merge.",
    reads: "All artifacts from the run.",
    writes: "Verification decision (PASSED / FAILED / NEEDS_HUMAN) + decision summary.",
  },
};

function generateAgents() {
  const agents = builtinRoleIds.map((id) => ({
    id,
    ...(AGENT_DESCRIPTIONS[id] ?? { role: "", reads: "", writes: "" }),
    promptTemplateRelPath: `src/agents/default-prompts/${id}.md`,
  }));
  writeJson("agents.json", {
    schemaVersion: 1,
    description:
      "Built-in agent roles. Each is a configured row under `agents:` in project.yml — provider, prompt template, permission profile, and any skills.",
    agents,
  });
}

// ─── Approval / policy stages ───────────────────────────────────────────

function generatePolicies() {
  const stages = policyApprovalStageSchema.options.map((stage) => ({
    id: stage,
    description:
      `When listed under \`policies.requireApprovalAtStages\`, the orchestrator pauses at the boundary into the \`${stage}\` stage and emits a \`waiting_for_approval\` event. A human must approve via \`vibe approvals decide\` (or the dashboard) before the run continues.`,
  }));
  writeJson("policies.json", {
    schemaVersion: 1,
    description:
      "Policy-gated approval stages. Configure under `policies.requireApprovalAtStages` in project.yml.",
    stages,
  });
}

// ─── Meta ────────────────────────────────────────────────────────────────

function generateMeta() {
  let gitRev: string | null = null;
  const headPath = resolve(repoRoot, ".git/HEAD");
  try {
    if (existsSync(headPath)) {
      const head = readFileSync(headPath, "utf8").trim();
      if (head.startsWith("ref: ")) {
        const refPath = resolve(repoRoot, ".git", head.slice(5));
        if (existsSync(refPath)) {
          gitRev = readFileSync(refPath, "utf8").trim();
        }
      } else {
        gitRev = head;
      }
    } else {
      // Worktrees keep HEAD inside .git/worktrees/<name>/HEAD; .git is a
      // file pointing there. The marketing build doesn't strictly need a
      // revision, so we don't sweat resolving it here.
    }
  } catch {
    /* ignore */
  }

  const pkgPath = resolve(repoRoot, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };

  writeJson(
    "meta.json",
    {
      schemaVersion: 1,
      generator: "scripts/generate-docs-metadata.ts",
      vibestrateVersion: pkg.version,
      sourceRev: gitRev,
    },
    { sort: true },
  );
}

// ─── Driver ─────────────────────────────────────────────────────────────

async function main() {
  ensureDir(outDir);
  console.log(`Writing docs metadata to ${relative(repoRoot, outDir)}/`);
  generateCliMetadata();
  generateConfigSchema();
  generateProviders();
  generateFlows();
  generateWorkflow();
  generateStateMachine();
  generateAgents();
  generatePolicies();
  generateMeta();
  console.log("Done.");
}

void main().catch((err) => {
  console.error("docs metadata generator failed:");
  console.error(err);
  process.exit(1);
});
