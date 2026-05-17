import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { readDirSafe, pathExists, readText } from "../../utils/fs.js";
import {
  projectRunsDir,
  runStatePath,
  runEventsPath,
  runDir,
} from "../../utils/paths.js";
import { runStateSchema } from "../../core/state-machine.js";
import { applyTransition, isTerminal, RunStateStore } from "../../core/state-machine.js";
import { EventLog } from "../../core/event-log.js";
import {
  PauseError,
  requestPause,
  requestResume,
} from "../../core/pause-service.js";
import { writeJson, readJson } from "../../utils/json.js";
import { assertSafeRunId, HttpError } from "../security.js";
import { streamRunEvents, streamProviderOutput } from "../sse.js";
import {
  listStreams,
  readStream,
} from "../../core/provider-stream-store.js";
import { streamAggregateRunEvents } from "../sse-aggregate.js";
import {
  buildRunReplay,
  RunReplayError,
} from "../../core/run-replay-service.js";
import { deriveRerunArgs, formatArgv } from "../../scheduler/rerun-args.js";
import {
  appendControl,
  listControls,
  pendingControls,
} from "../../core/run-control.js";

export type RunRoutesDeps = {
  projectRoot: string;
};

// Schema for `POST /api/runs`. Mirrors the `amaco run` CLI surface
// at the body level, but constrained so only audited fields flow
// through (no arbitrary argv).
const spawnRunBody = z.object({
  task: z.string().min(1).max(2000),
  taskId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
    .optional(),
  effort: z.enum(["low", "medium", "high"]).optional(),
  provider: z.string().min(1).max(64).optional(),
  readOnly: z.boolean().optional(),
  // Per-run skill ids — merged into every agent's configured skills
  // for this single run. Each id is the slug `loadSkills` accepts.
  skills: z
    .array(z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/))
    .max(64)
    .optional(),
  concise: z.boolean().optional(),
});

function resolveAmacoBin(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // bundled: dist/index.js sits a few dirs up from this route file
    path.resolve(here, "..", "..", "..", "dist", "index.js"),
    // source layout under src/server/routes
    path.resolve(here, "..", "..", "..", "..", "dist", "index.js"),
    // same dir as the bundled entry
    path.resolve(here, "index.js"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

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

  // ─── POST /api/runs ───────────────────────────────────────────────
  // Spawn `amaco run` for a task. argv-only (never a shell), all
  // body fields are typed + length-bounded, cwd is pinned to the
  // project root the server is serving. Audits a `run.spawned_by_ui`
  // event into the project-level audit log so dashboard-initiated
  // runs are distinguishable from CLI runs after the fact.
  app.post<{ Body: unknown }>("/api/runs", async (req) => {
    const parsed = spawnRunBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.message);
    }
    const body = parsed.data;
    const argv: string[] = ["run", body.task];
    if (body.taskId) argv.push("--task", body.taskId);
    if (body.effort) argv.push("--effort", body.effort);
    if (body.provider) argv.push("--provider", body.provider);
    if (body.readOnly) argv.push("--read-only");
    if (body.skills && body.skills.length > 0) {
      argv.push("--skills", body.skills.join(","));
    }
    if (body.concise) argv.push("--concise");
    const bin = resolveAmacoBin();
    try {
      const child = spawn(process.execPath, [bin, ...argv], {
        cwd: projectRoot,
        env: { ...process.env, AMACO_SPAWNED_BY: "dashboard", NO_COLOR: "1" },
        stdio: "ignore",
        detached: true,
      });
      child.unref();
      return {
        ok: true,
        pid: child.pid ?? null,
        argv,
        message: `spawned amaco ${argv.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`,
      };
    } catch (err) {
      throw new HttpError(
        500,
        `Failed to spawn amaco run: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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

  // Aggregate SSE that fans every run's events.ndjson into one
  // stream. Used by Mission Control so the entire page updates
  // from a single connection rather than polling N runs every 2s.
  app.get("/api/events/stream", async (req, reply) => {
    reply.hijack();
    await streamAggregateRunEvents({
      projectRoot,
      reply,
      request: req,
    });
  });

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

  // ─── Per-agent provider stream (raw stdout/stderr) ──────────────
  // Lets the dashboard tail what the provider CLI is *currently
  // saying* — the missing link between "spawned" and "artifact
  // written". Listed first, then per-stream full read + SSE tail.
  const STREAM_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/streams",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const streams = await listStreams(projectRoot, req.params.runId);
      return { streams };
    },
  );
  app.get<{ Params: { runId: string; name: string } }>(
    "/api/runs/:runId/streams/:name",
    async (req) => {
      assertSafeRunId(req.params.runId);
      if (!STREAM_NAME_RE.test(req.params.name)) {
        throw new HttpError(400, "Invalid stream name.");
      }
      const lines = await readStream(
        projectRoot,
        req.params.runId,
        req.params.name,
      );
      return { lines };
    },
  );
  app.get<{ Params: { runId: string; name: string } }>(
    "/api/runs/:runId/streams/:name/stream",
    async (req, reply) => {
      assertSafeRunId(req.params.runId);
      if (!STREAM_NAME_RE.test(req.params.name)) {
        throw new HttpError(400, "Invalid stream name.");
      }
      reply.hijack();
      await streamProviderOutput({
        projectRoot,
        runId: req.params.runId,
        promptName: req.params.name,
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

  // Pause / resume — write-side toggles on state.pauseRequested. The
  // orchestrator's pause gates (src/core/pause-service.ts) read this
  // flag at every stage boundary. No provider call, no worktree write.
  app.post<{ Params: { runId: string } }>(
    "/api/runs/:runId/pause",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const stateFile = runStatePath(projectRoot, req.params.runId);
      if (!(await pathExists(stateFile))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      const store = new RunStateStore(projectRoot, req.params.runId);
      const events = new EventLog(projectRoot, req.params.runId);
      try {
        const next = await requestPause(store, events);
        return { run: next };
      } catch (err) {
        if (err instanceof PauseError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );

  // ─── POST /api/runs/:runId/retry ─────────────────────────────────
  // Re-run the same task with the same flags. The original run state
  // stays on disk untouched — the retry gets a fresh runId so the
  // failure trail is preserved. Only allowed for *terminal* runs
  // (failed / aborted / completed / blocked); rejects 409 otherwise
  // so the user can't fork an already-running run.
  app.post<{ Params: { runId: string } }>(
    "/api/runs/:runId/retry",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const stateFile = runStatePath(projectRoot, req.params.runId);
      if (!(await pathExists(stateFile))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      const raw = await readJson<unknown>(stateFile);
      const parsed = runStateSchema.safeParse(raw);
      if (!parsed.success) {
        throw new HttpError(500, "Run state on disk is unreadable.");
      }
      const run = parsed.data;
      if (!isTerminal(run.status)) {
        throw new HttpError(
          409,
          `Run ${req.params.runId} is still ${run.status}. Abort it first, or wait for it to finish.`,
        );
      }
      const argv = deriveRerunArgs(run);
      const bin = resolveAmacoBin();
      try {
        const child = spawn(process.execPath, [bin, ...argv], {
          cwd: projectRoot,
          env: {
            ...process.env,
            AMACO_SPAWNED_BY: "dashboard-retry",
            AMACO_RETRY_OF: req.params.runId,
            NO_COLOR: "1",
          },
          stdio: "ignore",
          detached: true,
        });
        child.unref();
        return {
          ok: true,
          pid: child.pid ?? null,
          argv,
          retryOf: req.params.runId,
          message: `spawned amaco ${formatArgv(argv)}`,
        };
      } catch (err) {
        throw new HttpError(
          500,
          `Failed to spawn retry: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );

  // ─── Run control stream ──────────────────────────────────────────
  // Lets the dashboard queue between-stage directives (notes the next
  // agent should consider, a "compact context" hint that asks the
  // next agent to re-state its understanding). One-shot providers
  // can't accept live REPL commands, so these are deferred and
  // surface in the next stage's prompt. The orchestrator marks each
  // consumed and emits a `control.applied` event.
  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/control",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const all = await listControls(projectRoot, req.params.runId);
      return {
        directives: all,
        pending: pendingControls(all),
      };
    },
  );
  app.post<{ Params: { runId: string }; Body: unknown }>(
    "/api/runs/:runId/control",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const body = req.body as
        | { kind?: "inject-note" | "compact"; body?: string; note?: string }
        | null;
      if (!body || typeof body.kind !== "string") {
        throw new HttpError(400, "kind is required (inject-note or compact).");
      }
      if (body.kind === "inject-note") {
        const text =
          typeof body.body === "string" ? body.body.trim() : "";
        if (!text) throw new HttpError(400, "inject-note needs a body.");
        if (text.length > 8000) throw new HttpError(400, "Note too long (max 8000 chars).");
        const stateFile = runStatePath(projectRoot, req.params.runId);
        if (!(await pathExists(stateFile)))
          throw new HttpError(404, `Run ${req.params.runId} not found.`);
        const directive = await appendControl(projectRoot, req.params.runId, {
          kind: "inject-note",
          body: text,
        });
        return { ok: true, directive };
      }
      if (body.kind === "compact") {
        const stateFile = runStatePath(projectRoot, req.params.runId);
        if (!(await pathExists(stateFile)))
          throw new HttpError(404, `Run ${req.params.runId} not found.`);
        const note =
          typeof body.note === "string" && body.note.trim().length > 0
            ? body.note.trim().slice(0, 2000)
            : undefined;
        const directive = await appendControl(projectRoot, req.params.runId, {
          kind: "compact",
          ...(note ? { note } : {}),
        });
        return { ok: true, directive };
      }
      throw new HttpError(400, "Unknown control kind.");
    },
  );

  app.post<{ Params: { runId: string } }>(
    "/api/runs/:runId/resume",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const stateFile = runStatePath(projectRoot, req.params.runId);
      if (!(await pathExists(stateFile))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      const store = new RunStateStore(projectRoot, req.params.runId);
      const events = new EventLog(projectRoot, req.params.runId);
      try {
        const next = await requestResume(store, events);
        return { run: next };
      } catch (err) {
        if (err instanceof PauseError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
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
