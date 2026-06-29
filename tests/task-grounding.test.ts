import { describe, it, expect } from "vitest";
import { renderTaskGrounding } from "../src/roadmap/task-grounding.js";
import { taskSchema } from "../src/roadmap/roadmap-types.js";
import type { Task } from "../src/roadmap/roadmap-types.js";

const TS = "2026-06-16T00:00:00.000Z";
const ck = (id: string, text: string, status: "pending" | "done") => ({
  id,
  text,
  status,
  createdAt: TS,
  updatedAt: TS,
  commitSha: null,
  promotedTaskId: null,
  objective: "",
  acceptanceCheck: "",
  fileHints: [],
});
const task = (over: Partial<Task>): Task =>
  taskSchema.parse({
    id: "t1",
    title: "Improve logging",
    createdAt: TS,
    updatedAt: TS,
    ...over,
  });

describe("renderTaskGrounding (F1)", () => {
  it("injects the card description + open checklist as a grounding block", () => {
    const out = renderTaskGrounding(
      task({
        description: "Switch the settings handler to structured JSON logs.",
        checklist: [ck("c1", "add a logger", "pending"), ck("c2", "done item", "done")],
      }),
    );
    expect(out).toContain('## From the roadmap card "Improve logging"');
    expect(out).toContain("structured JSON logs");
    expect(out).toContain("- add a logger");
    expect(out).not.toContain("done item"); // completed items are dropped
    expect(out).toContain("not as new"); // framed as grounding, not instructions
  });

  it("returns '' for a title-only card (no false grounding)", () => {
    expect(renderTaskGrounding(task({ description: "", checklist: [] }))).toBe("");
  });

  it("bounds a long description and a long checklist", () => {
    const out = renderTaskGrounding(
      task({
        description: "x".repeat(5000),
        checklist: Array.from({ length: 50 }, (_, i) => ck(`c${i}`, `item ${i}`, "pending")),
      }),
    );
    expect(out.length).toBeLessThan(3000);
    expect(out).toContain("…and 30 more"); // 50 open - 20 shown
  });
});
