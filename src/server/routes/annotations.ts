import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  addAnnotation,
  AnnotationError,
  deleteAnnotation,
  listAnnotations,
  updateAnnotation,
} from "../../core/annotations-service.js";
import { HttpError } from "../security.js";

export type AnnotationsRoutesDeps = { projectRoot: string };

const createSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().positive().nullable().optional(),
  endLine: z.number().int().positive().nullable().optional(),
  body: z.string().min(1),
  shareWithRoles: z.boolean().optional(),
});

const updateSchema = z
  .object({
    body: z.string().min(1).optional(),
    shareWithRoles: z.boolean().optional(),
    status: z.enum(["open", "resolved"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });

function mapError(err: unknown): never {
  if (err instanceof AnnotationError) {
    throw new HttpError(err.statusCode, err.message);
  }
  throw err;
}

/**
 * Codebase annotations — human-authored, file-pinned notes the orchestrator
 * shares with agents. All reads/writes are bounded to `.vibestrate/annotations.json`
 * in the project root; the service rejects traversal + secret-like paths and
 * scans note bodies for secret-shaped tokens. No source files are touched.
 */
export async function registerAnnotationsRoutes(
  app: FastifyInstance,
  deps: AnnotationsRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get<{ Querystring: { path?: string; status?: string } }>(
    "/api/annotations",
    async (req) => {
      const status =
        req.query.status === "open" || req.query.status === "resolved"
          ? req.query.status
          : undefined;
      try {
        const annotations = await listAnnotations(projectRoot, {
          path: req.query.path?.trim() || undefined,
          status,
        });
        return { annotations };
      } catch (err) {
        mapError(err);
      }
    },
  );

  app.post("/api/annotations", async (req) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid annotation.");
    }
    try {
      const annotation = await addAnnotation(projectRoot, parsed.data);
      return { annotation };
    } catch (err) {
      mapError(err);
    }
  });

  app.patch<{ Params: { id: string } }>(
    "/api/annotations/:id",
    async (req) => {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid update.");
      }
      try {
        const annotation = await updateAnnotation(
          projectRoot,
          req.params.id,
          parsed.data,
        );
        return { annotation };
      } catch (err) {
        mapError(err);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/annotations/:id",
    async (req) => {
      try {
        await deleteAnnotation(projectRoot, req.params.id);
        return { ok: true };
      } catch (err) {
        mapError(err);
      }
    },
  );
}
