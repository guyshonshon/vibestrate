import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ApprovalService } from "../../src/core/run/approval-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { RunStateStore } from "../../src/core/state-machine.js";
import { queueGuidance } from "../../src/core/run/guidance-service.js";
import { findFlowById } from "../../src/flows/catalog/flow-discovery.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

/**
 * A note queued on a live run has to reach the agent's prompt.
 *
 * `drainGuidanceFor` had a single call site, inside the graph frontier - and no
 * built-in flow declares `needs`, so every shipped flow took the linear walk
 * and nothing ever read `pendingGuidance`. `vibe steer` accepted the note,
 * reported it queued, and dropped it. The unit test at the time hand-fed
 * fixture arrays to the pure splitter, so it stayed green throughout.
 *
 * This runs the real `default` flow end to end and asserts the note lands in a
 * real prompt. It is aimed at `verify`, the last of the eight steps, so the
 * assertion does not depend on how fast the queue beats the walk.
 */
const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

const NOTE = "PROVE-STEER-LANDS: prefer the existing helper over a new one";

/** Records every prompt it is handed, so the test can look for the note. */
const PROVIDER = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  fs.appendFileSync(path.join(__dirname, "prompts.log"), prompt + "\\n----\\n");
  if (prompt.includes("Vibestrate Agent: reviewer")) console.log("# Review\\n\\nDECISION: APPROVED");
  else if (prompt.includes("Vibestrate Agent: verifier")) console.log("# Verification\\n\\nVERIFICATION: PASSED");
  else console.log("# Output\\n\\nNothing to change.");
});
`;

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-steer-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"steer"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const providerPath = path.join(dir, "fake-provider.js");
  await fs.writeFile(providerPath, PROVIDER, { mode: 0o755 });
  await fs.chmod(providerPath, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [providerPath], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

describe("a queued note reaches the prompt on a linear flow", () => {
  it("lands the note on the step it names", async () => {
    const dir = await makeRepo();
    const discovered = await findFlowById(dir, "default");
    const loaded = await loadConfig(dir);
    const snapshot = resolveFlow({
      flow: discovered!.definition,
      source: discovered!.source,
      config: loaded.config,
      task: `Exercise steering ${Math.random().toString(36).slice(2, 8)}.`,
    });
    // `default` is linear - no step declares `needs` - which is exactly the
    // path that used to have no drain.
    expect(snapshot.steps.some((s) => (s.needs?.length ?? 0) > 0)).toBe(false);

    const orchestrator = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: snapshot.task,
      flow: snapshot,
      isGitRepo: true,
      readOnly: false,
      onProgress: () => {},
    });

    let queued = false;
    let approvedOnce = false;
    const poll = setInterval(() => {
      void (async () => {
        const runs = await fs.readdir(path.join(dir, ".vibestrate", "runs")).catch(() => []);
        const runId = runs[0];
        if (!runId) return;
        if (!queued) {
          // Aimed at the LAST step (review, on the lean default), so the note is
          // waiting long before the walk gets there - not a scheduler race.
          await queueGuidance(new RunStateStore(dir, runId), NOTE, { stepId: "review" })
            .then(() => {
              queued = true;
            })
            .catch(() => {});
        }
        if (!approvedOnce) {
          const approvals = new ApprovalService(dir, runId);
          const pending = await approvals.firstPending();
          if (pending) {
            approvedOnce = true;
            await approvals.approve({ approvalId: pending.id });
          }
        }
      })();
    }, 20);

    let result;
    try {
      result = await orchestrator.run();
    } finally {
      clearInterval(poll);
    }

    expect(queued, "the note was never queued, so this proves nothing").toBe(true);
    const prompts = await fs.readFile(path.join(dir, "prompts.log"), "utf8");
    expect(prompts, "the queued note never reached any prompt").toContain(NOTE);

    const eventsRaw = await fs.readFile(
      path.join(dir, ".vibestrate", "runs", result.runId, "events.ndjson"),
      "utf8",
    );
    const events = eventsRaw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { type: string; data?: Record<string, unknown> });
    const guided = events.filter((e) => e.type === "flow.step.guided");
    expect(guided.length, "no flow.step.guided event was recorded").toBeGreaterThan(0);
    expect(guided[0]?.data?.stepId).toBe("review");
    // The note text must never enter the event log.
    expect(eventsRaw).not.toContain(NOTE);

    // Drained exactly once - nothing left waiting, and no resurrection by a
    // later whole-object write.
    const finalState = await new RunStateStore(dir, result.runId).read();
    expect(finalState.pendingGuidance ?? []).toEqual([]);
  }, 180_000);
});
