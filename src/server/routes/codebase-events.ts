import type { FastifyInstance } from "fastify";
import {
  FileTreeWatcher,
  GitStatusWatcher,
  type CodebaseWatchEvent,
} from "../../core/codebase-watch-service.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { runStateSchema } from "../../core/state-machine.js";
import { assertSafeRunId, HttpError } from "../security.js";
import { createSseClient } from "../sse.js";

export type CodebaseEventsDeps = { projectRoot: string };

export async function registerCodebaseEventRoutes(
  app: FastifyInstance,
  deps: CodebaseEventsDeps,
): Promise<void> {
  const { projectRoot } = deps;

  // ─── project-scoped stream ────────────────────────────────────────────────
  app.get("/api/project/events/stream", async (req, reply) => {
    reply.hijack();
    const client = createSseClient(reply);

    const gitWatcher = new GitStatusWatcher(projectRoot);
    const treeWatcher = new FileTreeWatcher(projectRoot);

    const cleanup = () => {
      gitWatcher.stop();
      treeWatcher.stop();
      if (heartbeat) clearInterval(heartbeat);
      client.close();
    };
    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);

    const initial = await gitWatcher.pollNow();
    const event: CodebaseWatchEvent = {
      kind: "codebase.snapshot.updated",
      timestamp: new Date().toISOString(),
      summary: initial,
    };
    client.send("codebase", event);

    gitWatcher.subscribe((summary) => {
      const e: CodebaseWatchEvent = {
        kind: "project.git.changed",
        timestamp: new Date().toISOString(),
        summary,
      };
      client.send("codebase", e);
    });
    treeWatcher.subscribe((diff) => {
      const changedPaths = [...diff.added, ...diff.removed, ...diff.modified];
      const e: CodebaseWatchEvent = {
        kind: "filetree.changed",
        rootKind: "project",
        timestamp: new Date().toISOString(),
        changedPaths,
      };
      client.send("codebase", e);
    });
    gitWatcher.start();
    treeWatcher.start();

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat\n\n`);
      } catch {
        cleanup();
      }
    }, 15_000);
    heartbeat.unref?.();
  });

  // ─── run-scoped stream (worktree) ─────────────────────────────────────────
  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/codebase/events/stream",
    async (req, reply) => {
      assertSafeRunId(req.params.runId);
      const stateFile = runStatePath(projectRoot, req.params.runId);
      if (!(await pathExists(stateFile))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      const raw = await readJson<unknown>(stateFile);
      const state = runStateSchema.parse(raw);
      if (!state.worktreePath) {
        throw new HttpError(409, "This run has no worktree yet.");
      }
      const worktreePath = state.worktreePath;
      const runId = req.params.runId;

      reply.hijack();
      const client = createSseClient(reply);

      const gitWatcher = new GitStatusWatcher(worktreePath);
      const treeWatcher = new FileTreeWatcher(worktreePath);

      const cleanup = () => {
        gitWatcher.stop();
        treeWatcher.stop();
        if (heartbeat) clearInterval(heartbeat);
        client.close();
      };
      req.raw.on("close", cleanup);
      req.raw.on("error", cleanup);

      const initial = await gitWatcher.pollNow();
      client.send("codebase", {
        kind: "codebase.snapshot.updated",
        timestamp: new Date().toISOString(),
        summary: initial,
      } satisfies CodebaseWatchEvent);

      gitWatcher.subscribe((summary) => {
        client.send("codebase", {
          kind: "run.git.changed",
          runId,
          timestamp: new Date().toISOString(),
          summary,
        } satisfies CodebaseWatchEvent);
      });
      treeWatcher.subscribe((diff) => {
        const changedPaths = [...diff.added, ...diff.removed, ...diff.modified];
        client.send("codebase", {
          kind: "filetree.changed",
          rootKind: "worktree",
          runId,
          timestamp: new Date().toISOString(),
          changedPaths,
        } satisfies CodebaseWatchEvent);
      });
      gitWatcher.start();
      treeWatcher.start();

      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(`: heartbeat\n\n`);
        } catch {
          cleanup();
        }
      }, 15_000);
      heartbeat.unref?.();
    },
  );
}
