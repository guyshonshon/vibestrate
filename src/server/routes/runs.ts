import path from "node:path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { readDirSafe, pathExists, readText } from "../../utils/fs.js";
import {
  projectRunsDir,
  runStatePath,
  runEventsPath,
  runDir,
  runArtifactsDir,
} from "../../utils/paths.js";
import { runStateSchema } from "../../core/state-machine.js";
import { applyTransition, isTerminal, RunStateStore, renameRun } from "../../core/state-machine.js";
import { EventLog, type VibestrateEvent } from "../../core/event-log.js";
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
import { buildRunAudit } from "../../core/run-audit.js";
import { deriveEngagement } from "../../core/run-engagement.js";
import { readdir } from "node:fs/promises";
import type { RunSpec } from "../../core/run-launcher.js";
import { contextSourceSchema } from "../../core/context-source-schema.js";
import { resolveRestorePreview, RunLaunchError } from "../../core/run-launcher.js";
import {
  planSnapshotPrune,
  executeSnapshotPrune,
} from "../../core/phase-snapshots.js";
import { makeUniqueRunId } from "../../utils/run-id.js";
import { startDetachedRun } from "../../core/detached-run.js";
import {
  appendControl,
  listControls,
  pendingControls,
} from "../../core/run-control.js";

export type RunRoutesDeps = {
  projectRoot: string;
};

// Schema for `POST /api/runs/snapshots/prune` (the dashboard half of
// `vibe runs prune`). All fields optional; `dryRun` previews without deleting.
const pruneBody = z
  .object({
    keep: z.number().int().min(0).optional(),
    orphans: z.boolean().optional(),
    runId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();

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
  unattended: z.boolean().optional(),
  // Pick-up execution: iterate the linked task's checklist through the flow's
  // checklistSegment (needs taskId + a checklist-aware flow like "pickup").
  checklistMode: z.enum(["continuous", "step"]).nullable().optional(),
  // Per-run skill ids - merged into every agent's configured skills
  // for this single run. Each id is the slug `loadSkills` accepts.
  skills: z
    .array(z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/))
    .max(64)
    .optional(),
  concise: z.boolean().optional(),
  // Flow parameter values (T11), name -> raw string. Validated against the
  // flow's declared `params` at run start; secrets recorded redacted.
  params: z
    .record(z.string().min(1).max(60), z.string().max(2000))
    .optional(),
  // Orchestrator flow selection: true = select even if a default is set;
  // false = skip selection (use the default flow); omitted = normal precedence.
  // The chosen flow is recorded on the run (selection.json + workflow.selected).
  select: z.boolean().nullable().optional(),
  // Supervisor persona (judgment posture) for this run; default = defaultPersona.
  persona: z.string().min(1).max(40).optional(),
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
  // Context sources (files/URLs) injected into every agent prompt. Path-guarded
  // to project root + run worktree, secret-redacted, and (for url) SSRF-guarded
  // at materialization in core - the same guarantees the CLI/linked-task path
  // already has. RunSpec supported this; the route used to drop it silently.
  contextSources: z.array(contextSourceSchema).max(32).optional(),
  // Rewind: fork a fresh run from a prior run, resuming at a chosen stage and
  // reusing its upstream artifacts. The launcher loads + validates the seeded
  // artifacts. May be combined with `flow` (the shape roadmap link does exactly
  // this: it resumes the shape run at "executing" to seed scope/spec/
  // architecture/risks). Adding "planning" re-syncs this body with core
  // ResumeStage (orchestrator.ts) and the restore-preview enum above, which
  // already list it - it was the only stage the launch enum was missing.
  resumeFrom: z
    .object({
      sourceRunId: z
        .string()
        .min(1)
        .max(200)
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
      fromStage: z.enum([
        "planning",
        "architecting",
        "executing",
        "reviewing",
        "fixing",
        "verifying",
      ]),
    })
    .strict()
    .optional(),
});

export async function registerRunsRoutes(
  app: FastifyInstance,
  deps: RunRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/runs", async () => {
    const runsDir = projectRunsDir(projectRoot);
    const ids = await readDirSafe(runsDir);
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
    // Order by start time, not the id string - run ids are now short
    // docker-style names with no chronological prefix.
    runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return { runs };
  });

  // ─── GET /api/runs/:id/restore-preview?stage=reviewing ────────────────
  // Non-destructive dry-run of a downstream rewind (ISSUE-001 P2): the file
  // overwrite/remove set the restore would apply, so the user sees the blast
  // radius before launching. Read-only; never starts a run. `preview: null`
  // means there's nothing to restore for that stage (upstream stage, or no
  // snapshot) - the rewind would resume into a fresh worktree.
  app.get<{ Params: { id: string }; Querystring: { stage?: string } }>(
    "/api/runs/:id/restore-preview",
    async (req) => {
      assertSafeRunId(req.params.id);
      const stage = z
        .enum(["planning", "architecting", "executing", "reviewing", "fixing", "verifying"])
        .safeParse(req.query.stage);
      if (!stage.success) {
        throw new HttpError(400, "stage must be a valid resume stage");
      }
      try {
        const preview = await resolveRestorePreview(projectRoot, {
          sourceRunId: req.params.id,
          fromStage: stage.data,
        });
        return { preview };
      } catch (err) {
        if (err instanceof RunLaunchError) throw new HttpError(404, err.message);
        throw err;
      }
    },
  );

  // ─── POST /api/runs ───────────────────────────────────────────────
  // Start a run through the shared core run launcher (NOT the `vibe`
  // CLI binary): a detached `dist/run-entry.js` reads a typed, length-
  // bounded spec and drives the orchestrator. cwd is pinned to the
  // project root the server is serving. UI ⇄ CLI stay decoupled - both
  // reach a run only via core.
  app.post<{ Body: unknown }>("/api/runs", async (req) => {
    const parsed = spawnRunBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.message);
    }
    const body = parsed.data;
    const argv: string[] = ["run", body.task];
    if (body.taskId) argv.push("--task", body.taskId);
    if (body.crewId) argv.push("--crew", body.crewId);
    if (body.profileOverride) argv.push("--profile", body.profileOverride);
    for (const [seat, role] of Object.entries(body.seatRoleOverrides ?? {})) {
      argv.push("--seat-role", `${seat}=${role}`);
    }
    if (body.readOnly) argv.push("--read-only");
    if (body.unattended) argv.push("--unattended");
    if (body.checklistMode) argv.push("--checklist", body.checklistMode);
    if (body.skills && body.skills.length > 0) {
      argv.push("--skills", body.skills.join(","));
    }
    if (body.concise) argv.push("--concise");
    for (const [name, value] of Object.entries(body.params ?? {})) {
      argv.push("--param", `${name}=${value}`);
    }
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
    for (const src of body.contextSources ?? []) {
      argv.push("--context", src.ref);
    }
    if (body.resumeFrom) argv.push("# rewind from", body.resumeFrom.sourceRunId);
    // Assign the run id here so the response can carry it - the UI navigates
    // to the run screen immediately instead of toasting and waiting for polls.
    const runId = makeUniqueRunId(projectRoot);
    const spec: RunSpec = {
      projectRoot,
      task: body.task,
      runId,
      taskId: body.taskId ?? null,
      crewId: body.crewId ?? null,
      profileOverride: body.profileOverride ?? null,
      seatRoleOverrides: body.seatRoleOverrides ?? {},
      readOnly: body.readOnly ?? false,
      unattended: body.unattended ?? false,
      checklistMode: body.checklistMode ?? null,
      runtimeSkills: body.skills ?? [],
      concise: body.concise ?? false,
      select: body.select ?? null,
      persona: body.persona ?? null,
      flow: body.flow ?? null,
      contextSources: body.contextSources,
      resumeFrom: body.resumeFrom ?? null,
    };
    // C1: best-effort flow-complexity advice (non-blocking, informational).
    let flowAdvice: { level: string; message: string | null } | null = null;
    // Slice 4: fan-out cost warning for graph flows (also non-blocking).
    let fanoutAdvice: { maxFanout: number; message: string | null } | null =
      null;
    if (body.flow) {
      try {
        const { findFlowById } = await import(
          "../../flows/catalog/flow-discovery.js"
        );
        const { inferFlowComplexity, flowComplexityAdvice, flowFanoutAdvice } =
          await import("../../flows/runtime/flow-complexity.js");
        const { classifyEffort } = await import("../../core/effort-heuristic.js");
        const found = await findFlowById(projectRoot, body.flow.id);
        if (found) {
          const advice = flowComplexityAdvice({
            flowComplexity: inferFlowComplexity(found.definition),
            taskEffort: classifyEffort({ text: body.task, files: [] }).effort,
            flowLabel: found.definition.label,
          });
          if (advice.message) {
            flowAdvice = { level: advice.level, message: advice.message };
          }
          const fanout = flowFanoutAdvice(found.definition);
          if (fanout.message) {
            fanoutAdvice = { maxFanout: fanout.maxFanout, message: fanout.message };
          }
        }
      } catch {
        // advisory only - never block a launch.
      }
    }
    try {
      const pid = await startDetachedRun({
        spec,
        spawnedBy: "dashboard",
      });
      return {
        ok: true,
        pid,
        runId,
        argv,
        message: `started run (equivalent: vibe ${formatArgv(argv)})`,
        flowAdvice,
        fanoutAdvice,
      };
    } catch (err) {
      throw new HttpError(
        500,
        `Failed to start run: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  // ─── POST /api/runs/snapshots/prune ───────────────────────────────────
  // The dashboard half of `vibe runs prune` (ISSUE-001 P1). Explicit, user-
  // triggered deletion of rewind-snapshot refs: orphans (run dir gone), beyond
  // a keep-N window, or one run. `dryRun: true` returns the plan WITHOUT
  // deleting (the UI previews, the user confirms, then re-posts to execute).
  // FAIL CLOSED: the run-dir read uses a real readdir; a failure aborts rather
  // than passing an empty set that would mark every ref an orphan.
  app.post<{ Body: unknown }>("/api/runs/snapshots/prune", async (req) => {
    const body = pruneBody.safeParse(req.body ?? {});
    if (!body.success) throw new HttpError(400, body.error.message);
    const { keep, orphans, runId, dryRun } = body.data;
    // The network surface must NOT default to a destructive scope on an empty
    // body (defense-in-depth behind the CSRF hook): require an explicit scope.
    if (keep === undefined && orphans === undefined && runId === undefined) {
      throw new HttpError(400, "Specify a prune scope: orphans, keep, or runId.");
    }
    let existingRunIds: Set<string>;
    try {
      existingRunIds = new Set(await readdir(projectRunsDir(projectRoot)));
    } catch (err) {
      throw new HttpError(
        500,
        `Couldn't read the runs directory; refusing to prune: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    let plan;
    try {
      // No implicit destructive default on the network surface - the caller
      // already supplied an explicit scope above.
      plan = await planSnapshotPrune(projectRoot, existingRunIds, {
        keep: keep ?? null,
        orphans: orphans ?? false,
        runId: runId ?? null,
      });
    } catch (err) {
      throw new HttpError(500, err instanceof Error ? err.message : String(err));
    }
    if (dryRun || plan.runs.length === 0) {
      return { plan, pruned: null };
    }
    const pruned = await executeSnapshotPrune(projectRoot, plan.runs);
    return { plan, pruned };
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

  // Run audit tree (flow steps + per-step attempts + control events). Derived on
  // demand from the recorded evidence; read-only.
  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/audit",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const stateFile = runStatePath(projectRoot, req.params.runId);
      if (!(await pathExists(stateFile))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      return { audit: await buildRunAudit(projectRoot, req.params.runId) };
    },
  );

  // The orchestrator-engagement lane: an ordered, classified list of the moments
  // the orchestrator engaged (judgment vs code-enforced gate). Derived live from
  // the append-only event log so it works during a run and after; read-only.
  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/engagement",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const eventsFile = runEventsPath(projectRoot, req.params.runId);
      if (!(await pathExists(eventsFile))) return { engagement: [] };
      const text = await readText(eventsFile);
      const events: VibestrateEvent[] = [];
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line) as VibestrateEvent);
        } catch {
          // skip a malformed line
        }
      }
      return { engagement: deriveEngagement(events) };
    },
  );

  // The flow arbitration ledger (findings / responses / resolutions / decision
  // summary), when the flow ran arbitration steps. The Supervisor panel reads
  // it; null when the flow has no arbitration.
  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/arbitration",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const file = path.join(
        runDir(projectRoot, req.params.runId),
        "arbitration.json",
      );
      const raw = await readText(file).catch(() => null);
      if (raw === null) return { arbitration: null };
      try {
        return { arbitration: JSON.parse(raw) };
      } catch {
        return { arbitration: null };
      }
    },
  );

  // The orchestrator's flow-selection record (Slice 2), when the run's flow was
  // selected. null for forced/default runs (their flow is in flow.json).
  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/selection",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const file = path.join(runArtifactsDir(projectRoot, req.params.runId), "selection.json");
      const raw = await readText(file).catch(() => null);
      if (raw === null) return { selection: null };
      try {
        return { selection: JSON.parse(raw) };
      } catch {
        return { selection: null };
      }
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
  // saying* - the missing link between "spawned" and "artifact
  // written". Listed first, then per-stream full read + SSE tail.
  // Stream names are slash-separated since the recursive lister (P2): nested
  // flow streams report as e.g. `flows/implement/prompt`. Each segment must
  // start alphanumeric (which rejects `.`/`..` traversal segments), and the
  // store re-guards the resolved path against escapes (isPathInside).
  const STREAM_NAME_RE =
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}(\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}){0,8}$/;
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

  // Pause / resume - write-side toggles on state.pauseRequested. The
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

  // ─── POST /api/runs/:runId/rename ────────────────────────────────
  // Give a run a friendly display name (T6). The runId stays the stable
  // identifier; this only updates the cosmetic label.
  app.post<{ Params: { runId: string }; Body: unknown }>(
    "/api/runs/:runId/rename",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const stateFile = runStatePath(projectRoot, req.params.runId);
      if (!(await pathExists(stateFile))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      const body = (req.body ?? {}) as { displayName?: unknown };
      if (typeof body.displayName !== "string") {
        throw new HttpError(400, "Body must include a string `displayName`.");
      }
      try {
        const next = await renameRun(
          projectRoot,
          req.params.runId,
          body.displayName,
        );
        return { run: next };
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ─── POST /api/runs/:runId/retry ─────────────────────────────────
  // Re-run the same task with the same flags. The original run state
  // stays on disk untouched - the retry gets a fresh runId so the
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
   * files (older runs may not have all of them) and caps events at 10k -
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
