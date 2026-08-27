// HTTP routes for the Flow catalog: list / get / export, create / import /
// patch / fork / delete of project-local flows, drafting one from an English
// description, revising the one being edited, resolve, seat-coverage of a flow
// against a crew and flow suggestion for a task, the default-flow setting, and
// the community hub (browse, install, publish).
//
// The handlers are deliberately thin. A handler that takes a body parses it
// with a zod schema before touching anything; the hub browse route forwards its
// query string as-is, and the id-only routes (get, export, fork, delete) carry
// no body. The work itself lives in flows/runtime/*, flows/hub/*,
// flows/catalog/*, and setup/config-update-service for the default-flow
// setting.
//
// Those services do not share one error convention: some return an `ok: false`
// result to be turned into an HttpError, some throw. Check the callee before
// deciding whether a new handler needs a try/catch. An unknown flow id becomes
// a 404 through the `flowOr404` helper.
//
// Worth knowing before extending this:
//   - Import takes YAML text or a URL, not a local file path (the body schema
//     requires exactly one of the two), so an HTTP caller cannot steer the
//     server into reading arbitrary files on disk.
//   - Publish sends project content outward and is fail-closed:
//     VIBESTRATE_API_TOKEN must be set on the `vibe ui` process (a tokenless
//     loopback API is reachable by any local process), VIBESTRATE_HUB_TOKEN
//     must resolve, and a secret-shape preflight over the exported YAML
//     refuses the upload on a hit.

import { z } from "zod";
import { taskTextSchema } from "../../core/run/task-text.js";
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
import {
  draftFlowFromDescription,
  reviseFlowFromInstruction,
  FlowAssistError,
  MAX_INSTRUCTION,
  MAX_FLOW_JSON,
  MAX_PROBLEMS,
  MAX_PROBLEM_CHARS,
} from "../../flows/authoring/flow-assist.js";
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
    task: taskTextSchema,
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
    task: taskTextSchema,
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

// One English sentence in, one editable draft out. The 1000-character cap is the
// service's own MAX_DESCRIPTION - keeping it here too means an over-long body is
// refused before a provider is ever resolved.
const draftFlowBody = z
  .object({
    description: z.string().min(1).max(1000),
    /** Coverage target, and the crew whose planner drafts it. */
    crewId: z.string().min(1).max(128).optional(),
  })
  .strict();

// The flow the owner is editing plus one instruction, in; a proposed revision
// of that same flow (or just an answer), out. `flow` is deliberately NOT
// `flowDefinitionSchema`: a flow mid-edit is exactly what an owner asks for help
// with, and refusing it here would make "this never validates - fix that"
// unanswerable. The caps are the service's own, so an over-long body is refused
// before a provider is ever resolved.
const reviseFlowBody = z
  .object({
    instruction: z.string().min(1).max(MAX_INSTRUCTION),
    flow: z.record(z.string(), z.unknown()),
    /** Problems the editor already reports with the flow as it stands. */
    problems: z.array(z.string().min(1).max(MAX_PROBLEM_CHARS)).max(MAX_PROBLEMS).optional(),
    crewId: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine(
    (b) => JSON.stringify(b.flow).length <= MAX_FLOW_JSON,
    `The flow exceeds ${MAX_FLOW_JSON} characters serialized.`,
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

  // ─── Supervisor-assisted authoring (draft) ────────────────────────────────
  // SECURITY: this does not create anything. /draft returns an EDITABLE DRAFT
  // the owner must explicitly accept via POST /api/flows (below), the only route
  // that writes a project flow. The model may propose steps, seats and shape;
  // committing it is the owner's action. The description is redacted at the
  // service source before it reaches the model, and the drafted YAML is
  // secret-scanned - and refused, not redacted - before it is returned.
  // Vibestrate opens no socket here: any currency check is the agent's own web
  // tool inside its provider CLI, and an agent without one reports the gap in
  // `currency.unverified`.
  app.post<{ Body: unknown }>("/api/flows/draft", async (req) => {
    const parsed = draftFlowBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    try {
      return await draftFlowFromDescription({ projectRoot, ...parsed.data });
    } catch (err) {
      // Bad input (empty or over-long description, unknown crew id) and a
      // refused draft are the caller's problem, and their messages are safe to
      // echo. Anything else - a provider that never answered, an unreadable
      // config - is rethrown untouched so the server's error handler records it
      // and strips the absolute path out of the response body; an HttpError's
      // message is sent verbatim, so wrapping it here would leak that path.
      if (err instanceof FlowAssistError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  // SECURITY: same posture as /draft, and for the same reasons - this proposes,
  // it does not apply. The revision comes back for the owner to accept into the
  // draft they are holding; the only route that writes a project flow is still
  // POST /api/flows. The instruction and the flow are redacted at the service
  // source before they reach the model, and a revised flow carrying a
  // secret shape is refused, not redacted.
  app.post<{ Body: unknown }>("/api/flows/revise", async (req) => {
    const parsed = reviseFlowBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    try {
      return await reviseFlowFromInstruction({ projectRoot, ...parsed.data });
    } catch (err) {
      // Same split as /draft: bad input and a refused revision are the caller's
      // problem and safe to echo; anything else is rethrown untouched so the
      // generic handler strips the absolute project path an HttpError would
      // send verbatim.
      if (err instanceof FlowAssistError) throw new HttpError(400, err.message);
      throw err;
    }
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
