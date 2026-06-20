import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ApprovalService } from "../../src/core/approval-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { findFlowById } from "../../src/flows/catalog/flow-discovery.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import {
  parseFlowJsonContract,
  renderFlowOutputContractNotes,
} from "../../src/flows/runtime/flow-arbitration.js";
import {
  FLOW_PLAN_HANDOFF_CONTRACT,
  FLOW_QUESTIONS_CONTRACT,
  flowArchitectureHandoffOutputSchema,
  flowExecutionHandoffOutputSchema,
  flowPlanHandoffOutputSchema,
  flowQuestionsOutputSchema,
} from "../../src/flows/schemas/flow-output-contracts.js";
import type { ResolvedFlowStep } from "../../src/flows/schemas/flow-schema.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// A panel-review provider that emits VALID structured handoff JSON for the
// builder spine (planner -> architect -> implementer), free-form findings for
// the reviewers, and an APPROVED arbiter verdict. The stepId in each contract
// is taken from the prompt so it matches what the orchestrator expects.
const VALID_HANDOFF_PROVIDER = `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  const role = (prompt.match(/Vibestrate Agent: (\\w+)/) || [])[1] || "";
  const stepMatch = prompt.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const stepId = stepMatch ? stepMatch[1] : "";
  const emit = (obj) => {
    console.log("VIBESTRATE_FLOW_OUTPUT:");
    console.log(JSON.stringify(obj));
    console.log("VIBESTRATE_FLOW_OUTPUT_END");
  };
  if (role === "planner") {
    emit({ contract: "vibestrate.flow.plan-handoff.v1", stepId, goal: "Ship the change.", steps: [{ id: "step-1", title: "Edit code", detail: "do it" }], filesLikelyTouched: ["src/x.ts"], risks: ["low"] });
    return;
  }
  if (role === "architect") {
    emit({ contract: "vibestrate.flow.architecture-handoff.v1", stepId, approach: "Direct edit.", decisions: [{ id: "d-1", decision: "Keep it simple" }], componentsTouched: ["src/x.ts"] });
    return;
  }
  if (role === "executor") {
    emit({ contract: "vibestrate.flow.execution-handoff.v1", stepId, summary: "Implemented.", steps: [{ planStepId: "step-1", title: "Edit code", status: "done" }], filesChanged: [] });
    return;
  }
  if (role === "reviewer") { console.log("# Findings (" + stepId + ")\\n\\nNo blocking issues from this lens."); return; }
  if (role === "verifier") { console.log("# Arbiter verdict\\n\\nDECISION: APPROVED"); return; }
  console.log("# Output");
});
`;

// Same, but the planner emits a plan-handoff missing the required `steps` field,
// so parsing fails and the run must degrade gracefully (raw output kept, a
// parse event recorded), still reaching a verdict.
const BAD_PLAN_PROVIDER = `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  const role = (prompt.match(/Vibestrate Agent: (\\w+)/) || [])[1] || "";
  const stepMatch = prompt.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const stepId = stepMatch ? stepMatch[1] : "";
  const emit = (obj) => {
    console.log("VIBESTRATE_FLOW_OUTPUT:");
    console.log(JSON.stringify(obj));
    console.log("VIBESTRATE_FLOW_OUTPUT_END");
  };
  if (role === "planner") {
    emit({ contract: "vibestrate.flow.plan-handoff.v1", stepId, goal: "No steps provided." });
    return;
  }
  if (role === "architect") {
    emit({ contract: "vibestrate.flow.architecture-handoff.v1", stepId, approach: "Direct edit." });
    return;
  }
  if (role === "executor") {
    emit({ contract: "vibestrate.flow.execution-handoff.v1", stepId, summary: "Implemented." });
    return;
  }
  if (role === "reviewer") { console.log("# Findings (" + stepId + ")\\n\\nNo blocking issues."); return; }
  if (role === "verifier") { console.log("# Arbiter verdict\\n\\nDECISION: APPROVED"); return; }
  console.log("# Output");
});
`;

async function makeRepo(providerScript: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-handoff-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"handoff"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const providerPath = path.join(dir, "fake-provider.js");
  await fs.writeFile(providerPath, providerScript, { mode: 0o755 });
  await fs.chmod(providerPath, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [providerPath], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

type RunEvent = { type: string; data?: Record<string, unknown> };

async function runPanel(
  projectRoot: string,
): Promise<{ runId: string; status: string; events: RunEvent[] }> {
  const discovered = await findFlowById(projectRoot, "panel-review");
  const loaded = await loadConfig(projectRoot);
  const snapshot = resolveFlow({
    flow: discovered!.definition,
    source: discovered!.source,
    config: loaded.config,
    task: `Exercise handoff contracts ${Math.random().toString(36).slice(2, 8)}.`,
  });
  const orchestrator = new Orchestrator({
    projectRoot,
    config: loaded.config,
    rules: loaded.rules,
    task: snapshot.task,
    flow: snapshot,
    isGitRepo: true,
    readOnly: false,
    onProgress: () => {},
  });
  let approvedOnce = false;
  const interval = setInterval(async () => {
    if (approvedOnce) return;
    const runs = await fs
      .readdir(path.join(projectRoot, ".vibestrate", "runs"))
      .catch(() => []);
    const runId = runs[0];
    if (!runId) return;
    const approvals = new ApprovalService(projectRoot, runId);
    const pending = await approvals.firstPending();
    if (!pending) return;
    approvedOnce = true;
    await approvals.approve({ approvalId: pending.id });
  }, 50);
  let result: Awaited<ReturnType<Orchestrator["run"]>>;
  try {
    result = await orchestrator.run();
  } finally {
    clearInterval(interval);
  }
  const eventsRaw = await fs.readFile(
    path.join(projectRoot, ".vibestrate", "runs", result.runId, "events.ndjson"),
    "utf8",
  );
  const events = eventsRaw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RunEvent);
  return { runId: result.runId, status: result.state.status, events };
}

describe("structured handoff contracts (schemas + render)", () => {
  it("validates a well-formed plan handoff and rejects a missing required field", () => {
    const ok = flowPlanHandoffOutputSchema.safeParse({
      contract: FLOW_PLAN_HANDOFF_CONTRACT,
      stepId: "plan",
      goal: "Do the thing",
      steps: [{ id: "step-1", title: "First" }],
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      // Defaulted arrays are present even when omitted.
      expect(ok.data.risks).toEqual([]);
      expect(ok.data.assumptions).toEqual([]);
    }

    const missingSteps = flowPlanHandoffOutputSchema.safeParse({
      contract: FLOW_PLAN_HANDOFF_CONTRACT,
      stepId: "plan",
      goal: "No steps",
    });
    expect(missingSteps.success).toBe(false);
  });

  it("accepts architecture and execution handoffs with only their required fields", () => {
    expect(
      flowArchitectureHandoffOutputSchema.safeParse({
        contract: "vibestrate.flow.architecture-handoff.v1",
        stepId: "architecture",
        approach: "An approach.",
      }).success,
    ).toBe(true);
    expect(
      flowExecutionHandoffOutputSchema.safeParse({
        contract: "vibestrate.flow.execution-handoff.v1",
        stepId: "implement",
        summary: "Did it.",
      }).success,
    ).toBe(true);
  });

  it("renders a handoff contract example into the step prompt with the step id", () => {
    const step = {
      id: "plan",
      outputs: ["plan-handoff"],
    } as unknown as ResolvedFlowStep;
    const notes = renderFlowOutputContractNotes(step);
    expect(notes).toContain("- plan-handoff:");
    expect(notes).toContain(FLOW_PLAN_HANDOFF_CONTRACT);
    expect(notes).toContain('"stepId":"plan"');
    expect(notes).not.toContain("__stepId__");
  });

  it("round-trips a handoff through parseFlowJsonContract from a marker block", () => {
    const text = [
      "Here is my plan.",
      "VIBESTRATE_FLOW_OUTPUT:",
      JSON.stringify({
        contract: FLOW_PLAN_HANDOFF_CONTRACT,
        stepId: "plan",
        goal: "Ship it",
        steps: [{ id: "step-1", title: "Edit" }],
      }),
      "VIBESTRATE_FLOW_OUTPUT_END",
    ].join("\n");
    const parsed = parseFlowJsonContract({
      text,
      schema: flowPlanHandoffOutputSchema,
      expectedStepId: "plan",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.output.goal).toBe("Ship it");

    const wrongStep = parseFlowJsonContract({
      text,
      schema: flowPlanHandoffOutputSchema,
      expectedStepId: "architecture",
    });
    expect(wrongStep.ok).toBe(false);
  });
});

describe("structured handoff contracts (panel-review end to end)", () => {
  it("parses the builder spine handoffs into canonical artifacts + parsed events", async () => {
    const projectRoot = await makeRepo(VALID_HANDOFF_PROVIDER);
    const { runId, status, events } = await runPanel(projectRoot);
    expect(status).toBe("merge_ready");

    const parsedEvents = events.filter((e) => e.type === "flow.handoff.parsed");
    const byToken = (token: string) =>
      parsedEvents.find((e) => e.data?.token === token);
    for (const token of [
      "plan-handoff",
      "architecture-handoff",
      "execution-handoff",
    ]) {
      const ev = byToken(token);
      expect(ev, `expected a parsed event for ${token}`).toBeTruthy();
      expect(ev!.data?.parsed).toBe(true);
    }

    const artifactsDir = path.join(
      projectRoot,
      ".vibestrate",
      "runs",
      runId,
      "artifacts",
    );
    const planJson = JSON.parse(
      await fs.readFile(
        path.join(artifactsDir, "flows", "plan", "plan-handoff.json"),
        "utf8",
      ),
    );
    expect(planJson.contract).toBe(FLOW_PLAN_HANDOFF_CONTRACT);
    expect(planJson.stepId).toBe("plan");
    expect(planJson.steps[0].id).toBe("step-1");

    // The architecture + execution canonical artifacts exist too.
    await expect(
      fs.access(
        path.join(
          artifactsDir,
          "flows",
          "architecture",
          "architecture-handoff.json",
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(
        path.join(artifactsDir, "flows", "implement", "execution-handoff.json"),
      ),
    ).resolves.toBeUndefined();
  }, 60_000);

  it("degrades gracefully when a handoff does not parse (raw kept, parse event recorded)", async () => {
    const projectRoot = await makeRepo(BAD_PLAN_PROVIDER);
    const { runId, status, events } = await runPanel(projectRoot);
    // Still completes - a bad handoff is not fatal.
    expect(status).toBe("merge_ready");

    const planEvent = events.find(
      (e) => e.type === "flow.handoff.parsed" && e.data?.token === "plan-handoff",
    );
    expect(planEvent).toBeTruthy();
    expect(planEvent!.data?.parsed).toBe(false);
    expect(String(planEvent!.data?.message ?? "")).not.toHaveLength(0);

    // No canonical artifact was written for the failed handoff.
    const artifactsDir = path.join(
      projectRoot,
      ".vibestrate",
      "runs",
      runId,
      "artifacts",
    );
    await expect(
      fs.access(path.join(artifactsDir, "flows", "plan", "plan-handoff.json")),
    ).rejects.toBeTruthy();
  }, 60_000);
});

describe("parseFlowJsonContract robustness (real model formatting)", () => {
  // The exact failure that broke the Shape intake live: gpt-5.5 fenced the JSON
  // inside the VIBESTRATE_FLOW_OUTPUT markers, nested the contract under a single
  // "questions" key, and used an underscore id ("catalog_source").
  const fencedNestedUnderscore = [
    "Here are the gap questions.",
    "",
    "VIBESTRATE_FLOW_OUTPUT:",
    "```json",
    JSON.stringify(
      {
        questions: {
          contract: FLOW_QUESTIONS_CONTRACT,
          stepId: "intake",
          questions: [
            { id: "accounts", question: "Sign in?", why: "auth", kind: "choice", options: ["yes", "no"], category: "users" },
            { id: "catalog_source", question: "Where do products come from?", why: "data", kind: "text", options: [], category: "data" },
          ],
        },
      },
      null,
      2,
    ),
    "```",
    "VIBESTRATE_FLOW_OUTPUT_END",
  ].join("\n");

  it("strips the code fence, unwraps the single-key wrapper, and accepts underscore ids", () => {
    const r = parseFlowJsonContract({
      text: fencedNestedUnderscore,
      schema: flowQuestionsOutputSchema,
      expectedStepId: "intake",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output.questions.map((q) => q.id)).toEqual(["accounts", "catalog_source"]);
    }
  });

  it("still accepts the plain, unwrapped contract shape", () => {
    const plain = `VIBESTRATE_FLOW_OUTPUT:\n${JSON.stringify({
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "intake",
      questions: [{ id: "a", question: "q", why: "w", kind: "text", options: [], category: "scope" }],
    })}\nVIBESTRATE_FLOW_OUTPUT_END`;
    const r = parseFlowJsonContract({ text: plain, schema: flowQuestionsOutputSchema, expectedStepId: "intake" });
    expect(r.ok).toBe(true);
  });

  it("does not unwrap into an invalid shape (the schema is still the gate)", () => {
    const wrong = `VIBESTRATE_FLOW_OUTPUT:\n${JSON.stringify({
      questions: { nope: true },
    })}\nVIBESTRATE_FLOW_OUTPUT_END`;
    const r = parseFlowJsonContract({ text: wrong, schema: flowQuestionsOutputSchema, expectedStepId: "intake" });
    expect(r.ok).toBe(false);
  });
});
