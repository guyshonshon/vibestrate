import path from "node:path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { WorkspaceStore } from "../../workspace/workspace-store.js";
import {
  buildWorkspaceOverview,
  type OverviewRange,
  type ProjectRegistryEntry,
} from "../../workspace/workspace-overview.js";
import {
  launchRunInProject,
  abortRunInProject,
  listActiveRunsInProject,
  workspaceRunRequestSchema,
} from "../../workspace/workspace-coordinator.js";
import {
  WorkspaceQueueStore,
  drainWorkspaceQueue,
} from "../../workspace/workspace-queue.js";
import {
  resolveTargetProject,
  WorkspaceSafetyError,
} from "../../workspace/workspace-safety.js";
import { HttpError } from "../security.js";

export type WorkspaceRoutesDeps = { projectRoot: string };

/** Map a workspace-safety failure to an HTTP error, preserving its status. */
function asHttp(err: unknown): HttpError {
  if (err instanceof WorkspaceSafetyError) {
    return new HttpError(err.statusCode, err.message);
  }
  if (err instanceof HttpError) return err;
  return new HttpError(500, err instanceof Error ? err.message : String(err));
}

const drainQuerySchema = z.object({
  maxConcurrent: z.coerce.number().int().min(1).max(64).optional(),
  maxPerProject: z.coerce.number().int().min(1).max(32).optional(),
});

const rangeSchema = z.enum(["24h", "7d", "30d", "90d"]).default("7d");

/**
 * Registry entries to roll up: every registered project, plus the project this
 * server is serving (even if it was never registered) so the overview always
 * includes "here". The served project is marked `current`.
 */
async function registryEntries(current: string): Promise<ProjectRegistryEntry[]> {
  const projects = await new WorkspaceStore().list();
  const entries: ProjectRegistryEntry[] = projects.map((p) => ({
    root: p.root,
    label: p.label,
    current: p.root === current,
    lastPort: p.lastPort,
    lastOpenedAt: p.lastOpenedAt,
  }));
  if (!entries.some((e) => e.root === current)) {
    entries.unshift({
      root: current,
      label: path.basename(current) || current,
      current: true,
      lastPort: null,
      lastOpenedAt: null,
    });
  }
  return entries;
}

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  deps: WorkspaceRoutesDeps,
): Promise<void> {
  const current = path.resolve(deps.projectRoot);

  // List known projects so the dashboard switcher can hop between per-project
  // dashboards. The served project is marked `current`. Read-only — switching
  // is just opening another project's dashboard URL.
  app.get("/api/workspace", async () => {
    const projects = await new WorkspaceStore().list();
    return {
      current,
      projects: projects.map((p) => ({ ...p, current: p.root === current })),
    };
  });

  // Cross-project "All projects" overview (Multi-project slice c). Reads each
  // registered project's runs from disk and rolls them up. Roots come only
  // from the user-owned registry (+ the served project), never the request;
  // reads are bounded to each `<root>/.vibestrate/runs/*`.
  app.get<{ Querystring: { range?: string } }>(
    "/api/workspace/overview",
    async (req) => {
      const parsed = rangeSchema.safeParse(req.query.range ?? "7d");
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      const entries = await registryEntries(current);
      return buildWorkspaceOverview({
        projects: entries,
        range: parsed.data as OverviewRange,
      });
    },
  );

  // ─── Cross-project write actions (slice c-board) ──────────────────
  // Every handler below funnels through the workspace-safety gate via the
  // coordinator: the target must be a registered, initialized project. The
  // served dashboard stays single-root; these reach other roots only through
  // the audited detached launcher + dispatch log.

  // Active (non-terminal) runs in a chosen project — powers the abort UI.
  app.get<{ Querystring: { project?: string } }>(
    "/api/workspace/active",
    async (req) => {
      const sel = (req.query.project ?? "").trim();
      if (!sel) throw new HttpError(400, "project is required.");
      try {
        const target = await resolveTargetProject(sel, { currentRoot: current });
        const runs = await listActiveRunsInProject(target.root);
        return { project: { root: target.root, label: target.label }, runs };
      } catch (err) {
        throw asHttp(err);
      }
    },
  );

  // Launch a run in a registered project.
  app.post<{ Body: unknown }>("/api/workspace/runs", async (req) => {
    const parsed = workspaceRunRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    try {
      return await launchRunInProject(parsed.data, {
        currentRoot: current,
        spawnedBy: "workspace-dashboard",
      });
    } catch (err) {
      throw asHttp(err);
    }
  });

  // Abort a run in a registered project.
  app.post<{ Body: unknown }>("/api/workspace/runs/abort", async (req) => {
    const body = z
      .object({ project: z.string().min(1), runId: z.string().min(1) })
      .safeParse(req.body);
    if (!body.success) throw new HttpError(400, body.error.message);
    try {
      return await abortRunInProject(body.data, {
        currentRoot: current,
        spawnedBy: "workspace-dashboard",
      });
    } catch (err) {
      throw asHttp(err);
    }
  });

  // ─── Cross-project dispatch queue (slice d) ───────────────────────

  app.get("/api/workspace/queue", async () => {
    const entries = await new WorkspaceQueueStore().list();
    return { entries };
  });

  app.post<{ Body: unknown }>("/api/workspace/queue", async (req) => {
    const parsed = workspaceRunRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    // Validate the target now so a bad project is rejected at enqueue time,
    // not silently parked until drain.
    try {
      await resolveTargetProject(parsed.data.project, { currentRoot: current });
    } catch (err) {
      throw asHttp(err);
    }
    const entry = await new WorkspaceQueueStore().enqueue(parsed.data, "dashboard");
    return { ok: true, entry };
  });

  app.delete<{ Params: { id: string } }>(
    "/api/workspace/queue/:id",
    async (req) => {
      const removed = await new WorkspaceQueueStore().remove(req.params.id);
      if (!removed) throw new HttpError(404, "Queue entry not found.");
      return { ok: true };
    },
  );

  app.post<{ Querystring: Record<string, string> }>(
    "/api/workspace/queue/drain",
    async (req) => {
      const q = drainQuerySchema.safeParse(req.query);
      if (!q.success) throw new HttpError(400, q.error.message);
      return drainWorkspaceQueue({
        currentRoot: current,
        spawnedBy: "workspace-dashboard-drain",
        maxConcurrent: q.data.maxConcurrent,
        maxPerProject: q.data.maxPerProject,
      });
    },
  );
}
