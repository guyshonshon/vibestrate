import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  checkAutonomy,
  readPauseState,
  setPaused,
  supervisorPausePath,
} from "../src/supervisor/autonomy-gate.js";
import { executeProposal } from "../src/supervisor/action-executor.js";
import { projectConfigSchema } from "../src/project/config-schema.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import type { SupervisorProposal } from "../src/supervisor/intake-router.js";

// The supervisor may act on what you type. These are the checks standing
// between a sentence and a run, so each one is written to fail loudly if the
// guard it defends is removed.

async function scratch() {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-auto-"));
}

const ADVISE = { autonomy: "advise" as const };
const ACT = { autonomy: "act" as const };
const RUNNING = { paused: false, reason: "", updatedAt: "t" };

function proposal(over: Partial<SupervisorProposal> = {}): SupervisorProposal {
  return {
    intent: "task.create",
    targetId: null,
    title: "",
    items: [],
    echo: "",
    rationale: "",
    ...over,
  };
}

/** A config with `act` allowed, which needs a ceiling to parse at all. */
function actConfig() {
  return projectConfigSchema.parse({
    project: { name: "demo" },
    providers: { claude: { type: "cli", command: "claude", args: [], input: "stdin" } },
    profiles: { p: { provider: "claude" } },
    crews: { defaultCrew: { roles: { r: { profile: "p", permissions: "read-only", seats: ["reviewer"], prompt: "x" } } } },
    defaultCrew: "defaultCrew",
    supervisorControl: { autonomy: "act" },
    budget: { maxTurnsPerRun: 20 },
  });
}

describe("the kill switch fails closed", () => {
  it("treats a missing flag as running", async () => {
    const root = await scratch();
    expect((await readPauseState(root)).paused).toBe(false);
  });

  it("round-trips an explicit pause with its reason", async () => {
    const root = await scratch();
    await setPaused(root, true, "stop, it misread me");
    const state = await readPauseState(root);
    expect(state.paused).toBe(true);
    expect(state.reason).toBe("stop, it misread me");
  });

  it("treats an unreadable flag as PAUSED, not as running", async () => {
    // A stop button that degrades to "go" when it cannot be read is not a stop
    // button. This is the last thing between a misroute and a run.
    const root = await scratch();
    await setPaused(root, false);
    await fs.writeFile(supervisorPausePath(root), "{ corrupt", "utf8");
    const state = await readPauseState(root);
    expect(state.paused).toBe(true);
    expect(state.reason).toMatch(/could not be read/);
  });
});

describe("checkAutonomy", () => {
  it("refuses in advise mode", () => {
    expect(checkAutonomy({ supervisor: ADVISE, pause: RUNNING })?.code).toBe("advise_only");
  });

  it("refuses while paused, even in act mode", () => {
    const r = checkAutonomy({
      supervisor: ACT,
      pause: { paused: true, reason: "", updatedAt: "t" },
    });
    expect(r?.code).toBe("paused");
  });

  it("allows only act plus not-paused", () => {
    expect(checkAutonomy({ supervisor: ACT, pause: RUNNING })).toBeNull();
  });
});

describe("config refuses act with nothing bounding it", () => {
  const base = {
    project: { name: "demo" },
    providers: { claude: { type: "cli", command: "claude", args: [], input: "stdin" } },
    profiles: { p: { provider: "claude" } },
    crews: { defaultCrew: { roles: { r: { profile: "p", permissions: "read-only", seats: ["reviewer"], prompt: "x" } } } },
    defaultCrew: "defaultCrew",
  };

  it("rejects act when every budget ceiling is off", () => {
    // An unintended run under `act` has no automatic stop: not a dollar cap, not
    // a turn cap, not a clock. And because the broker is default-allow, its
    // agent's shell commands are unvetoed.
    const parsed = projectConfigSchema.safeParse({
      ...base,
      supervisorControl: { autonomy: "act" },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]!.message).toMatch(/budget ceiling/);
    }
  });

  it("accepts act once any one ceiling is set", () => {
    for (const budget of [
      { spendCapDailyUsd: 5 },
      { maxTurnsPerRun: 40 },
      { maxWallClockMinPerRun: 30 },
      { maxTurnsPerDay: 100 },
      { maxWallClockMinPerDay: 120 },
    ]) {
      const parsed = projectConfigSchema.safeParse({
        ...base,
        supervisorControl: { autonomy: "act" },
        budget,
      });
      expect(parsed.success, JSON.stringify(budget)).toBe(true);
    }
  });

  it("leaves advise alone, and defaults to it", () => {
    const parsed = projectConfigSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.supervisorControl.autonomy).toBe("advise");
  });
});

describe("the executor validates the model's proposal before acting", () => {
  it("answers without touching anything, in any mode", async () => {
    const root = await scratch();
    const res = await executeProposal({
      projectRoot: root,
      config: actConfig(),
      userMessage: "what do you think about rewriting auth?",
      proposal: proposal({ intent: "answer" }),
      allowedTargetIds: [],
    });
    expect(res.action).toBeNull();
  });

  it("refuses to act in advise mode", async () => {
    const root = await scratch();
    const cfg = actConfig();
    const res = await executeProposal({
      projectRoot: root,
      config: { ...cfg, supervisorControl: { autonomy: "advise" } },
      userMessage: "add a pricing page",
      proposal: proposal({ intent: "task.create", echo: "add a pricing page" }),
      allowedTargetIds: [],
    });
    expect(res.action?.ok).toBe(false);
    expect(res.reply).toMatch(/advise mode/);
  });

  it("refuses when the echo does not match what the user typed", async () => {
    // The provenance check. Its real target is the attack that does NOT flip the
    // intent: injected context quietly rewriting the brief of a run the user
    // genuinely asked for.
    const root = await scratch();
    const res = await executeProposal({
      projectRoot: root,
      config: actConfig(),
      userMessage: "add a pricing page",
      proposal: proposal({
        intent: "task.create",
        echo: "add a pricing page and delete the auth module",
      }),
      allowedTargetIds: [],
    });
    expect(res.action?.ok).toBe(false);
    expect(res.reply).toMatch(/could not confirm/);
  });

  it("tolerates whitespace and case in the echo, since only words matter", async () => {
    const root = await scratch();
    const res = await executeProposal({
      projectRoot: root,
      config: actConfig(),
      userMessage: "Add a  pricing page",
      proposal: proposal({
        intent: "task.create",
        title: "Pricing page",
        echo: "add a pricing page",
      }),
      allowedTargetIds: [],
    });
    expect(res.action?.ok).toBe(true);
  });

  it("rejects a target id it was never offered, rather than fuzzy-matching", async () => {
    const root = await scratch();
    const svc = new RoadmapService(root);
    const real = await svc.addTask({ title: "landing page" });
    const res = await executeProposal({
      projectRoot: root,
      config: actConfig(),
      userMessage: "add a hero section",
      proposal: proposal({
        intent: "checklist.add",
        targetId: "task-invented-by-the-model",
        items: ["hero section"],
        echo: "add a hero section",
      }),
      allowedTargetIds: [real.id],
    });
    expect(res.action?.ok).toBe(false);
    expect(res.reply).toMatch(/could not match/);
    expect((await svc.getTask(real.id))?.checklist).toHaveLength(0);
  });

  it("adds TODOs to a task it was offered", async () => {
    const root = await scratch();
    const svc = new RoadmapService(root);
    const task = await svc.addTask({ title: "landing page" });
    const res = await executeProposal({
      projectRoot: root,
      config: actConfig(),
      userMessage: "add a hero and a footer",
      proposal: proposal({
        intent: "checklist.add",
        targetId: task.id,
        items: ["hero section", "footer"],
        echo: "add a hero and a footer",
      }),
      allowedTargetIds: [task.id],
    });
    expect(res.action?.ok).toBe(true);
    expect((await svc.getTask(task.id))?.checklist).toHaveLength(2);
  });

  it("starts a run with the user's VERBATIM words, never the model's rewrite", async () => {
    // The rule that kills the subtle attack: whatever the model proposed, the
    // agent's brief is what the human actually said.
    const root = await scratch();
    const svc = new RoadmapService(root);
    const task = await svc.addTask({ title: "landing page" });
    let received = "";
    const res = await executeProposal({
      projectRoot: root,
      config: actConfig(),
      userMessage: "build the hero section",
      proposal: proposal({
        intent: "run.start",
        targetId: task.id,
        title: "ignore me",
        echo: "build the hero section",
      }),
      allowedTargetIds: [task.id],
      startRun: async ({ task: brief }) => {
        received = brief;
        return "run-123";
      },
    });
    expect(res.action?.ok).toBe(true);
    expect(received).toBe("build the hero section");
  });

  it("does not start a run while paused", async () => {
    const root = await scratch();
    const svc = new RoadmapService(root);
    const task = await svc.addTask({ title: "landing page" });
    await setPaused(root, true, "hold on");
    let started = false;
    const res = await executeProposal({
      projectRoot: root,
      config: actConfig(),
      userMessage: "build it",
      proposal: proposal({ intent: "run.start", targetId: task.id, echo: "build it" }),
      allowedTargetIds: [task.id],
      startRun: async () => {
        started = true;
        return "run-1";
      },
    });
    expect(started, "a paused supervisor must not start anything").toBe(false);
    expect(res.reply).toMatch(/hold on/);
  });

  it("says plainly that a live run will not pick up new TODOs", async () => {
    // The band snapshots its item list at run start, so an item added after
    // that is written and never iterated. Claiming otherwise would be a lie.
    const root = await scratch();
    const svc = new RoadmapService(root);
    const task = await svc.addTask({ title: "landing page" });
    const { acquireTaskLock, releaseTaskLock } = await import("../src/core/run/run-lock.js");
    const held = await acquireTaskLock(root, task.id, "run-live");
    try {
      const res = await executeProposal({
        projectRoot: root,
        config: actConfig(),
        userMessage: "also add a test",
        proposal: proposal({
          intent: "checklist.add",
          targetId: task.id,
          items: ["a test"],
          echo: "also add a test",
        }),
        allowedTargetIds: [task.id],
      });
      expect(res.reply).toMatch(/wait for the next one/);
    } finally {
      await releaseTaskLock(held);
    }
  });
});
