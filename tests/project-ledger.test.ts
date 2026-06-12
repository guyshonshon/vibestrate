import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  LedgerStore,
  deriveLedgerState,
  buildRunLedgerEntries,
  recordRunInLedger,
  renderLedgerBrief,
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
  createdAt: "2026-06-12T00:00:00.000Z",
  tags: [],
  ...over,
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

  it("does not record a non-merge_ready run", () => {
    expect(
      buildRunLedgerEntries({ ...base, status: "blocked", existing: [] }),
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
