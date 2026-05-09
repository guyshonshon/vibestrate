import type { FastifyInstance } from "fastify";
import { detectFullProject } from "../../project/project-detector.js";
import { detectAllProviders } from "../../providers/provider-detection.js";
import { listConfiguredProviders } from "../../setup/provider-setup-service.js";
import { runDoctor } from "../../setup/doctor-service.js";

export type SetupRoutesDeps = {
  projectRoot: string;
};

export async function registerSetupRoutes(
  app: FastifyInstance,
  deps: SetupRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;
  app.get("/api/setup/summary", async () => {
    const [project, providers, configured, doctor] = await Promise.all([
      detectFullProject(projectRoot),
      detectAllProviders(),
      listConfiguredProviders(projectRoot).catch(() => []),
      runDoctor({ cwd: projectRoot }).catch((err: unknown) => ({
        projectRoot,
        inGitRepo: false,
        findings: [],
        recommendedNextSteps: [
          err instanceof Error ? err.message : String(err),
        ],
      })),
    ]);
    return { project, providers, configured, doctor };
  });
}
