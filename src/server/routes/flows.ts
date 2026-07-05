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
import {
  createProjectFlow,
  exportFlowYaml,
  importFlowFromText,
  importFlowFromUrl,
} from "../../flows/runtime/flow-portability.js";
import { flowDefinitionSchema } from "../../flows/schemas/flow-schema.js";
import { computeFlowCoverageForConfig } from "../../flows/runtime/seat-coverage.js";
import { setConfigValue } from "../../setup/config-update-service.js";
import { HttpError } from "../security.js";
import { buildPublishRef, runPublishPreflight } from "../../flows/hub/publish-guards.js";
import { resolveSecret } from "../../notifications/gateways/secret-resolver.js";

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

const coverageBody = z
  .object({
    crewId: z.string().min(1).max(128).nullable().optional(),
    seatRoleOverrides: idOverridesSchema,
  })
  .strict();

const setDefaultFlowBody = z
  .object({ flowId: z.string().min(1).max(80) })
  .strict();

const suggestFlowsBody = z
  .object({
    task: z.string().min(1).max(2000),
    files: z.array(z.string().min(1).max(500)).max(256).optional(),
    riskLevel: z.enum(["low", "medium", "high"]).nullable().optional(),
  })
  .strict();

// Import one flow from raw YAML text or a URL (exactly one). File-path imports
// are CLI-only: the server never reads arbitrary local paths over HTTP.
const importFlowBody = z
  .object({
    yaml: z.string().min(1).max(512 * 1024).optional(),
    url: z.string().min(1).max(2048).optional(),
    overwrite: z.boolean().optional(),
  })
  .strict()
  .refine(
    (b) => (b.yaml ? 1 : 0) + (b.url ? 1 : 0) === 1,
    "Provide exactly one of `yaml` or `url`.",
  );

// Flow-creator API: a full FlowDefinition (validated by the portability layer)
// plus an optional overwrite flag.
const createFlowBody = z
  .object({
    flow: flowDefinitionSchema,
    overwrite: z.boolean().optional(),
  })
  .strict();

const hubInstallBody = z.object({
  ref: z.string().min(1).max(200),
  baseUrl: z.string().url().max(2000).optional(),
  overwrite: z.boolean().optional(),
});

const hubPublishBody = z
  .object({
    flowId: z.string().min(1).max(120),
    version: z.string().min(1).max(40),
    name: z.string().min(1).max(60).optional(),
    handle: z.string().min(1).max(60),
    baseUrl: z.string().url().max(2000).optional(),
    confirm: z.literal("publish"),
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
    let defaultFlow: string | null = null;
    try {
      defaultFlow = (await loadConfig(projectRoot)).config.defaultFlow ?? null;
    } catch {
      // config may be absent/invalid; the list still loads.
    }
    // Hidden flows (the internal Spec-up phase) never appear in pickers/the hub;
    // they remain launchable by id via the per-id routes + the run launcher.
    const flows = catalog.flows.filter((f) => !f.definition.hidden);
    return { flows, invalid: catalog.invalid, defaultFlow };
  });

  // ─── hub ──────────────────────────────────────────────────────────────────
  // Browse + install community flows. The API never allows private hosts
  // (SSRF), and install goes through the same validated/guarded import writer.
  app.get<{ Querystring: { baseUrl?: string; q?: string; tag?: string; author?: string } }>(
    "/api/flows/hub",
    async (req) => {
      const { searchHubFlows } = await import("../../flows/hub/hub-client.js");
      const r = await searchHubFlows({
        q: req.query.q,
        tag: req.query.tag,
        author: req.query.author,
        baseUrl: req.query.baseUrl,
      });
      if (!r.ok) throw new HttpError(502, r.reason);
      return { flows: r.value };
    },
  );

  app.post<{ Body: unknown }>("/api/flows/hub/install", async (req) => {
    const parsed = hubInstallBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const { installFlowFromHub } = await import("../../flows/hub/hub-client.js");
    const r = await installFlowFromHub({
      projectRoot,
      ref: parsed.data.ref,
      baseUrl: parsed.data.baseUrl,
      overwrite: parsed.data.overwrite,
    });
    if (!r.ok) throw new HttpError(r.status >= 400 && r.status < 600 ? r.status : 400, r.reasons.join(" "));
    return { result: r };
  });

  // Publish is outward-facing + token-bearing. Fail-closed like the git write
  // routes: a tokenless loopback API is reachable by any local process.
  const requireApiToken = () => {
    if (!process.env.VIBESTRATE_API_TOKEN) {
      throw new HttpError(
        403,
        "Publishing from the dashboard requires VIBESTRATE_API_TOKEN to be set. Set a token and restart `vibe ui`.",
      );
    }
  };

  app.post<{ Body: unknown }>("/api/flows/hub/publish", async (req) => {
    requireApiToken();
    const parsed = hubPublishBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);

    const exported = await exportFlowYaml({ projectRoot, flowId: parsed.data.flowId });
    if (!exported.ok) throw new HttpError(exported.status ?? 404, exported.reasons.join(" "));

    // buildPublishRef validates raw input (no normalization); lowercase here.
    const ref = buildPublishRef({
      handle: parsed.data.handle.toLowerCase(),
      name: (parsed.data.name ?? parsed.data.flowId).toLowerCase(),
      version: parsed.data.version,
    });
    if (!ref.ok) throw new HttpError(400, ref.reason);

    const pre = runPublishPreflight(exported.yaml);
    if (!pre.ok) throw new HttpError(400, `Refusing to publish (secret-shaped content): ${pre.refusals.join("; ")}`);

    const token = resolveSecret("env:VIBESTRATE_HUB_TOKEN");
    if (!token) throw new HttpError(412, "Set VIBESTRATE_HUB_TOKEN (a GitHub token) in the `vibe ui` process env to publish.");

    const { publishFlow } = await import("../../flows/hub/hub-client.js");
    const result = await publishFlow({ content: exported.yaml, ref: ref.ref, token, baseUrl: parsed.data.baseUrl });
    if (!result.ok) {
      const status = result.status >= 400 && result.status < 600 ? result.status : 502;
      throw new HttpError(status, result.reason);
    }
    return { result, warnings: pre.warnings };
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

  // Flow-creator API: write a brand-new project flow from a full definition.
  // Create-only by default; pass `overwrite: true` to replace an existing
  // project flow (a builtin of the same id is always shadowable, like fork).
  app.post<{ Body: unknown }>("/api/flows", async (req, reply) => {
    const parsed = createFlowBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const result = await createProjectFlow({
      projectRoot,
      definition: parsed.data.flow,
      overwrite: parsed.data.overwrite,
    });
    if (!result.ok) {
      throw new HttpError(result.status, result.reasons.join("\n"));
    }
    reply.code(result.overwritten ? 200 : 201);
    return {
      ok: true,
      flowId: result.flowId,
      definitionPath: result.definitionPath,
      overwritten: result.overwritten,
      flow: await flowOr404(projectRoot, result.flowId),
    };
  });

  // Import a single flow from raw YAML or a URL, dropping it into
  // `.vibestrate/flows/`. Schema-validated + secret/control-char guarded; URL
  // fetches are SSRF-guarded, size- and time-bounded.
  app.post<{ Body: unknown }>("/api/flows/import", async (req, reply) => {
    const parsed = importFlowBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const result = parsed.data.url
      ? await importFlowFromUrl({
          projectRoot,
          url: parsed.data.url,
          overwrite: parsed.data.overwrite,
        })
      : await importFlowFromText({
          projectRoot,
          text: parsed.data.yaml!,
          overwrite: parsed.data.overwrite,
        });
    if (!result.ok) {
      throw new HttpError(result.status, result.reasons.join("\n"));
    }
    reply.code(result.overwritten ? 200 : 201);
    return {
      ok: true,
      flowId: result.flowId,
      definitionPath: result.definitionPath,
      overwritten: result.overwritten,
      flow: await flowOr404(projectRoot, result.flowId),
    };
  });

  app.get<{ Params: { flowId: string } }>(
    "/api/flows/:flowId",
    async (req) => {
      const flow = await flowOr404(projectRoot, req.params.flowId);
      return { flow };
    },
  );

  // Export any discovered flow (builtin / fixture / project) as canonical YAML
  // for sharing. `?format=yaml` returns the raw text as a download; default is
  // JSON `{ flowId, source, yaml }`.
  app.get<{ Params: { flowId: string }; Querystring: { format?: string } }>(
    "/api/flows/:flowId/export",
    async (req, reply) => {
      const result = await exportFlowYaml({
        projectRoot,
        flowId: decodeURIComponent(req.params.flowId),
      });
      if (!result.ok) {
        throw new HttpError(result.status, result.reasons.join("\n"));
      }
      if (req.query.format === "yaml") {
        return reply
          .type("application/x-yaml")
          .header(
            "Content-Disposition",
            `attachment; filename="${result.flowId}.flow.yml"`,
          )
          .send(result.yaml);
      }
      return { flowId: result.flowId, source: result.source, yaml: result.yaml };
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
   * so the dashboard can edit it. Idempotent - re-forking returns the
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

  // Per-seat coverage of a flow against a crew (filled / gap / ambiguous +
  // runnable). Never throws on a gap - that's the point.
  app.post<{ Params: { flowId: string }; Body: unknown }>(
    "/api/flows/:flowId/coverage",
    async (req) => {
      const parsed = coverageBody.safeParse(req.body ?? {});
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      const [flow, loaded] = await Promise.all([
        flowOr404(projectRoot, req.params.flowId),
        loadConfig(projectRoot),
      ]);
      try {
        return {
          coverage: computeFlowCoverageForConfig({
            config: loaded.config,
            flow: flow.definition,
            crewId: parsed.data.crewId ?? null,
            seatRoleOverrides: parsed.data.seatRoleOverrides,
          }),
        };
      } catch (err) {
        // getCrew throws only on an unknown crew id.
        throw new HttpError(400, err instanceof Error ? err.message : String(err));
      }
    },
  );

  // Set the project's default ("active") flow - runs with no flow use it.
  app.post<{ Body: unknown }>("/api/flows/default", async (req) => {
    const parsed = setDefaultFlowBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    await flowOr404(projectRoot, parsed.data.flowId);
    await setConfigValue(projectRoot, "defaultFlow", parsed.data.flowId);
    return { ok: true, defaultFlow: parsed.data.flowId };
  });
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
