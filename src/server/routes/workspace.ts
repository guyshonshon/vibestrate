import path from "node:path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { WorkspaceStore, canonicalRoot } from "../../workspace/workspace-store.js";
import {
  buildWorkspaceOverview,
  type OverviewRange,
  type ProjectRegistryEntry,
} from "../../workspace/workspace-overview.js";
import {
  ensureProjectServer,
  closeProjectServer,
  readProjectBusyStatus,
  probeLiveness,
} from "../../workspace/workspace-runtime.js";
import {
  resolveTargetProject,
  WorkspaceSafetyError,
} from "../../workspace/workspace-safety.js";
import { HttpError } from "../security.js";

export type WorkspaceRoutesDeps = { projectRoot: string };

const rangeSchema = z.enum(["24h", "7d", "30d", "90d"]).default("7d");

/** Map a workspace-safety failure to an HTTP error, preserving its status. */
function asHttp(err: unknown): HttpError {
  if (err instanceof WorkspaceSafetyError) {
    return new HttpError(err.statusCode, err.message);
  }
  if (err instanceof HttpError) return err;
  return new HttpError(500, err instanceof Error ? err.message : String(err));
}

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
  const current = canonicalRoot(deps.projectRoot);

  // List known projects so the dashboard switcher can hop between per-project
  // dashboards. The served project is marked `current`; `live` reflects whether
  // a dashboard is currently answering (the served one always is).
  app.get("/api/workspace", async () => {
    const projects = await new WorkspaceStore().list();
    const liveness = await probeLiveness(projects);
    return {
      current,
      projects: projects.map((p) => ({
        ...p,
        current: p.root === current,
        live: p.root === current ? true : (liveness[p.root] ?? false),
      })),
    };
  });

  // Cross-project "All projects" overview. Reads each registered project's runs
  // from disk and rolls them up (bounded to each `<root>/.vibestrate/runs`), then
  // attaches a best-effort liveness flag so the UI can offer Open vs Launch.
  app.get<{ Querystring: { range?: string } }>(
    "/api/workspace/overview",
    async (req) => {
      const parsed = rangeSchema.safeParse(req.query.range ?? "7d");
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      const entries = await registryEntries(current);
      const overview = await buildWorkspaceOverview({
        projects: entries,
        range: parsed.data as OverviewRange,
      });
      const liveness = await probeLiveness(
        entries.map((e) => ({ root: e.root, lastPort: e.lastPort })),
      );
      for (const p of overview.projects) {
        p.live = p.current ? true : (liveness[p.root] ?? false);
      }
      return overview;
    },
  );

  // ─── Navigator: open a project ────────────────────────────────────
  // Ensure a registered project has a live dashboard and return its URL. If
  // dormant, this starts its OWN `vibe ui` (server + scheduler) on a free port —
  // an isolated tenant. The browser then opens a new tab to the URL. Gated by
  // the workspace-safety guard (must be registered + initialized).
  app.post<{ Body: unknown }>("/api/workspace/open", async (req) => {
    const body = z.object({ project: z.string().min(1) }).safeParse(req.body);
    if (!body.success) throw new HttpError(400, body.error.message);
    try {
      // Validate first for a clean 400; ensureProjectServer re-checks.
      await resolveTargetProject(body.data.project, { currentRoot: current });
      return await ensureProjectServer(body.data, { currentRoot: current });
    } catch (err) {
      throw asHttp(err);
    }
  });

  // What a project is currently doing — powers the Close confirmation so the
  // user sees whether shutting down would interrupt active runs / queued work.
  app.get<{ Querystring: { project?: string } }>(
    "/api/workspace/status",
    async (req) => {
      const sel = (req.query.project ?? "").trim();
      if (!sel) throw new HttpError(400, "project is required.");
      try {
        const target = await resolveTargetProject(sel, { currentRoot: current });
        const status = await readProjectBusyStatus(target.root);
        return { project: { root: target.root, label: target.label }, ...status };
      } catch (err) {
        throw asHttp(err);
      }
    },
  );

  // Close (shut down) a project's own dashboard + scheduler. Idempotent — a
  // project that isn't live reports `alreadyStopped`.
  app.post<{ Body: unknown }>("/api/workspace/close", async (req) => {
    const body = z.object({ project: z.string().min(1) }).safeParse(req.body);
    if (!body.success) throw new HttpError(400, body.error.message);
    try {
      return await closeProjectServer(body.data, { currentRoot: current });
    } catch (err) {
      throw asHttp(err);
    }
  });
}
