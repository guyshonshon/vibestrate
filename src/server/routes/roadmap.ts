import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { HttpError } from "../security.js";
import { safeIdSchema } from "../../roadmap/roadmap-types.js";

const addBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

export type RoadmapRoutesDeps = { projectRoot: string };

function assertSafeId(id: string): void {
  const r = safeIdSchema.safeParse(id);
  if (!r.success) throw new HttpError(400, "Invalid id.");
}

export async function registerRoadmapRoutes(
  app: FastifyInstance,
  deps: RoadmapRoutesDeps,
): Promise<void> {
  const svc = new RoadmapService(deps.projectRoot);

  app.get("/api/roadmap", async () => {
    await svc.init();
    const items = await svc.listRoadmapItems();
    return { items };
  });

  app.post<{ Body: unknown }>("/api/roadmap/items", async (req) => {
    const parsed = addBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        `Body must be { title: string, description?: string, priority?: low|medium|high }: ${parsed.error.message}`,
      );
    }
    await svc.init();
    const item = await svc.addRoadmapItem(parsed.data);
    return { item };
  });

  app.get<{ Params: { id: string } }>(
    "/api/roadmap/items/:id",
    async (req) => {
      assertSafeId(req.params.id);
      const item = await svc.getRoadmapItem(req.params.id);
      if (!item) throw new HttpError(404, "Roadmap item not found.");
      return { item };
    },
  );

  app.patch<{ Params: { id: string }; Body: unknown }>(
    "/api/roadmap/items/:id",
    async (req) => {
      assertSafeId(req.params.id);
      const patchSchema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        status: z
          .enum(["idea", "planned", "active", "blocked", "done", "archived"])
          .optional(),
        notes: z.string().optional(),
      });
      const parsed = patchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.message);
      }
      try {
        const item = await svc.updateRoadmapItem(req.params.id, parsed.data);
        return { item };
      } catch (err) {
        throw new HttpError(404, err instanceof Error ? err.message : String(err));
      }
    },
  );
}
