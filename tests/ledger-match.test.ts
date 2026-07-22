import { describe, it, expect } from "vitest";
import {
  tokenSimilarity,
  findLedgerFlags,
  freshFlagMatches,
  buildFlagEntries,
  renderFlagsForPrompt,
} from "../src/core/context/ledger-match.js";
import { deriveLedgerState, type LedgerEntry } from "../src/core/context/project-ledger.js";

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
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
  evidence: [],
  ...over,
});

describe("tokenSimilarity (pure, deterministic)", () => {
  it("scores strong overlap high and unrelated text ~0", () => {
    expect(tokenSimilarity("Docker sandbox execution backend", "Docker sandbox backend")).toBeGreaterThan(0.6);
    expect(tokenSimilarity("merge advisor window", "rename the runstatus union")).toBe(0);
  });
  it("ignores stopwords + action verbs so 'add X' ~ 'X'", () => {
    // "add"/"the"/"a" are dropped; "healthz endpoint" carries the signal.
    expect(tokenSimilarity("Add a healthz endpoint", "healthz endpoint")).toBeGreaterThan(0.6);
  });
  it("is symmetric and self-similar = 1", () => {
    expect(tokenSimilarity("cost ledger migrate jsonl", "migrate jsonl cost ledger")).toBe(1);
  });
});

describe("findLedgerFlags", () => {
  it("flags a task that duplicates an open intent", () => {
    const state = deriveLedgerState([
      entry({ id: "i1", kind: "intent", status: "open", title: "Docker sandbox execution backend" }),
    ]);
    const flags = findLedgerFlags({ title: "build the Docker sandbox execution backend", state });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.relation).toBe("duplicate");
    expect(flags[0]!.target.id).toBe("i1");
  });

  it("flags a task that resembles already-shipped work", () => {
    const state = deriveLedgerState([
      entry({ id: "s1", kind: "shipped", status: "shipped", title: "parameterized flows typed params" }),
    ]);
    const flags = findLedgerFlags({ title: "parameterized flows with typed params", state });
    expect(flags.some((f) => f.relation === "duplicate" && f.target.id === "s1")).toBe(true);
  });

  it("flags a task that conflicts with a decided-against decision", () => {
    const state = deriveLedgerState([
      entry({ id: "d1", kind: "decision", status: "abandoned", title: "no in-shell YAML editor" }),
    ]);
    const flags = findLedgerFlags({ title: "build an in-shell YAML editor", state });
    expect(flags.some((f) => f.relation === "conflict" && f.target.id === "d1")).toBe(true);
  });

  it("returns nothing for an unrelated task (no false positive)", () => {
    const state = deriveLedgerState([
      entry({ id: "i1", kind: "intent", status: "open", title: "Docker sandbox execution backend" }),
      entry({ id: "d1", kind: "decision", status: "abandoned", title: "no in-shell YAML editor" }),
    ]);
    expect(findLedgerFlags({ title: "add a dark mode toggle to the dashboard", state })).toEqual([]);
  });

  it("returns at most one flag per relation (no spam)", () => {
    const state = deriveLedgerState([
      entry({ id: "i1", kind: "intent", status: "open", title: "Docker sandbox execution backend" }),
      entry({ id: "i2", kind: "intent", status: "open", title: "Docker sandbox backend execution" }),
    ]);
    const flags = findLedgerFlags({ title: "Docker sandbox execution backend", state });
    expect(flags.filter((f) => f.relation === "duplicate")).toHaveLength(1);
  });

  it("does NOT flag distinct work that shares only generic change-verbs", () => {
    const state = deriveLedgerState([
      entry({ id: "i1", kind: "intent", status: "open", title: "refactor the auth module" }),
    ]);
    // shares "refactor" + "module" (both stopwords now) - the real subjects
    // differ, so no false-positive duplicate.
    expect(findLedgerFlags({ title: "refactor the billing module", state })).toEqual([]);
  });
});

describe("freshFlagMatches (cross-run dedup, pure)", () => {
  it("drops matches that already have an open flag for the same (relation, target)", () => {
    const state = deriveLedgerState([
      entry({ id: "i1", kind: "intent", status: "open", title: "Docker sandbox execution backend" }),
    ]);
    const matches = findLedgerFlags({ title: "Docker sandbox execution backend", state });
    expect(matches).toHaveLength(1);
    // First run: nothing existing -> the match is fresh.
    expect(freshFlagMatches(matches, [])).toHaveLength(1);
    // Second run: an open flag for (duplicate, i1) already exists -> deduped.
    const existing = buildFlagEntries({ matches, runId: "run-1", taskTitle: "x", now: "t" });
    expect(freshFlagMatches(matches, existing)).toEqual([]);
  });
});

describe("buildFlagEntries", () => {
  it("makes append-only flag entries that link the target (never modify it)", () => {
    const target = entry({ id: "i1", kind: "intent", title: "Docker sandbox backend" });
    const state = deriveLedgerState([target]);
    const matches = findLedgerFlags({ title: "Docker sandbox backend now", state });
    const entries = buildFlagEntries({ matches, runId: "run-9", taskTitle: "Docker sandbox backend now", now: "t" });
    expect(entries[0]).toMatchObject({
      kind: "flag",
      relation: "duplicate",
      relatesTo: "i1",
      sourceRunId: "run-9",
      status: "open",
      id: "flag:run-9:i1", // deterministic
    });
    // The flag surfaces in state.flags after a derive; the target is untouched.
    const next = deriveLedgerState([target, ...entries]);
    expect(next.flags).toHaveLength(1);
    expect(next.intents.map((e) => e.id)).toContain("i1");
  });
});

describe("renderFlagsForPrompt", () => {
  it("frames flags as a heads-up, not a blocker", () => {
    const state = deriveLedgerState([
      entry({ id: "d1", kind: "decision", status: "abandoned", title: "no in-shell YAML editor" }),
    ]);
    const block = renderFlagsForPrompt(findLedgerFlags({ title: "in-shell YAML editor", state }));
    expect(block).toContain("# Continuity flags");
    expect(block).toMatch(/NOT blockers/);
    expect(block).toMatch(/DECIDED-AGAINST/);
  });
  it("returns empty for no matches", () => {
    expect(renderFlagsForPrompt([])).toBe("");
  });
});
