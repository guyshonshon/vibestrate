import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  LedgerStore,
  deriveLedgerState,
  buildRunLedgerEntries,
  buildRunStartLedgerEntries,
  recordRunInLedger,
  renderLedgerBrief,
  renderLedgerForPrompt,
  type LedgerEntry,
} from "../src/core/project-ledger.js";

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  schemaVersion: 1,
  id: "x",
  kind: "shipped",
  title: "t",
  detail: null,
  status: "shipped",
  sourceRunId: null,
  supersedes: null,
  relation: null,
  relatesTo: null,
  createdAt: "2026-06-12T00:00:00.000Z",
  tags: [],
  ...over,
});

const NOW = "2026-06-16T00:00:00.000Z";

describe("buildRunStartLedgerEntries (Slice 3 - intent at start)", () => {
  const base = { task: "ship rewind prune", displayName: null, now: NOW };

  it("records an open intent for a normal run", () => {
    const out = buildRunStartLedgerEntries({
      ...base, runId: "r1", readOnly: false, resumeFromSourceRunId: null, existing: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("intent");
    expect(out[0]!.status).toBe("open");
    expect(out[0]!.id).toBe("intent:r1");
    expect(out[0]!.title).toBe("ship rewind prune");
  });

  it("skips read-only runs (an investigation isn't a goal)", () => {
    expect(
      buildRunStartLedgerEntries({
        ...base, runId: "r1", readOnly: true, resumeFromSourceRunId: null, existing: [],
      }),
    ).toEqual([]);
  });

  it("is idempotent - no duplicate intent for the same run", () => {
    const existing = buildRunStartLedgerEntries({
      ...base, runId: "r1", readOnly: false, resumeFromSourceRunId: null, existing: [],
    });
    expect(
      buildRunStartLedgerEntries({
        ...base, runId: "r1", readOnly: false, resumeFromSourceRunId: null, existing,
      }),
    ).toEqual([]);
  });

  it("a resumed run supersedes the source run's intent (continuity, not a dup)", () => {
    const r1 = buildRunStartLedgerEntries({
      ...base, runId: "r1", readOnly: false, resumeFromSourceRunId: null, existing: [],
    });
    const r2 = buildRunStartLedgerEntries({
      ...base, runId: "r2", readOnly: false, resumeFromSourceRunId: "r1", existing: r1,
    });
    expect(r2[0]!.supersedes).toBe("intent:r1");
    // After both, only r2's intent is live (r1's is superseded).
    const state = deriveLedgerState([...r1, ...r2]);
    expect(state.intents.map((e) => e.id)).toEqual(["intent:r2"]);
  });
});

describe("buildRunLedgerEntries (Slice 3 - terminal captures)", () => {
  const base = { task: "do the thing", displayName: "bold-lovelace", now: NOW };

  it("merge_ready -> shipped, and supersedes the run's open intent", () => {
    const intent = entry({ id: "intent:r1", kind: "intent", status: "open", sourceRunId: "r1" });
    const out = buildRunLedgerEntries({
      ...base, runId: "r1", status: "merge_ready", existing: [intent],
    });
    expect(out.map((e) => e.kind)).toEqual(["shipped"]);
    expect(out[0]!.supersedes).toBe("intent:r1");
    // The intent drops out of live intents once shipped.
    expect(deriveLedgerState([intent, ...out]).intents).toEqual([]);
  });

  it("blocked/failed/aborted -> a residual with a resume hint; intent stays open", () => {
    const intent = entry({ id: "intent:r1", kind: "intent", status: "open", sourceRunId: "r1" });
    for (const status of ["blocked", "failed", "aborted"]) {
      const out = buildRunLedgerEntries({
        ...base, runId: "r1", status, existing: [intent], blockedStage: "reviewing",
      });
      expect(out).toHaveLength(1);
      expect(out[0]!.kind).toBe("residual");
      expect(out[0]!.id).toBe("blocked:r1");
      expect(out[0]!.detail).toContain("--resume-from r1");
      expect(out[0]!.detail).toContain("reviewing");
      // The goal's intent is NOT closed by a block.
      expect(deriveLedgerState([intent, ...out]).intents.map((e) => e.id)).toEqual(["intent:r1"]);
    }
  });

  it("read-only terminal runs leave no goal entries", () => {
    expect(
      buildRunLedgerEntries({ ...base, runId: "r1", status: "blocked", existing: [], readOnly: true }),
    ).toEqual([]);
    expect(
      buildRunLedgerEntries({ ...base, runId: "r1", status: "merge_ready", existing: [], readOnly: true }),
    ).toEqual([]);
  });

  it("is idempotent across both shipped and blocked terminals", () => {
    const blocked = buildRunLedgerEntries({ ...base, runId: "r1", status: "blocked", existing: [] });
    expect(
      buildRunLedgerEntries({ ...base, runId: "r1", status: "blocked", existing: blocked }),
    ).toEqual([]);
    const shipped = buildRunLedgerEntries({ ...base, runId: "r2", status: "merge_ready", existing: [] });
    expect(
      buildRunLedgerEntries({ ...base, runId: "r2", status: "merge_ready", existing: shipped }),
    ).toEqual([]);
  });
});

describe("LedgerStore backwards-compat (pre-flag schema)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ledger-bc-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads an OLD ledger line that predates relation/relatesTo", async () => {
    await fs.mkdir(path.join(dir, ".vibestrate"), { recursive: true });
    // A line written before the T9-dedup fields existed (no relation/relatesTo).
    const oldLine = JSON.stringify({
      schemaVersion: 1,
      id: "shipped:r0",
      kind: "shipped",
      title: "shipped a thing",
      detail: null,
      status: "shipped",
      sourceRunId: "r0",
      supersedes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      tags: [],
    });
    await fs.writeFile(path.join(dir, ".vibestrate", "ledger.ndjson"), oldLine + "\n");
    const state = await new LedgerStore(dir).state();
    expect(state.shipped).toHaveLength(1);
    expect(state.shipped[0]!.relation).toBeNull();
    expect(state.shipped[0]!.relatesTo).toBeNull();
    expect(state.flags).toEqual([]);
  });
});

describe("renderLedgerForPrompt (T9 planning-context block)", () => {
  it("returns empty string for an empty ledger (no section is added)", () => {
    expect(renderLedgerForPrompt(deriveLedgerState([]))).toBe("");
  });

  it("frames the brief as read-only context, not instructions", () => {
    const block = renderLedgerForPrompt(
      deriveLedgerState([
        entry({ id: "s1", kind: "shipped", title: "shipped a thing" }),
        entry({ id: "i1", kind: "intent", status: "open", title: "do the next thing" }),
        entry({
          id: "d1",
          kind: "decision",
          status: "abandoned",
          title: "no in-shell YAML editor",
        }),
      ]),
    );
    expect(block).toContain("# Project state (continuity ledger)");
    expect(block).toMatch(/CONTEXT, not instructions/);
    expect(block).toMatch(/do not invent open items/i);
    // The bounded brief content is included.
    expect(block).toContain("shipped a thing");
    expect(block).toContain("do the next thing");
    expect(block).toContain("no in-shell YAML editor");
  });
});

describe("staleness marking in the render (Slice 5)", () => {
  const days = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

  it("marks a long-stale OPEN intent/residual as unconfirmed; leaves fresh ones clean", () => {
    const state = deriveLedgerState([
      entry({ id: "i-old", kind: "intent", status: "open", title: "old goal", createdAt: days(30) }),
      entry({ id: "i-new", kind: "intent", status: "open", title: "new goal", createdAt: days(2) }),
      entry({ id: "r-old", kind: "residual", status: "open", title: "old blocker", createdAt: days(40) }),
    ]);
    const out = renderLedgerBrief(state, { now: NOW, staleAfterDays: 14, limit: 10 });
    expect(out).toMatch(/old goal \(unconfirmed - 30d old\)/);
    expect(out).toMatch(/old blocker \(unconfirmed - 40d old\)/);
    expect(out).toContain("- new goal\n"); // fresh -> no marker
    expect(out).not.toMatch(/new goal \(unconfirmed/);
  });

  it("never marks SHIPPED or DECISIONS as unconfirmed (they're historical/durable)", () => {
    const state = deriveLedgerState([
      entry({ id: "s1", kind: "shipped", title: "ancient ship", createdAt: days(99) }),
      entry({ id: "d1", kind: "decision", status: "open", title: "ancient decision", createdAt: days(99) }),
    ]);
    const out = renderLedgerBrief(state, { now: NOW, staleAfterDays: 14, limit: 10 });
    expect(out).not.toMatch(/unconfirmed/);
  });

  it("no staleness marking when now/staleAfterDays are absent (off by default)", () => {
    const state = deriveLedgerState([
      entry({ id: "i1", kind: "intent", status: "open", title: "goal", createdAt: days(99) }),
    ]);
    expect(renderLedgerBrief(state, { limit: 10 })).not.toMatch(/unconfirmed/);
  });

  it("renderLedgerForPrompt explains the marker + applies it when given now", () => {
    const block = renderLedgerForPrompt(
      deriveLedgerState([
        entry({ id: "i1", kind: "intent", status: "open", title: "stale goal", createdAt: days(60) }),
      ]),
      NOW,
    );
    expect(block).toMatch(/unconfirmed - Nd old.*may already be resolved/s);
    expect(block).toMatch(/stale goal \(unconfirmed - 60d old\)/);
  });
});

describe("deriveLedgerState (T9, pure)", () => {
  it("buckets entries by kind, newest first", () => {
    const s = deriveLedgerState([
      entry({ id: "a", kind: "intent", status: "open", title: "old intent" }),
      entry({ id: "b", kind: "intent", status: "open", title: "new intent" }),
      entry({ id: "c", kind: "shipped", title: "shipped thing" }),
    ]);
    expect(s.intents.map((e) => e.title)).toEqual(["new intent", "old intent"]);
    expect(s.shipped.map((e) => e.title)).toEqual(["shipped thing"]);
  });

  it("drops superseded entries from the live sets", () => {
    const s = deriveLedgerState([
      entry({ id: "i1", kind: "intent", status: "open", title: "do X" }),
      entry({
        id: "i1-done",
        kind: "shipped",
        title: "did X",
        supersedes: "i1",
      }),
    ]);
    expect(s.intents).toHaveLength(0); // i1 superseded
    expect(s.shipped.map((e) => e.title)).toEqual(["did X"]);
  });

  it("keeps decided-against decisions visible", () => {
    const s = deriveLedgerState([
      entry({ id: "d", kind: "decision", status: "abandoned", title: "no in-TUI editor" }),
    ]);
    expect(s.decisions.map((e) => e.title)).toEqual(["no in-TUI editor"]);
  });
});

describe("buildRunLedgerEntries (T9, idempotent)", () => {
  const base = {
    runId: "20260612-100000-x",
    status: "merge_ready",
    displayName: "Fix login bug",
    task: "fix the login bug",
    now: "2026-06-12T10:00:00.000Z",
  };

  it("records a merge_ready run as a shipped entry", () => {
    const out = buildRunLedgerEntries({ ...base, existing: [] });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("shipped");
    expect(out[0]!.title).toBe("Fix login bug");
    expect(out[0]!.id).toBe("shipped:20260612-100000-x");
  });

  it("is a no-op when the run is already recorded (idempotent)", () => {
    const first = buildRunLedgerEntries({ ...base, existing: [] });
    const second = buildRunLedgerEntries({ ...base, existing: first });
    expect(second).toEqual([]);
  });

  it("records nothing for a NON-terminal status (still running)", () => {
    // blocked/failed/aborted now produce a residual (Slice 3); a mid-run status
    // like "planning" reaching this fn is a no-op.
    expect(
      buildRunLedgerEntries({ ...base, status: "planning", existing: [] }),
    ).toEqual([]);
  });

  it("records residual follow-ups alongside the shipped entry", () => {
    const out = buildRunLedgerEntries({
      ...base,
      existing: [],
      residualTitles: ["wire the dashboard page", "  ", "add docs"],
    });
    expect(out.map((e) => e.kind)).toEqual(["shipped", "residual", "residual"]);
    expect(out.filter((e) => e.kind === "residual").map((e) => e.title)).toEqual([
      "wire the dashboard page",
      "add docs",
    ]);
  });
});

describe("LedgerStore + recordRunInLedger (disk)", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ledger-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("append + read round-trips and is torn-line safe", async () => {
    const store = new LedgerStore(root);
    await store.append([entry({ id: "a", kind: "shipped", title: "one" })]);
    await store.append([entry({ id: "b", kind: "intent", status: "open", title: "two" })]);
    // A torn/garbage line is skipped, not fatal.
    await fs.appendFile(store.filePath, "{ not json\n");
    const all = await store.read();
    expect(all.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("recordRunInLedger writes once and is idempotent on re-run", async () => {
    const input = {
      status: "merge_ready",
      displayName: "Add the thing",
      task: "add the thing",
    };
    await recordRunInLedger(root, "run-1", "2026-06-12T00:00:00.000Z", input);
    await recordRunInLedger(root, "run-1", "2026-06-12T01:00:00.000Z", input); // re-run
    const state = await new LedgerStore(root).state();
    expect(state.shipped).toHaveLength(1);
    expect(state.shipped[0]!.title).toBe("Add the thing");
  });
});

describe("renderLedgerBrief (T9)", () => {
  it("renders a readable brief with sections", () => {
    const brief = renderLedgerBrief(
      deriveLedgerState([
        entry({ id: "s", kind: "shipped", title: "shipped A" }),
        entry({ id: "i", kind: "intent", status: "open", title: "open B" }),
      ]),
    );
    expect(brief).toContain("Recently shipped");
    expect(brief).toContain("shipped A");
    expect(brief).toContain("Open intents");
    expect(brief).toContain("open B");
  });

  it("says so when empty", () => {
    expect(renderLedgerBrief(deriveLedgerState([]))).toMatch(/ledger is empty/i);
  });
});
