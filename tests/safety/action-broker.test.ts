import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  DefaultActionBroker,
  readActionLog,
  type ActionEvaluator,
  type ActionRequest,
} from "../../src/safety/action-broker.js";
import { runActionsPath } from "../../src/utils/paths.js";

let projectRoot: string | null = null;
afterEach(async () => {
  if (projectRoot) await fs.rm(projectRoot, { recursive: true, force: true });
  projectRoot = null;
});

async function tempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-broker-"));
  projectRoot = dir;
  return dir;
}

const spawnReq = (over: Partial<ActionRequest> = {}): ActionRequest => ({
  runId: "run-1",
  roleId: "builder",
  kind: "provider.spawn",
  subject: { providerId: "claude" },
  proposedBy: "system",
  ...over,
});

describe("DefaultActionBroker.decide", () => {
  it("allows by default when no evaluators are wired", async () => {
    const root = await tempProject();
    const broker = new DefaultActionBroker(root, "run-1");
    const decision = await broker.decide(spawnReq());
    expect(decision.effect).toBe("allow");
    expect(decision.ruleIds).toEqual([]);
  });

  it("first deny wins over a later require_approval", async () => {
    const root = await tempProject();
    const approve: ActionEvaluator = () => ({
      effect: "require_approval",
      ruleIds: ["needs-ok"],
      reason: "review first",
    });
    const deny: ActionEvaluator = () => ({
      effect: "deny",
      ruleIds: ["blocked"],
      reason: "not allowed",
    });
    // deny is listed after the approval, but deny still wins.
    const broker = new DefaultActionBroker(root, "run-1", {
      evaluators: [approve, deny],
    });
    const decision = await broker.decide(spawnReq());
    expect(decision.effect).toBe("deny");
    if (decision.effect === "deny") expect(decision.reason).toBe("not allowed");
  });

  it("escalates to require_approval when an evaluator asks and none deny", async () => {
    const root = await tempProject();
    const approve: ActionEvaluator = (req) =>
      req.kind === "provider.spawn"
        ? { effect: "require_approval", ruleIds: ["r1"], reason: "spawn gate" }
        : null;
    const broker = new DefaultActionBroker(root, "run-1", {
      evaluators: [() => null, approve],
    });
    const decision = await broker.decide(spawnReq());
    expect(decision.effect).toBe("require_approval");
  });

  it("decide never writes to the action log", async () => {
    const root = await tempProject();
    const broker = new DefaultActionBroker(root, "run-1");
    await broker.decide(spawnReq());
    // Nothing recorded — decide is side-effect-free.
    expect(await readActionLog(root, "run-1")).toEqual([]);
  });
});

describe("DefaultActionBroker.record + readActionLog", () => {
  it("appends one NDJSON record per call and reads them back in order", async () => {
    const root = await tempProject();
    const broker = new DefaultActionBroker(root, "run-1");
    const req = spawnReq();
    await broker.record(req, { effect: "allow", ruleIds: [] }, {
      ok: true,
      summary: "exited 0",
      data: { exitCode: 0 },
    });
    await broker.record(
      spawnReq({ roleId: "reviewer" }),
      { effect: "deny", ruleIds: ["x"], reason: "nope" },
      null,
    );

    const log = await readActionLog(root, "run-1");
    expect(log).toHaveLength(2);
    expect(log[0]!.request.roleId).toBe("builder");
    expect(log[0]!.decision.effect).toBe("allow");
    expect(log[0]!.evidence?.ok).toBe(true);
    expect(log[1]!.request.roleId).toBe("reviewer");
    expect(log[1]!.decision.effect).toBe("deny");
    expect(log[1]!.evidence).toBeNull();
    // Every record carries a timestamp.
    expect(typeof log[0]!.timestamp).toBe("string");
  });

  it("readActionLog returns [] when no log exists and tolerates a torn line", async () => {
    const root = await tempProject();
    expect(await readActionLog(root, "ghost")).toEqual([]);

    const broker = new DefaultActionBroker(root, "run-1");
    await broker.record(spawnReq(), { effect: "allow", ruleIds: [] });
    // Simulate a half-written final line (crash mid-append).
    await fs.appendFile(runActionsPath(root, "run-1"), '{"timestamp":"partial');
    const log = await readActionLog(root, "run-1");
    expect(log).toHaveLength(1);
    expect(log[0]!.decision.effect).toBe("allow");
  });
});
