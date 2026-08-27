import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { registerRunsRoutes } from "../src/server/routes/runs.js";
import { HttpError } from "../src/server/security.js";
import { formatError } from "../src/core/error-format.js";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

/**
 * The dashboard's steer control, at the route level.
 *
 * This is the first HTTP route whose body becomes an agent's instruction, so
 * the guards matter more than the happy path: an unknown step id must be
 * refused rather than queued into a note that waits forever, and the note text
 * must never reach the event log.
 */
const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

let dir: string;
let app: ReturnType<typeof Fastify>;
const RUN_ID = "run-steer-1";

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-steer-route-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"steer-route"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const store = new RunStateStore(dir, RUN_ID);
  const base = createInitialState({
    runId: RUN_ID,
    task: "t",
    projectRoot: dir,
    worktreePath: null,
    branchName: null,
    maxReviewLoops: 1,
  });
  await store.write({
    ...base,
    status: "executing",
    flow: {
      flowId: "default",
      flowVersion: 1,
      label: "Default",
      snapshotPath: "flow.json",
      steps: [
        { id: "implement", label: "Implement", kind: "build", status: "running" },
        { id: "review", label: "Review", kind: "review", status: "pending" },
      ],
    } as never,
  });
  app = Fastify({ logger: false });
  // Mirrors the real server's handler so HttpError maps to its status code.
  app.setErrorHandler(async (error: unknown, _req: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      const f = formatError(error);
      return reply.code(error.statusCode).send({ error: error.message, kind: f.kind, title: f.title });
    }
    const f = formatError(error);
    return reply.code(500).send({ error: f.detail, kind: f.kind, title: f.title });
  });
  await registerRunsRoutes(app, { projectRoot: dir });
  await app.ready();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const post = (body: unknown, runId = RUN_ID) =>
  app.inject({ method: "POST", url: `/api/runs/${runId}/steer`, payload: body });

describe("POST /api/runs/:runId/steer", () => {
  it("queues a note and reports whether anything is running to read it", async () => {
    const res = await post({ note: "use the existing retry helper", stepId: "review" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { queued: number; live: boolean };
    // Order-independent: the suite runs with a random seed, so assert on this
    // note rather than on the queue depth another test may have raised.
    expect(body.queued).toBeGreaterThanOrEqual(1);
    // No orchestrator owns this fixture run, and `live` is a real process
    // probe, so it must say so rather than implying the note will land.
    expect(body.live).toBe(false);
    const state = await new RunStateStore(dir, RUN_ID).read();
    const mine = (state.pendingGuidance ?? []).find((g) =>
      g.note.includes("use the existing retry helper"),
    );
    expect(mine?.stepId).toBe("review");
  });

  it("refuses a step the run does not have, instead of queuing it forever", async () => {
    const res = await post({ note: "x", stepId: "no-such-step" });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain("no-such-step");
  });

  it("refuses a non-string note", async () => {
    expect((await post({ note: 42 })).statusCode).toBe(400);
    expect((await post({})).statusCode).toBe(400);
  });

  it("refuses an empty note", async () => {
    expect((await post({ note: "   " })).statusCode).toBe(400);
  });

  it("404s for a run that does not exist", async () => {
    expect((await post({ note: "x" }, "run-does-not-exist")).statusCode).toBe(404);
  });

  it("keeps the note text out of the event log", async () => {
    const secretish = "STEER-NOTE-SHOULD-NOT-BE-LOGGED";
    expect((await post({ note: secretish })).statusCode).toBe(200);
    const events = await fs.readFile(
      path.join(dir, ".vibestrate", "runs", RUN_ID, "events.ndjson"),
      "utf8",
    );
    expect(events).toContain("run.guidance.queued");
    expect(events, "the steer note leaked into the event log").not.toContain(secretish);
  });
});
