import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../security.js";
import { findFlowById } from "../../flows/catalog/flow-discovery.js";
import {
  ParamStore,
  ParamWriteError,
  buildParamSetRequests,
  resolveParamsForFlow,
} from "../../project/project-params.js";
import {
  generateParamSuggestion,
  ParamGenerateError,
} from "../../project/params-generate.js";
import { nowIso } from "../../utils/time.js";

export type ParamsRoutesDeps = {
  projectRoot: string;
};

const setBodySchema = z
  .object({
    /** When given, `values` keys are the flow's declared params (type-checked,
     *  secret-aware, namespaced). Null/absent -> keys are raw param keys. */
    flowId: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9-]*$/)
      .nullable()
      .optional(),
    values: z.record(z.string().min(1).max(120), z.string().max(2000)),
  })
  .strict();

const generateBodySchema = z
  .object({
    flowId: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9-]*$/),
    param: z.string().min(1).max(60),
  })
  .strict();

export async function registerParamsRoutes(
  app: FastifyInstance,
  deps: ParamsRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  // The full stored params - the admin/Settings surface. Secret entries hold an
  // `env:NAME` REFERENCE, never the raw secret, and an env var NAME is not itself
  // a secret, so this returns it as-is (the Project parameters panel shows which
  // env var backs each secret param). This intentionally differs from the
  // per-flow route below, which BLANKS secret values because it feeds a run form
  // (you never want to prefill a password field). Both are localhost + CSRF +
  // optional-bearer guarded.
  app.get("/api/params", async () => {
    const params = await new ParamStore(projectRoot).read();
    return { params };
  });

  // The stored values that apply to a specific flow, keyed by param name (for
  // Composer prefill). Secret values are blanked - only the `secret` flag ships
  // (see the divergence note on GET /api/params above).
  app.get<{ Params: { flowId: string } }>(
    "/api/params/flow/:flowId",
    async (req) => {
      const discovered = await findFlowById(projectRoot, req.params.flowId);
      if (!discovered) throw new HttpError(404, `No flow "${req.params.flowId}".`);
      const stored = await new ParamStore(projectRoot).read();
      const resolved = resolveParamsForFlow(
        stored,
        req.params.flowId,
        discovered.definition.params ?? {},
      );
      const values: Record<
        string,
        { value: string; setBy: string; secret: boolean }
      > = {};
      for (const [name, p] of Object.entries(resolved)) {
        values[name] = {
          value: p.secret ? "" : p.value,
          setBy: p.setBy,
          secret: p.secret,
        };
      }
      return { values };
    },
  );

  app.post<{ Body: unknown }>("/api/params", async (req) => {
    const parsed = setBodySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const { flowId, values } = parsed.data;

    let defs = null;
    if (flowId) {
      const discovered = await findFlowById(projectRoot, flowId);
      if (!discovered) throw new HttpError(404, `No flow "${flowId}".`);
      defs = discovered.definition.params ?? {};
    }

    const assignments = Object.entries(values).map(([key, value]) => ({
      key,
      value,
    }));
    const { requests, warnings, errors } = buildParamSetRequests({
      flowId: flowId ?? null,
      defs,
      assignments,
    });
    if (errors.length > 0) throw new HttpError(400, errors.join(" "));

    try {
      const params = await new ParamStore(projectRoot).set(
        requests,
        nowIso(),
      );
      return { ok: true, warnings, params };
    } catch (err) {
      if (err instanceof ParamWriteError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  // Generate a suggested value for a `generate`-enabled param. Strictly
  // user-initiated (a button press) - this is the only provider call in the
  // profiling loop. Returns a suggestion the caller reviews; it does NOT persist.
  app.post<{ Body: unknown }>("/api/params/generate", async (req) => {
    const parsed = generateBodySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const { flowId, param } = parsed.data;
    const discovered = await findFlowById(projectRoot, flowId);
    if (!discovered) throw new HttpError(404, `No flow "${flowId}".`);
    const profile = await new ParamStore(projectRoot).read();
    try {
      return await generateParamSuggestion({
        projectRoot,
        flowId,
        param,
        defs: discovered.definition.params ?? {},
        profile,
      });
    } catch (err) {
      if (err instanceof ParamGenerateError) {
        throw new HttpError(400, err.message);
      }
      // A provider failure (not configured, offline, bad output) is upstream.
      throw new HttpError(502, err instanceof Error ? err.message : String(err));
    }
  });

  app.delete<{ Params: { key: string } }>(
    "/api/params/:key",
    async (req) => {
      const key = decodeURIComponent(req.params.key);
      const removed = await new ParamStore(projectRoot).unset([key]);
      if (removed.length === 0) {
        throw new HttpError(404, `No profile value for "${key}".`);
      }
      return { ok: true, removed };
    },
  );
}
