import type { FastifyInstance } from "fastify";
import { HttpError } from "../security.js";
import { loadPolicySnapshot } from "../../policies/policy-store.js";
import { evaluatePatchAgainstPolicies } from "../../policies/policy-engine.js";
import {
  policySurfaceSchema,
  POLICY_LIMITS,
} from "../../policies/policy-types.js";

export type PoliciesRoutesDeps = { projectRoot: string };

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
 *     authoring stays file-based in .amaco/policies/.
 */
export async function registerPoliciesRoutes(
  app: FastifyInstance,
  deps: PoliciesRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/policies", async () => {
    return loadPolicySnapshot(projectRoot);
  });

  app.get("/api/policies/doctor", async () => {
    const snap = await loadPolicySnapshot(projectRoot);
    return {
      ruleCount: snap.rules.length,
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
