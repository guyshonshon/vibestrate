import path from "node:path";
import type { FastifyInstance } from "fastify";
import { WorkspaceStore } from "../../workspace/workspace-store.js";

export type WorkspaceRoutesDeps = { projectRoot: string };

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
}
