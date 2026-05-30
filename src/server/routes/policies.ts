import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../security.js";
import { loadPolicySnapshot } from "../../policies/policy-store.js";
import { evaluatePatchAgainstPolicies } from "../../policies/policy-engine.js";
import {
  policySurfaceSchema,
  POLICY_LIMITS,
} from "../../policies/policy-types.js";
import { loadConfig } from "../../project/config-loader.js";
import { setConfigValue } from "../../setup/config-update-service.js";

export type PoliciesRoutesDeps = { projectRoot: string };

/** Safety behavior toggles (the `policies.*` config block) the dashboard's
 *  Advanced panel and `vibe policies config` both edit. */
const safetyConfigSchema = z
  .object({
    strictApplyOnly: z.boolean().optional(),
    allowInteractiveTerminal: z.boolean().optional(),
    forbidMainBranchWrites: z.boolean().optional(),
    forbidSecretsAccess: z.boolean().optional(),
    forbidAutoPush: z.boolean().optional(),
    forbidAutoMerge: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });

/** Hard cap on patch size accepted by the check endpoint. 1 MB is plenty
 *  for a real-world patch and well below what a malicious caller could
 *  flood the engine with. */
const MAX_PATCH_BYTES = 1_000_000;

/**
 * Policy routes — all read-only with respect to the project.
 *
 * Hard rules:
 *   - GET /api/policies returns the snapshot (rules + ruleFiles +
 *     malformedFiles + duplicateIds). Same shape the CLI's `list` emits.
 *   - GET /api/policies/doctor is a thin projection that exposes only
 *     the actionable subset (counts + malformed + dupes).
 *   - POST /api/policies/check accepts a patch TEXT (not a filesystem
 *     path the browser supplies) and runs the same engine the CLI uses.
 *     Does NOT apply, does NOT execute, does NOT touch any worktree.
 *   - There is no endpoint that creates/edits/deletes rule files;
 *     authoring stays file-based in .vibestrate/policies/.
 */
export async function registerPoliciesRoutes(
  app: FastifyInstance,
  deps: PoliciesRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/policies", async () => {
    return loadPolicySnapshot(projectRoot);
  });

  // Safety behavior config (read). The Advanced panel renders these toggles.
  app.get("/api/policies/config", async () => {
    const loaded = await loadConfig(projectRoot).catch(() => null);
    if (!loaded) throw new HttpError(409, "Project is not initialized.");
    return { config: loaded.config.policies };
  });

  // Safety behavior config (write) — through the same path-guarded config-update
  // service the CLI uses. Only the boolean toggles are editable here;
  // requireApprovalAtStages stays file-edited.
  app.patch("/api/policies/config", async (req) => {
    const parsed = safetyConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid safety config.",
      );
    }
    for (const [key, value] of Object.entries(parsed.data)) {
      await setConfigValue(projectRoot, `policies.${key}`, String(value));
    }
    const loaded = await loadConfig(projectRoot);
    return { ok: true, config: loaded.config.policies };
  });

  app.get("/api/policies/doctor", async () => {
    const snap = await loadPolicySnapshot(projectRoot);
    return {
      ruleCount: snap.rules.length,
      actionCount: snap.actions.length,
      fileCount: snap.ruleFiles.length,
      malformedFiles: snap.malformedFiles,
      duplicateIds: snap.duplicateIds,
    };
  });

  app.post<{
    Body: { patch?: string; surface?: string };
  }>("/api/policies/check", async (req) => {
    const body = req.body ?? {};
    const patch = typeof body.patch === "string" ? body.patch : "";
    if (!patch) throw new HttpError(400, "patch is required.");
    if (patch.length > MAX_PATCH_BYTES) {
      throw new HttpError(
        413,
        `patch exceeds ${MAX_PATCH_BYTES} byte cap.`,
      );
    }
    const surface = policySurfaceSchema.safeParse(body.surface ?? "suggestion-apply");
    if (!surface.success) {
      throw new HttpError(
        400,
        "surface must be one of: suggestion-apply, bundle-apply",
      );
    }
    const snap = await loadPolicySnapshot(projectRoot);
    const result = evaluatePatchAgainstPolicies(snap.rules, {
      patch,
      surface: surface.data,
    });
    return {
      surface: surface.data,
      evaluatedRuleIds: result.evaluatedRuleIds,
      violations: result.violations,
      // Helps the UI render context.
      ruleCountTotal: snap.rules.length,
      ruleCountForSurface: result.evaluatedRuleIds.length,
      limits: {
        maxScanItemLength: POLICY_LIMITS.maxScanItemLength,
        maxPatchBytes: MAX_PATCH_BYTES,
      },
    };
  });
}
