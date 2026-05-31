import path from "node:path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { WorkspaceStore } from "../../workspace/workspace-store.js";
import {
  buildWorkspaceOverview,
  type OverviewRange,
  type ProjectRegistryEntry,
} from "../../workspace/workspace-overview.js";
import { HttpError } from "../security.js";

export type WorkspaceRoutesDeps = { projectRoot: string };

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
}
