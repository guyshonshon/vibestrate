import path from "node:path";
import type { FastifyInstance } from "fastify";
import { readDirSafe, pathExists, readText } from "../../utils/fs.js";
import {
  projectRunsDir,
  runStatePath,
  runEventsPath,
  runDir,
} from "../../utils/paths.js";
import { runStateSchema } from "../../core/state-machine.js";
import { applyTransition, isTerminal } from "../../core/state-machine.js";
import { EventLog } from "../../core/event-log.js";
import { writeJson, readJson } from "../../utils/json.js";
import { assertSafeRunId, HttpError } from "../security.js";
import { streamRunEvents } from "../sse.js";
import {
  buildRunReplay,
  RunReplayError,
} from "../../core/run-replay-service.js";

export type RunRoutesDeps = {
  projectRoot: string;
};

export async function registerRunsRoutes(
  app: FastifyInstance,
  deps: RunRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/runs", async () => {
    const runsDir = projectRunsDir(projectRoot);
    const ids = (await readDirSafe(runsDir)).sort();
    const runs = [];
    for (const id of ids) {
      const stateFile = runStatePath(projectRoot, id);
      if (!(await pathExists(stateFile))) continue;
      try {
        const raw = await readJson<unknown>(stateFile);
        const parsed = runStateSchema.safeParse(raw);
        if (parsed.success) runs.push(parsed.data);
      } catch {
        // skip
      }
    }
    return { runs };
  });

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const stateFile = runStatePath(projectRoot, req.params.runId);
      if (!(await pathExists(stateFile))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      const raw = await readJson<unknown>(stateFile);
      const parsed = runStateSchema.safeParse(raw);
      if (!parsed.success) {
        throw new HttpError(500, "Run state.json is invalid.");
      }
      return { run: parsed.data };
    },
  );

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/events",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const eventsFile = runEventsPath(projectRoot, req.params.runId);
      if (!(await pathExists(eventsFile))) {
        return { events: [] };
      }
      const text = await readText(eventsFile);
      const events: unknown[] = [];
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }
      return { events };
    },
  );

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/events/stream",
    async (req, reply) => {
      assertSafeRunId(req.params.runId);
      // Hand SSE off; Fastify treats reply.raw as escape hatch.
      reply.hijack();
      await streamRunEvents({
        projectRoot,
        runId: req.params.runId,
        reply,
        request: req,
      });
    },
  );

  app.post<{ Params: { runId: string } }>(
    "/api/runs/:runId/abort",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const stateFile = runStatePath(projectRoot, req.params.runId);
      if (!(await pathExists(stateFile))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      const raw = await readJson<unknown>(stateFile);
      const parsed = runStateSchema.safeParse(raw);
      if (!parsed.success) {
        throw new HttpError(500, "Run state.json is invalid.");
      }
      const state = parsed.data;
      if (isTerminal(state.status)) {
        return { run: state, alreadyTerminal: true };
      }
      const next = applyTransition(state, "aborted");
      await writeJson(stateFile, next);
      const log = new EventLog(projectRoot, req.params.runId);
      await log.append({
        type: "run.aborted",
        message: `Run ${req.params.runId} aborted via dashboard.`,
      });
      return { run: next, alreadyTerminal: false };
    },
  );

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/files/changed",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const { default: getDiffSnapshotMod } = await import(
        "../../core/diff-service.js"
      ).then((m) => ({ default: m.getDiffSnapshot }));
      const stateFile = runStatePath(projectRoot, req.params.runId);
      if (!(await pathExists(stateFile))) {
        throw new HttpError(404, "Run not found.");
      }
      const raw = await readJson<unknown>(stateFile);
      const state = runStateSchema.parse(raw);
      if (!state.worktreePath) {
        return { snapshot: null };
      }
      const snap = await getDiffSnapshotMod({ worktreePath: state.worktreePath });
      return { snapshot: snap };
    },
  );

  /**
   * Read-only replay projection over a run's persisted files. Reuses the
   * existing runId path guard. The service tolerates missing optional
   * files (older runs may not have all of them) and caps events at 10k —
   * truncation is reported in the response, never silent.
   */
  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/replay",
    async (req) => {
      assertSafeRunId(req.params.runId);
      try {
        return await buildRunReplay(projectRoot, req.params.runId);
      } catch (err) {
        if (err instanceof RunReplayError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );

  // Convenience: GET /api/runs/:runId/dir → expose the absolute run directory
  // path so the UI can show "open in finder" later. Read-only string.
  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/dir",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const dir = runDir(projectRoot, req.params.runId);
      if (!(await pathExists(dir))) throw new HttpError(404, "Run not found.");
      return { dir, projectRoot };
    },
  );
  void path; // keep import for future use
}
