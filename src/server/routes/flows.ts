import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../../project/config-loader.js";
import {
  discoverFlowCatalog,
  findFlowById,
} from "../../flows/catalog/flow-discovery.js";
import {
  FlowResolutionError,
  resolveFlow,
} from "../../flows/runtime/flow-resolver.js";
import { flowContextPolicySchema } from "../../flows/schemas/flow-schema.js";
import { suggestFlowsForProject } from "../../flows/runtime/flow-suggestion.js";
import {
  applyFlowPatch,
  deleteProjectFlow,
  forkFlowToProject,
  flowPatchInputSchema,
} from "../../flows/runtime/flow-patch.js";
import { HttpError } from "../security.js";

const idOverridesSchema = z
  .record(z.string().min(1).max(80), z.string().min(1).max(128))
  .optional();

const resolveFlowBody = z
  .object({
    task: z.string().min(1).max(2000),
    brief: z.string().max(4000).nullable().optional(),
    contextPolicy: flowContextPolicySchema.optional(),
    /** Crew to resolve against (default: project.defaultCrew). */
    crewId: z.string().min(1).max(128).optional(),
    /** Run-wide Profile override applied to every seated step. */
    profileOverride: z.string().min(1).max(128).optional(),
    /** Pin a specific Role to a Seat (seat → roleId). */
    seatRoleOverrides: idOverridesSchema,
    /** Per-step Profile overrides (step id → profile id). */
    stepProfileOverrides: idOverridesSchema,
    skippedOptionalSteps: z.array(z.string().min(1).max(80)).max(64).optional(),
  })
  .strict();

const suggestFlowsBody = z
  .object({
    task: z.string().min(1).max(2000),
    files: z.array(z.string().min(1).max(500)).max(256).optional(),
    riskLevel: z.enum(["low", "medium", "high"]).nullable().optional(),
  })
  .strict();

export type FlowsRoutesDeps = {
  projectRoot: string;
};

export async function registerFlowsRoutes(
  app: FastifyInstance,
  deps: FlowsRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/flows", async () => {
    // Resilient: builtins + valid project flows always load; a malformed
    // project flow is reported in `invalid` instead of failing the whole list.
    const catalog = await discoverFlowCatalog(projectRoot);
    return { flows: catalog.flows, invalid: catalog.invalid };
  });

  app.post<{ Body: unknown }>("/api/flows/suggest", async (req) => {
    const parsed = suggestFlowsBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    return {
      suggestions: await suggestFlowsForProject({
        projectRoot,
        ...parsed.data,
      }),
    };
  });

  app.get<{ Params: { flowId: string } }>(
    "/api/flows/:flowId",
    async (req) => {
      const flow = await flowOr404(projectRoot, req.params.flowId);
      return { flow };
    },
  );

  app.patch<{ Params: { flowId: string }; Body: unknown }>(
    "/api/flows/:flowId",
    async (req) => {
      const parsed = flowPatchInputSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      const result = await applyFlowPatch({
        projectRoot,
        flowId: decodeURIComponent(req.params.flowId),
        patch: parsed.data,
      });
      if (!result.ok) {
        throw new HttpError(result.status, result.reasons.join("\n"));
      }
      return {
        ok: true,
        flowId: result.flowId,
        definitionPath: result.definitionPath,
        flow: await flowOr404(projectRoot, result.flowId),
      };
    },
  );

  /**
   * Copy a builtin / fixture flow into `.vibestrate/flows/<id>/flow.yml`
   * so the dashboard can edit it. Idempotent — re-forking returns the
   * existing project flow.
   */
  app.post<{ Params: { flowId: string } }>(
    "/api/flows/:flowId/fork",
    async (req) => {
      const result = await forkFlowToProject({
        projectRoot,
        flowId: decodeURIComponent(req.params.flowId),
      });
      if (!result.ok) {
        throw new HttpError(result.status, result.reasons.join("\n"));
      }
      const refreshed = await flowOr404(projectRoot, result.flowId);
      return {
        ok: true,
        flowId: result.flowId,
        definitionPath: result.definitionPath,
        alreadyForked: result.alreadyForked,
        flow: refreshed,
      };
    },
  );

  /**
   * Delete a project-local flow. Refuses to delete builtins / fixtures.
   */
  app.delete<{ Params: { flowId: string } }>(
    "/api/flows/:flowId",
    async (req) => {
      const result = await deleteProjectFlow({
        projectRoot,
        flowId: decodeURIComponent(req.params.flowId),
      });
      if (!result.ok) {
        throw new HttpError(result.status, result.reasons.join("\n"));
      }
      return result;
    },
  );

  app.post<{ Params: { flowId: string }; Body: unknown }>(
    "/api/flows/:flowId/resolve",
    async (req) => {
      const parsed = resolveFlowBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);

      const [flow, loaded] = await Promise.all([
        flowOr404(projectRoot, req.params.flowId),
        loadConfig(projectRoot),
      ]);
      try {
        return {
          snapshot: resolveFlow({
            flow: flow.definition,
            source: flow.source,
            config: loaded.config,
            ...parsed.data,
          }),
        };
      } catch (err) {
        if (err instanceof FlowResolutionError) {
          throw new HttpError(400, err.message);
        }
        throw err;
      }
    },
  );
}

async function flowOr404(projectRoot: string, flowId: string) {
  const decoded = decodeURIComponent(flowId);
  const flow = await findFlowById(projectRoot, decoded);
  if (!flow) {
    throw new HttpError(
      404,
      `Flow "${decoded}" not found. Use GET /api/flows to list available Flow ids.`,
    );
  }
  return flow;
}
