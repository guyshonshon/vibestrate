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
import {
  addOwnerPolicy,
  listPolicies,
  removePolicy,
  confirmPolicy,
  rejectPolicy,
} from "../../project/project-policy-service.js";
import {
  draftPolicyFromDescription,
  suggestPoliciesFromRuns,
  testPolicyRule,
  PolicyAssistError,
} from "../../policies/policy-assist.js";

export type PoliciesRoutesDeps = { projectRoot: string };

// ── Assist bodies (all .strict(), all read-only, all model input redacted at the
// source in the service). None of these can write a policy - committing a
// tier/matcher stays the owner's explicit POST /api/policies/rules action.
const draftBody = z.object({ description: z.string().min(1).max(500) }).strict();

const suggestBody = z
  .object({ limit: z.number().int().min(1).max(10).optional() })
  .strict();

const testBody = z
  .object({
    rule: z
      .object({
        regex: z.string().min(1).max(POLICY_LIMITS.maxRegexLength).optional(),
        flags: z.string().max(8).optional(),
        glob: z.string().min(1).max(POLICY_LIMITS.maxGlobLength).optional(),
        appliesTo: z.array(policySurfaceSchema).min(1),
      })
      .strict()
      .refine((r) => !!r.regex || !!r.glob, {
        message: "rule needs a regex, a glob, or both",
      }),
    source: z.union([
      z
        .object({ kind: z.literal("snippet"), patch: z.string().max(20_000) })
        .strict(),
      z
        .object({ kind: z.literal("recent"), limit: z.number().int().min(1).max(10).optional() })
        .strict(),
    ]),
  })
  .strict();

// Owner-authored project-policy add body (docs/design/policy-consolidation.md).
// This is the OWNER surface, so it accepts `tier` + `matcher` (the UI authors a
// block here). It is deliberately SEPARATE from the consult/propose path
// (proposePolicy), which hard-sets tier:advise/matcher:null - a model can never
// reach this matcher-accepting schema.
const addPolicyBody = z
  .object({
    id: z.string().min(1).max(60),
    statement: z.string().min(1).max(300),
    correction: z.string().min(1).max(300).nullable().optional(),
    scopeLenses: z.array(z.string().min(1).max(40)).optional(),
    tier: z.enum(["advise", "block"]).optional(),
    matcher: z.string().min(1).max(POLICY_LIMITS.maxRegexLength).nullable().optional(),
  })
  .strict();

/** Safety behavior toggles (the `policies.*` config block) the dashboard's
 *  Advanced panel and `vibe policies config` both edit. */
const safetyConfigSchema = z
  .object({
    strictApplyOnly: z.boolean().optional(),
    hardenReadOnlySeats: z.boolean().optional(),
    allowInteractiveTerminal: z.boolean().optional(),
    forbidMainBranchWrites: z.boolean().optional(),
    forbidSecretsAccess: z.boolean().optional(),
    forbidAutoPush: z.boolean().optional(),
    forbidAutoMerge: z.boolean().optional(),
    // Posture auto-apply (Slice 2b). Carried by the same endpoint but routed to
    // the `posture.*` config namespace, not `policies.*`.
    autoApplySandbox: z.boolean().optional(),
    autoApplyApproval: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });

/** Keys in the flat safety patch that live under `posture.*`, not `policies.*`. */
const POSTURE_KEYS = new Set(["autoApplySandbox", "autoApplyApproval"]);

/** Hard cap on patch size accepted by the check endpoint. 1 MB is plenty
 *  for a real-world patch and well below what a malicious caller could
 *  flood the engine with. */
const MAX_PATCH_BYTES = 1_000_000;

/**
 * Policy routes - all read-only with respect to the project.
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

  // ── Project policies (owner-authored tiered rules) ────────────────────
  // The first project-config WRITE surface for policies: narrow, audited,
  // project-root bounded (only the projectPolicies array is touched), through the
  // fail-closed config layer.
  app.get("/api/policies/rules", async () => {
    return { policies: await listPolicies(projectRoot) };
  });

  app.post("/api/policies/rules", async (req, reply) => {
    const parsed = addPolicyBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    try {
      const policy = await addOwnerPolicy(
        projectRoot,
        {
          id: parsed.data.id,
          statement: parsed.data.statement,
          correction: parsed.data.correction ?? null,
          scopeLenses: parsed.data.scopeLenses ?? [],
          tier: parsed.data.tier ?? "advise",
          matcher: parsed.data.matcher ?? null,
        },
        new Date().toISOString(),
      );
      return { policy };
    } catch (e) {
      reply.code(400);
      return { error: e instanceof Error ? e.message : "Could not add policy." };
    }
  });

  app.delete("/api/policies/rules/:id", async (req) => {
    const { id } = req.params as { id: string };
    return await removePolicy(projectRoot, id);
  });

  app.post("/api/policies/rules/:id/confirm", async (req) => {
    const { id } = req.params as { id: string };
    return await confirmPolicy(projectRoot, id, new Date().toISOString());
  });

  app.post("/api/policies/rules/:id/reject", async (req) => {
    const { id } = req.params as { id: string };
    return await rejectPolicy(projectRoot, id);
  });

  // Safety behavior config (read). The Advanced panel renders these toggles.
  app.get("/api/policies/config", async () => {
    const loaded = await loadConfig(projectRoot).catch(() => null);
    if (!loaded) throw new HttpError(409, "Project is not initialized.");
    // Merge the posture auto-apply flags in so the Advanced panel renders the
    // whole safety surface from one call (they persist to `posture.*`).
    return {
      config: {
        ...loaded.config.policies,
        autoApplySandbox: loaded.config.posture.autoApplySandbox,
        autoApplyApproval: loaded.config.posture.autoApplyApproval,
      },
    };
  });

  // Safety behavior config (write) - through the same path-guarded config-update
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
      const namespace = POSTURE_KEYS.has(key) ? "posture" : "policies";
      await setConfigValue(projectRoot, `${namespace}.${key}`, String(value));
    }
    const loaded = await loadConfig(projectRoot);
    return {
      ok: true,
      config: {
        ...loaded.config.policies,
        autoApplySandbox: loaded.config.posture.autoApplySandbox,
        autoApplyApproval: loaded.config.posture.autoApplyApproval,
      },
    };
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

  // ── Supervisor-assisted authoring (draft / suggest) + dry-run (test) ──────
  // SECURITY: none of these write a policy. /draft and /suggest return an
  // EDITABLE DRAFT the owner must explicitly save via POST /api/policies/rules
  // (the only tier/matcher-accepting write). The model may SUGGEST a tier/regex;
  // committing it is the owner's action. All model input is redacted at the
  // service source; /test is deterministic (no model) and read-only.

  // POST /api/policies/draft - one English description -> an editable draft.
  app.post("/api/policies/draft", async (req, reply) => {
    const parsed = draftBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    try {
      return await draftPolicyFromDescription({
        projectRoot,
        description: parsed.data.description,
      });
    } catch (e) {
      const code = e instanceof PolicyAssistError ? 400 : 500;
      reply.code(code);
      return { error: e instanceof Error ? e.message : "Could not draft a policy." };
    }
  });

  // POST /api/policies/suggest - propose candidate policies from recent runs.
  app.post("/api/policies/suggest", async (req, reply) => {
    const parsed = suggestBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    try {
      return await suggestPoliciesFromRuns({
        projectRoot,
        limit: parsed.data.limit,
      });
    } catch (e) {
      const code = e instanceof PolicyAssistError ? 400 : 500;
      reply.code(code);
      return { error: e instanceof Error ? e.message : "Could not suggest policies." };
    }
  });

  // POST /api/policies/test - dry-run a candidate matcher against a snippet or
  // recent runs. Deterministic (no model), no write, redacted matched lines.
  app.post("/api/policies/test", async (req, reply) => {
    const parsed = testBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    try {
      return await testPolicyRule({
        projectRoot,
        rule: parsed.data.rule,
        source: parsed.data.source,
      });
    } catch (e) {
      const code = e instanceof PolicyAssistError ? 400 : 500;
      reply.code(code);
      return { error: e instanceof Error ? e.message : "Could not run the policy test." };
    }
  });
}
