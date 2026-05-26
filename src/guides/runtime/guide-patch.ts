// Pure validator + writer for project-local Guide edits triggered by
// the dashboard Flow Builder. Builtin / fixture guides are *immutable*
// from the API surface — editing them would silently fork the recipe
// out of project source control, which is exactly the trap the
// builtin/project distinction exists to avoid.

import path from "node:path";
import fs from "node:fs/promises";
import YAML from "yaml";
import { z } from "zod";
import { isPathInside, projectGuidesDir } from "../../utils/paths.js";
import {
  guideAgentIdSchema,
  guideApprovalGateSchema,
  guideDefinitionSchema,
  guideStepKindSchema,
  guideStepSchema,
  guideTokenSchema,
  guideSlotSchema,
  type GuideDefinition,
} from "../schemas/guide-schema.js";
import {
  findGuideById,
  type DiscoveredGuide,
} from "../catalog/guide-discovery.js";

/**
 * Editable subset surfaced to the Flow Builder. Only fields that the
 * UI actually edits today are accepted — the orchestration topology
 * (kinds, slots, repeats, approval gates) round-trips read-only.
 *
 * Future fields land here as the UI grows; everything else must be
 * edited by hand in the guide.yml so YAML-only conventions remain
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
    kind: guideStepKindSchema.optional(),
    slot: guideTokenSchema.nullable().optional(),
    agentId: guideAgentIdSchema.nullable().optional(),
    approval: guideApprovalGateSchema.nullable().optional(),
  })
  .strict();

export const guidePatchInputSchema = z
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
    replaceSteps: z.array(guideStepSchema).min(1).max(64).optional(),
    /** Replace the slot map wholesale. */
    replaceSlots: z.record(guideTokenSchema, guideSlotSchema).optional(),
  })
  .strict();

export type GuidePatchInput = z.infer<typeof guidePatchInputSchema>;
export type GuideStepPatch = z.infer<typeof stepPatchSchema>;

export type GuidePatchVerdict =
  | { ok: true; next: GuideDefinition }
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
function mergeStep<S extends GuideDefinition["steps"][number]>(
  cur: S,
  edit: GuideStepPatch,
): S {
  const next: S = { ...cur };
  if (edit.label !== undefined) next.label = edit.label;
  if (edit.optional !== undefined) next.optional = edit.optional;
  if (edit.kind !== undefined) next.kind = edit.kind;
  if ("slot" in edit) {
    if (edit.slot === null) delete next.slot;
    else if (edit.slot !== undefined) next.slot = edit.slot;
  }
  if ("agentId" in edit) {
    if (edit.agentId === null) delete next.agentId;
    else if (edit.agentId !== undefined) next.agentId = edit.agentId;
  }
  if ("approval" in edit) {
    if (edit.approval === null) delete next.approval;
    else if (edit.approval !== undefined) next.approval = edit.approval;
  }
  return next;
}

/**
 * Pure: merge a patch into a definition and re-run the full guide
 * schema validation. Returns either the merged GuideDefinition or a
 * list of human-readable reasons. Never touches disk.
 */
export function mergeGuidePatch(
  current: GuideDefinition,
  patch: GuidePatchInput,
): GuidePatchVerdict {
  const next: GuideDefinition = {
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

  const parsed = guideDefinitionSchema.safeParse(next);
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
 * Copy a builtin (or fixture) guide into the project's `.amaco/guides/`
 * directory so the user can edit it freely. If a project-local guide
 * with the same id already exists, the fork is a no-op (returns
 * existing). Path-guarded the same way as `applyGuidePatch`.
 */
export type ForkGuideResult =
  | {
      ok: true;
      guideId: string;
      definitionPath: string;
      alreadyForked: boolean;
    }
  | { ok: false; status: number; reasons: string[] };

export async function forkGuideToProject(input: {
  projectRoot: string;
  guideId: string;
}): Promise<ForkGuideResult> {
  const { projectRoot, guideId } = input;
  const guide = await findGuideById(projectRoot, guideId);
  if (!guide) {
    return { ok: false, status: 404, reasons: [`Guide "${guideId}" not found.`] };
  }
  if (guide.source.kind === "project" && guide.definitionPath) {
    // Already project-local — no-op, return existing path.
    const rel = path.relative(projectRoot, guide.definitionPath);
    return { ok: true, guideId, definitionPath: rel, alreadyForked: true };
  }
  const rootDir = projectGuidesDir(projectRoot);
  const dirPath = path.join(rootDir, guideId);
  const filePath = path.join(dirPath, "guide.yml");
  if (!isPathInside(rootDir, filePath)) {
    return {
      ok: false,
      status: 400,
      reasons: [`Guide id "${guideId}" produced an unsafe target path.`],
    };
  }
  await fs.mkdir(dirPath, { recursive: true });
  const yaml = YAML.stringify(guide.definition);
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
    guideId,
    definitionPath: path.relative(projectRoot, filePath),
    alreadyForked: false,
  };
}

/**
 * Delete a project-local guide entirely. Refuses if it's not a
 * project guide. Removes the guide.yml and (if empty) the containing
 * directory.
 */
export type DeleteGuideResult =
  | { ok: true; guideId: string }
  | { ok: false; status: number; reasons: string[] };

export async function deleteProjectGuide(input: {
  projectRoot: string;
  guideId: string;
}): Promise<DeleteGuideResult> {
  const { projectRoot, guideId } = input;
  const guide = await findGuideById(projectRoot, guideId);
  if (!guide) {
    return {
      ok: false,
      status: 404,
      reasons: [`Guide "${guideId}" not found.`],
    };
  }
  if (guide.source.kind !== "project" || !guide.definitionPath) {
    return {
      ok: false,
      status: 409,
      reasons: [
        `Guide "${guideId}" is a ${guide.source.kind} guide; it can only be removed by deleting its YAML by hand.`,
      ],
    };
  }
  const rootDir = projectGuidesDir(projectRoot);
  if (!isPathInside(rootDir, guide.definitionPath)) {
    return {
      ok: false,
      status: 409,
      reasons: [
        `Guide "${guideId}" lives outside the project guides directory and cannot be deleted.`,
      ],
    };
  }
  await fs.rm(guide.definitionPath, { force: true });
  const parent = path.dirname(guide.definitionPath);
  try {
    const remaining = await fs.readdir(parent);
    if (remaining.length === 0) await fs.rmdir(parent);
  } catch {
    /* ignore */
  }
  return { ok: true, guideId };
}

export type ApplyGuidePatchResult =
  | {
      ok: true;
      guideId: string;
      definitionPath: string;
      next: GuideDefinition;
    }
  | {
      ok: false;
      status: number;
      reasons: string[];
    };

/**
 * End-to-end: load the guide, refuse if it isn't project-local, merge
 * the patch, validate, and write the YAML back atomically (write to a
 * sibling tempfile + rename). Path-guarded so an attacker can't escape
 * `.amaco/guides/` via a weird guide id (the loader itself only ever
 * returns paths under `projectGuidesDir`, but we double-check here so
 * a future loader change can't widen the blast radius).
 */
export async function applyGuidePatch(input: {
  projectRoot: string;
  guideId: string;
  patch: GuidePatchInput;
}): Promise<ApplyGuidePatchResult> {
  const { projectRoot, guideId, patch } = input;
  const guide: DiscoveredGuide | null = await findGuideById(
    projectRoot,
    guideId,
  );
  if (!guide) {
    return {
      ok: false,
      status: 404,
      reasons: [`Guide "${guideId}" not found.`],
    };
  }
  if (guide.source.kind !== "project" || !guide.definitionPath) {
    return {
      ok: false,
      status: 409,
      reasons: [
        `Guide "${guideId}" is a ${guide.source.kind} guide and can only be edited by forking it into the project.`,
      ],
    };
  }

  const rootDir = projectGuidesDir(projectRoot);
  if (!isPathInside(rootDir, guide.definitionPath)) {
    return {
      ok: false,
      status: 409,
      reasons: [
        `Guide "${guideId}" lives outside the project guides directory and cannot be patched.`,
      ],
    };
  }

  const verdict = mergeGuidePatch(guide.definition, patch);
  if (!verdict.ok) {
    return { ok: false, status: 400, reasons: verdict.reasons };
  }

  const yaml = YAML.stringify(verdict.next);
  const tmpPath = `${guide.definitionPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, yaml, { encoding: "utf8", mode: 0o600 });
  try {
    await fs.rename(tmpPath, guide.definitionPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }

  return {
    ok: true,
    guideId,
    definitionPath: path.relative(projectRoot, guide.definitionPath),
    next: verdict.next,
  };
}
