import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { SupervisorConversationStore } from "../src/supervisor/conversation-store.js";
import { executeProposal } from "../src/supervisor/action-executor.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";

// The project thread is the ONLY one allowed to start a run: inside run X's
// panel "do it" has two referents, so the executor refuses there. That refusal
// meant the run.start success path had never actually been exercised - every
// thread that existed carried a runId.
async function scratch() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-proj-"));
  await fs.mkdir(path.join(root, ".vibestrate"), { recursive: true });
  return root;
}
const config = {
  supervisorControl: { autonomy: "act" as const },
  budget: { dailyUsd: 5 },
} as never;

describe("the project-level thread", () => {
  it("is what listing without a runId returns, and never a run's thread", async () => {
    const root = await scratch();
    const store = new SupervisorConversationStore(root);
    const project = await store.create(null);
    await store.forRun("run-abc");
    const all = await store.list();
    expect(all.filter((t) => t.runId === null).map((t) => t.id)).toEqual([project.id]);
  });

  it("starts a run, where a run-scoped thread refuses to", async () => {
    const root = await scratch();
    const task = await new RoadmapService(root).addTask({ title: "landing page" });
    const started: string[] = [];
    const proposal = {
      intent: "run.start" as const,
      targetId: task.id,
      title: "",
      items: [],
      echo: "build the landing page now",
      rationale: "",
    };
    const base = {
      projectRoot: root,
      config,
      userMessage: "build the landing page now",
      proposal,
      allowedTargetIds: [task.id],
      startRun: async ({ taskId }: { taskId: string }) => {
        started.push(taskId);
        return "run-minted-1";
      },
    };

    const inRun = await executeProposal({ ...base, scopedRunId: "run-abc" });
    expect(inRun.action?.ok, "a run's own thread must not start another run").toBe(false);
    expect(started, "and must not reach the launcher").toEqual([]);

    const inProject = await executeProposal({ ...base, scopedRunId: null });
    expect(inProject.action?.ok, "the project thread starts it").toBe(true);
    expect(started).toEqual([task.id]);
    expect(inProject.action?.targetId, "records the RUN id, not the task id").toBe(
      "run-minted-1",
    );
  });
});
