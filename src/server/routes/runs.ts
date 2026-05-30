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
  readRunAssurance,
  buildAndWriteRunAssurance,
} from "../../safety/run-assurance.js";
import type { RunSpec } from "../../core/run-launcher.js";
import {
  appendControl,
  listControls,
  pendingControls,
} from "../../core/run-control.js";

export type RunRoutesDeps = {
  projectRoot: string;
};

// Schema for `POST /api/runs`. Mirrors the `vibe run` CLI surface
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
  /** Crew to resolve the flow against (default: project.defaultCrew). */
  crewId: z.string().min(1).max(128).optional(),
  /** Run-wide Profile override applied to every seated step. */
  profileOverride: z.string().min(1).max(128).optional(),
  /** Seat → Role overrides (disambiguate seats filled by >1 crew role). */
  seatRoleOverrides: z
    .record(
      z.string().min(1).max(80),
      z.string().min(1).max(128),
    )
    .optional(),
  readOnly: z.boolean().optional(),
  // Per-run skill ids — merged into every agent's configured skills
  // for this single run. Each id is the slug `loadSkills` accepts.
  skills: z
    .array(z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/))
    .max(64)
    .optional(),
  concise: z.boolean().optional(),
  flow: z
    .object({
      id: z
        .string()
        .min(1)
        .max(80)
        .regex(/^[a-z][a-z0-9-]*$/),
      brief: z.string().max(4000).nullable().optional(),
      contextPolicy: z
        .enum(["balanced", "compact", "artifact-heavy"])
        .optional(),
      stepProfileOverrides: z
        .record(
          z.string().min(1).max(80).regex(/^[a-z][a-z0-9-]*$/),
          z.string().min(1).max(128),
        )
        .optional(),
      skippedOptionalSteps: z
        .array(z.string().min(1).max(80).regex(/^[a-z][a-z0-9-]*$/))
        .max(64)
        .optional(),
    })
    .strict()
    .optional(),
  // Rewind: fork a fresh run from a prior run, resuming at a chosen stage and
  // reusing its upstream artifacts. The launcher loads + validates the seeded
  // artifacts. Mutually exclusive with `flow`.
  resumeFrom: z
    .object({
      sourceRunId: z
        .string()
        .min(1)
        .max(200)
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
      fromStage: z.enum(["architecting", "executing"]),
    })
    .strict()
    .optional(),
});

function resolveRunEntry(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // bundled: dist/run-entry.js sits a few dirs up from this route file
    path.resolve(here, "..", "..", "..", "dist", "run-entry.js"),
    // source layout under src/server/routes
    path.resolve(here, "..", "..", "..", "..", "dist", "run-entry.js"),
    // same dir as the bundled entry
    path.resolve(here, "run-entry.js"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

/**
 * Start a run as a DETACHED CORE process — `node dist/run-entry.js <specFile>`,
 * never the CLI binary. This is the decoupling: the dashboard drives runs
 * through `src/core/run-launcher.ts`, not the `vibe` command surface. The spec
 * is written to a transient file under `.vibestrate/` (keeps argv short); the entry
 * reads it, deletes it, and runs. Detached + unref'd so the run outlives the
 * request and the dashboard, exactly like a CLI run.
 */
async function startDetachedRun(input: {
  projectRoot: string;
  spec: RunSpec;
  spawnedBy: string;
  extraEnv?: Record<string, string>;
}): Promise<number | null> {
  const entry = resolveRunEntry();
  const specPath = path.join(
    input.projectRoot,
    ".vibestrate",
    `.run-spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  await writeJson(specPath, input.spec);
  const child = spawn(process.execPath, [entry, specPath], {
    cwd: input.projectRoot,
    env: {
      ...process.env,
      VIBESTRATE_SPAWNED_BY: input.spawnedBy,
      NO_COLOR: "1",
      ...input.extraEnv,
    },
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  return child.pid ?? null;
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
  // Start a run through the shared core run launcher (NOT the `vibe`
  // CLI binary): a detached `dist/run-entry.js` reads a typed, length-
  // bounded spec and drives the orchestrator. cwd is pinned to the
  // project root the server is serving. UI ⇄ CLI stay decoupled — both
  // reach a run only via core.
  app.post<{ Body: unknown }>("/api/runs", async (req) => {
    const parsed = spawnRunBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.message);
    }
    const body = parsed.data;
    const argv: string[] = ["run", body.task];
    if (body.taskId) argv.push("--task", body.taskId);
    if (body.effort) argv.push("--effort", body.effort);
    if (body.crewId) argv.push("--crew", body.crewId);
    if (body.profileOverride) argv.push("--profile", body.profileOverride);
    for (const [seat, role] of Object.entries(body.seatRoleOverrides ?? {})) {
      argv.push("--seat-role", `${seat}=${role}`);
    }
    if (body.readOnly) argv.push("--read-only");
    if (body.skills && body.skills.length > 0) {
      argv.push("--skills", body.skills.join(","));
    }
    if (body.concise) argv.push("--concise");
    if (body.flow) {
      argv.push("--flow", body.flow.id);
      if (body.flow.brief) argv.push("--flow-brief", body.flow.brief);
      if (body.flow.contextPolicy) {
        argv.push("--flow-context", body.flow.contextPolicy);
      }
      for (const [stepId, profileId] of Object.entries(
        body.flow.stepProfileOverrides ?? {},
      )) {
        argv.push("--step-profile", `${stepId}=${profileId}`);
      }
      for (const stepId of body.flow.skippedOptionalSteps ?? []) {
        argv.push("--flow-skip", stepId);
      }
    }
    if (body.resumeFrom) argv.push("# rewind from", body.resumeFrom.sourceRunId);
    const spec: RunSpec = {
      projectRoot,
      task: body.task,
      taskId: body.taskId ?? null,
      effort: body.effort ?? null,
      crewId: body.crewId ?? null,
      profileOverride: body.profileOverride ?? null,
      seatRoleOverrides: body.seatRoleOverrides ?? {},
      readOnly: body.readOnly ?? false,
      runtimeSkills: body.skills ?? [],
      concise: body.concise ?? false,
      flow: body.flow ?? null,
      resumeFrom: body.resumeFrom ?? null,
    };
    try {
      const pid = await startDetachedRun({
        projectRoot,
        spec,
        spawnedBy: "dashboard",
      });
      return {
        ok: true,
        pid,
        argv,
        message: `started run (equivalent: vibe ${formatArgv(argv)})`,
      };
    } catch (err) {
      throw new HttpError(
        500,
        `Failed to start run: ${err instanceof Error ? err.message : String(err)}`,
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

  // Run Assurance artifact (S5). Returns the persisted verdict; if the run is
  // terminal but the artifact is missing (e.g. an older run), derive it on read.
  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/assurance",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const stateFile = runStatePath(projectRoot, req.params.runId);
      if (!(await pathExists(stateFile))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      const existing = await readRunAssurance(projectRoot, req.params.runId);
      if (existing) return { assurance: existing };
      const derived = await buildAndWriteRunAssurance(
        projectRoot,
        req.params.runId,
      );
      return { assurance: derived };
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
      const spec: RunSpec = {
        projectRoot,
        task: run.task,
        taskId: run.taskId ?? null,
        effort: run.effort ?? null,
        crewId: run.crewId ?? null,
        profileOverride: run.profileOverride ?? null,
        readOnly: run.readOnly ?? false,
        runtimeSkills: run.runtimeSkills ?? [],
        concise: run.concise ?? false,
        // Retry mirrors `deriveRerunArgs`, which re-runs the task without a
        // Flow; keep that behavior rather than silently changing it.
        flow: null,
      };
      try {
        const pid = await startDetachedRun({
          projectRoot,
          spec,
          spawnedBy: "dashboard-retry",
          extraEnv: { VIBESTRATE_RETRY_OF: req.params.runId },
        });
        return {
          ok: true,
          pid,
          argv,
          retryOf: req.params.runId,
          message: `started retry (equivalent: vibe ${formatArgv(argv)})`,
        };
      } catch (err) {
        throw new HttpError(
          500,
          `Failed to start retry: ${err instanceof Error ? err.message : String(err)}`,
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
