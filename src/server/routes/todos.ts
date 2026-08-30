// The harvested-TODO HTTP surface, over TodoPromoteService.
//
// GET returns the COMPUTED view (promotable / on_board / dismissed) rather than
// the raw harvest file: promotion state is derived from the Board at read time,
// so there is nothing for a client to reconcile.
//
// Every mutation is explicit and per-item. Promote returns a typed three-bucket
// result instead of throwing on the first bad item, so the UI can report
// "9 promoted, 2 already on the board, 1 failed" from one call.

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  TodoPromoteService,
  TodoPromoteError,
} from "../../roadmap/todo-promote-service.js";
import { HttpError } from "../security.js";

const FINGERPRINT = z.string().min(1).max(64).regex(/^[a-f0-9]+$/);

const promoteBody = z
  .object({
    selections: z
      .array(
        z
          .object({
            fingerprint: FINGERPRINT,
            overrides: z
              .object({
                title: z.string().min(1).max(200).optional(),
                priority: z.enum(["low", "medium", "high"]).optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

const fingerprintsBody = z
  .object({ fingerprints: z.array(FINGERPRINT).min(1).max(500) })
  .strict();

export type TodosRoutesDeps = { projectRoot: string };

export async function registerTodosRoutes(
  app: FastifyInstance,
  deps: TodosRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;
  const service = () => new TodoPromoteService(projectRoot);

  // A damaged dismissal file is a 409, not a 500: it is a recoverable state the
  // user can repair, and the message says how.
  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof TodoPromoteError) throw new HttpError(409, err.message);
      throw err;
    }
  };

  app.get("/api/todos", async () => run(() => service().overview()));

  app.post("/api/todos/promote", async (req, reply) => {
    const parsed = promoteBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    return run(() => service().promote({ selections: parsed.data.selections }));
  });

  app.post("/api/todos/dismiss", async (req, reply) => {
    const parsed = fingerprintsBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    await run(() => service().dismiss(parsed.data.fingerprints));
    return run(() => service().overview());
  });

  app.post("/api/todos/undismiss", async (req, reply) => {
    const parsed = fingerprintsBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    await run(() => service().undismiss(parsed.data.fingerprints));
    return run(() => service().overview());
  });
}
