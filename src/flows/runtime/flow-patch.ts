// Pure validator + writer for project-local Flow edits triggered by
// the dashboard Flow Builder. Builtin / fixture flows are *immutable*
// from the API surface — editing them would silently fork the recipe
// out of project source control, which is exactly the trap the
// builtin/project distinction exists to avoid.

import path from "node:path";
import fs from "node:fs/promises";
import YAML from "yaml";
import { z } from "zod";
import { isPathInside, projectFlowsDir } from "../../utils/paths.js";
import {
  flowRoleIdSchema,
  flowApprovalGateSchema,
  flowDefinitionSchema,
  flowStepKindSchema,
  flowStepSchema,
  flowTokenSchema,
  flowSlotSchema,
  type FlowDefinition,
} from "../schemas/flow-schema.js";
import {
  findFlowById,
  type DiscoveredFlow,
} from "../catalog/flow-discovery.js";

/**
 * Editable subset surfaced to the Flow Builder. Only fields that the
 * UI actually edits today are accepted — the orchestration topology
 * (kinds, slots, repeats, approval gates) round-trips read-only.
 *
 * Future fields land here as the UI grows; everything else must be
 * edited by hand in the flow.yml so YAML-only conventions remain
 * trustworthy.
 */
// For nullable patch fields, undefined means "no change" and null means
// "clear this field". Zod's `.nullish().optional()` would accept undefined
// alongside null, but we need to round-trip the distinction so we keep
// them as `.nullable().optional()` and inspect with the `in` operator.
const stepPatchSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(160).optional(),
    optional: z.boolean().optional(),
    kind: flowStepKindSchema.optional(),
    slot: flowTokenSchema.nullable().optional(),
    roleId: flowRoleIdSchema.nullable().optional(),
    approval: flowApprovalGateSchema.nullable().optional(),
  })
  .strict();

export const flowPatchInputSchema = z
  .object({
    label: z.string().min(1).max(160).optional(),
    description: z.string().min(1).max(600).optional(),
    /** Patch existing steps in place. Useful for one-off field edits. */
    steps: z.array(stepPatchSchema).max(64).optional(),
    /**
     * Replace the entire ordered step list. Used by the UI whenever
     * structural operations (add / remove / reorder) happen — the
     * dashboard composes the next array client-side and ships it whole
     * so the merge is unambiguous.
     */
    replaceSteps: z.array(flowStepSchema).min(1).max(64).optional(),
    /** Replace the slot map wholesale. */
    replaceSlots: z.record(flowTokenSchema, flowSlotSchema).optional(),
  })
  .strict();

export type FlowPatchInput = z.infer<typeof flowPatchInputSchema>;
export type FlowStepPatch = z.infer<typeof stepPatchSchema>;

export type FlowPatchVerdict =
  | { ok: true; next: FlowDefinition }
  | { ok: false; reasons: string[] };

/**
 * Per-step patch merger. Pure. Honors the undefined-vs-null contract:
 *
 *   field absent  → leave the step's current value alone
 *   field = value → overwrite with value
 *   field = null  → clear (only meaningful for nullable fields)
 *
 * Repeat metadata is intentionally not patchable yet: it carries
 * orchestrator-side semantics (bounded loop count) we don't want a
 * dashboard click to silently reshape.
 */
function mergeStep<S extends FlowDefinition["steps"][number]>(
  cur: S,
  edit: FlowStepPatch,
): S {
  const next: S = { ...cur };
  if (edit.label !== undefined) next.label = edit.label;
  if (edit.optional !== undefined) next.optional = edit.optional;
  if (edit.kind !== undefined) next.kind = edit.kind;
  if ("slot" in edit) {
    if (edit.slot === null) delete next.slot;
    else if (edit.slot !== undefined) next.slot = edit.slot;
  }
  if ("roleId" in edit) {
    if (edit.roleId === null) delete next.roleId;
    else if (edit.roleId !== undefined) next.roleId = edit.roleId;
  }
  if ("approval" in edit) {
    if (edit.approval === null) delete next.approval;
    else if (edit.approval !== undefined) next.approval = edit.approval;
  }
  return next;
}

/**
 * Pure: merge a patch into a definition and re-run the full flow
 * schema validation. Returns either the merged FlowDefinition or a
 * list of human-readable reasons. Never touches disk.
 */
export function mergeFlowPatch(
  current: FlowDefinition,
  patch: FlowPatchInput,
): FlowPatchVerdict {
  const next: FlowDefinition = {
    ...current,
    ...(patch.label !== undefined ? { label: patch.label } : {}),
    ...(patch.description !== undefined
      ? { description: patch.description }
      : {}),
    ...(patch.replaceSlots !== undefined ? { slots: patch.replaceSlots } : {}),
    steps:
      patch.replaceSteps !== undefined
        ? patch.replaceSteps.map((s) => ({ ...s }))
        : current.steps.map((step) => ({ ...step })),
  };

  const reasons: string[] = [];
  if (patch.steps) {
    const byId = new Map(next.steps.map((s) => [s.id, s] as const));
    const unknown: string[] = [];
    for (const edit of patch.steps) {
      const cur = byId.get(edit.id);
      if (!cur) {
        unknown.push(edit.id);
        continue;
      }
      const merged = mergeStep(cur, edit);
      byId.set(edit.id, merged);
    }
    if (unknown.length > 0) {
      reasons.push(
        `Patch references unknown step id${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
      );
    }
    next.steps = next.steps.map((s) => byId.get(s.id) ?? s);
  }

  if (reasons.length > 0) return { ok: false, reasons };

  const parsed = flowDefinitionSchema.safeParse(next);
  if (!parsed.success) {
    return {
      ok: false,
      reasons: parsed.error.issues.map(
        (issue) =>
          `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  return { ok: true, next: parsed.data };
}

/**
 * Copy a builtin (or fixture) flow into the project's `.amaco/flows/`
 * directory so the user can edit it freely. If a project-local flow
 * with the same id already exists, the fork is a no-op (returns
 * existing). Path-guarded the same way as `applyFlowPatch`.
 */
export type ForkFlowResult =
  | {
      ok: true;
      flowId: string;
      definitionPath: string;
      alreadyForked: boolean;
    }
  | { ok: false; status: number; reasons: string[] };

export async function forkFlowToProject(input: {
  projectRoot: string;
  flowId: string;
}): Promise<ForkFlowResult> {
  const { projectRoot, flowId } = input;
  const flow = await findFlowById(projectRoot, flowId);
  if (!flow) {
    return { ok: false, status: 404, reasons: [`Flow "${flowId}" not found.`] };
  }
  if (flow.source.kind === "project" && flow.definitionPath) {
    // Already project-local — no-op, return existing path.
    const rel = path.relative(projectRoot, flow.definitionPath);
    return { ok: true, flowId, definitionPath: rel, alreadyForked: true };
  }
  const rootDir = projectFlowsDir(projectRoot);
  const dirPath = path.join(rootDir, flowId);
  const filePath = path.join(dirPath, "flow.yml");
  if (!isPathInside(rootDir, filePath)) {
    return {
      ok: false,
      status: 400,
      reasons: [`Flow id "${flowId}" produced an unsafe target path.`],
    };
  }
  await fs.mkdir(dirPath, { recursive: true });
  const yaml = YAML.stringify(flow.definition);
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, yaml, { encoding: "utf8", mode: 0o600 });
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
  return {
    ok: true,
    flowId,
    definitionPath: path.relative(projectRoot, filePath),
    alreadyForked: false,
  };
}

/**
 * Delete a project-local flow entirely. Refuses if it's not a
 * project flow. Removes the flow.yml and (if empty) the containing
 * directory.
 */
export type DeleteFlowResult =
  | { ok: true; flowId: string }
  | { ok: false; status: number; reasons: string[] };

export async function deleteProjectFlow(input: {
  projectRoot: string;
  flowId: string;
}): Promise<DeleteFlowResult> {
  const { projectRoot, flowId } = input;
  const flow = await findFlowById(projectRoot, flowId);
  if (!flow) {
    return {
      ok: false,
      status: 404,
      reasons: [`Flow "${flowId}" not found.`],
    };
  }
  if (flow.source.kind !== "project" || !flow.definitionPath) {
    return {
      ok: false,
      status: 409,
      reasons: [
        `Flow "${flowId}" is a ${flow.source.kind} flow; it can only be removed by deleting its YAML by hand.`,
      ],
    };
  }
  const rootDir = projectFlowsDir(projectRoot);
  if (!isPathInside(rootDir, flow.definitionPath)) {
    return {
      ok: false,
      status: 409,
      reasons: [
        `Flow "${flowId}" lives outside the project flows directory and cannot be deleted.`,
      ],
    };
  }
  await fs.rm(flow.definitionPath, { force: true });
  const parent = path.dirname(flow.definitionPath);
  try {
    const remaining = await fs.readdir(parent);
    if (remaining.length === 0) await fs.rmdir(parent);
  } catch {
    /* ignore */
  }
  return { ok: true, flowId };
}

export type ApplyFlowPatchResult =
  | {
      ok: true;
      flowId: string;
      definitionPath: string;
      next: FlowDefinition;
    }
  | {
      ok: false;
      status: number;
      reasons: string[];
    };

/**
 * End-to-end: load the flow, refuse if it isn't project-local, merge
 * the patch, validate, and write the YAML back atomically (write to a
 * sibling tempfile + rename). Path-guarded so an attacker can't escape
 * `.amaco/flows/` via a weird flow id (the loader itself only ever
 * returns paths under `projectFlowsDir`, but we double-check here so
 * a future loader change can't widen the blast radius).
 */
export async function applyFlowPatch(input: {
  projectRoot: string;
  flowId: string;
  patch: FlowPatchInput;
}): Promise<ApplyFlowPatchResult> {
  const { projectRoot, flowId, patch } = input;
  const flow: DiscoveredFlow | null = await findFlowById(
    projectRoot,
    flowId,
  );
  if (!flow) {
    return {
      ok: false,
      status: 404,
      reasons: [`Flow "${flowId}" not found.`],
    };
  }
  if (flow.source.kind !== "project" || !flow.definitionPath) {
    return {
      ok: false,
      status: 409,
      reasons: [
        `Flow "${flowId}" is a ${flow.source.kind} flow and can only be edited by forking it into the project.`,
      ],
    };
  }

  const rootDir = projectFlowsDir(projectRoot);
  if (!isPathInside(rootDir, flow.definitionPath)) {
    return {
      ok: false,
      status: 409,
      reasons: [
        `Flow "${flowId}" lives outside the project flows directory and cannot be patched.`,
      ],
    };
  }

  const verdict = mergeFlowPatch(flow.definition, patch);
  if (!verdict.ok) {
    return { ok: false, status: 400, reasons: verdict.reasons };
  }

  const yaml = YAML.stringify(verdict.next);
  const tmpPath = `${flow.definitionPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, yaml, { encoding: "utf8", mode: 0o600 });
  try {
    await fs.rename(tmpPath, flow.definitionPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }

  return {
    ok: true,
    flowId,
    definitionPath: path.relative(projectRoot, flow.definitionPath),
    next: verdict.next,
  };
}
