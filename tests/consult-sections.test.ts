import { describe, it, expect } from "vitest";
import {
  computeConsultSections,
  renderConsultSections,
  consultSectionsEmpty,
} from "../src/consult/consult-sections.js";
import { deriveLedgerState, type LedgerEntry } from "../src/core/project-ledger.js";

const e = (over: Partial<LedgerEntry>): LedgerEntry => ({
  schemaVersion: 1,
  id: "x",
  kind: "intent",
  title: "t",
  detail: null,
  status: "open",
  sourceRunId: null,
  supersedes: null,
  relation: null,
  relatesTo: null,
  createdAt: "2026-06-12T00:00:00.000Z",
  tags: [],
  ...over,
});

const ledger = deriveLedgerState([
  e({ id: "i1", kind: "intent", title: "Ship the merge advisor" }),
  e({ id: "m1", kind: "mention", title: "Maybe a Graphy integration" }),
  e({ id: "r1", kind: "residual", title: "Wire the dashboard ledger page" }),
  e({ id: "d1", kind: "decision", status: "abandoned", title: "No in-TUI YAML editor" }),
]);

describe("computeConsultSections (T10, deterministic)", () => {
  const input = {
    ledger,
    roadmapTasks: [
      { title: "Add params to flows", status: "backlog" },
      { title: "Ship the merge advisor", status: "ready" }, // dup of ledger intent
      { title: "Old thing", status: "done" }, // closed -> excluded
    ],
    recentRuns: [
      { displayName: "Ledger foundation", task: "build the ledger", status: "merge_ready" },
      { displayName: null, task: "fix a bug", status: "blocked" },
    ],
  };

  it("computes the four sections from ledger + roadmap + runs", () => {
    const s = computeConsultSections(input);
    expect(s.recentActivity).toEqual([
      "merge_ready: Ledger foundation",
      "blocked: fix a bug",
    ]);
    // open intents = ledger intents + open roadmap tasks, deduped (the merge
    // advisor appears once), done tasks excluded.
    expect(s.openIntents).toEqual([
      "Ship the merge advisor",
      "Add params to flows",
    ]);
    expect(s.mentionedNeverWorked).toEqual(["Maybe a Graphy integration"]);
    // next steps lead with concrete follow-ups, then open intents.
    expect(s.suggestedNextSteps[0]).toBe("Wire the dashboard ledger page");
    expect(s.suggestedNextSteps).toContain("Ship the merge advisor");
  });

  it("is deterministic - same inputs => identical output", () => {
    expect(computeConsultSections(input)).toEqual(computeConsultSections(input));
  });

  it("excludes closed roadmap tasks from open intents", () => {
    expect(computeConsultSections(input).openIntents).not.toContain("Old thing");
  });

  it("renders only non-empty sections", () => {
    const md = renderConsultSections(computeConsultSections(input));
    expect(md).toContain("### Recent activity");
    expect(md).toContain("### Suggested next steps");
  });

  it("reports empty when nothing is computed", () => {
    const empty = computeConsultSections({
      ledger: deriveLedgerState([]),
      roadmapTasks: [],
      recentRuns: [],
    });
    expect(consultSectionsEmpty(empty)).toBe(true);
    expect(renderConsultSections(empty)).toBe("");
  });
});
