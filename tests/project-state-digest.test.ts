import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  renderProjectStateDigest,
  writeProjectStateDigest,
  projectStatePath,
} from "../src/core/context/project-state-digest.js";
import {
  LedgerStore,
  deriveLedgerState,
  type LedgerEntry,
} from "../src/core/context/project-ledger.js";

const ts = "2026-06-16T00:00:00.000Z";

function entry(over: Partial<LedgerEntry>): LedgerEntry {
  return {
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
    createdAt: ts,
    tags: [],
    ...over,
  };
}

describe("renderProjectStateDigest (pure)", () => {
  it("is self-describing as auto-derived and points at VIBESTRATE.md", () => {
    const state = deriveLedgerState([entry({ id: "shipped:r1", title: "shipped a thing" })]);
    const out = renderProjectStateDigest(state, ts);
    expect(out).toContain("# Project state (auto-derived)");
    expect(out).toContain("regenerated each run");
    expect(out).toContain("VIBESTRATE.md");
    expect(out).toContain("shipped a thing");
    expect(out).toContain(ts);
  });

  it("renders open intents, decisions, and residuals from the ledger", () => {
    const state = deriveLedgerState([
      entry({ id: "i1", kind: "intent", status: "open", title: "ship rewind prune" }),
      entry({ id: "d1", kind: "decision", status: "open", title: "use Sec-Fetch-Site for CSRF" }),
      entry({ id: "res1", kind: "residual", status: "open", title: "vibe runs prune UI keep-N" }),
    ]);
    const out = renderProjectStateDigest(state, ts);
    expect(out).toContain("ship rewind prune");
    expect(out).toContain("use Sec-Fetch-Site for CSRF");
    expect(out).toContain("vibe runs prune UI keep-N");
  });

  it("is deterministic - same state + timestamp => identical body", () => {
    const state = deriveLedgerState([entry({ id: "a", title: "a" })]);
    expect(renderProjectStateDigest(state, ts)).toBe(renderProjectStateDigest(state, ts));
  });
});

describe("writeProjectStateDigest (atomic, redacting, regenerable)", () => {
  it("writes STATE.md from the ledger and is regenerable", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-state-"));
    try {
      const store = new LedgerStore(dir);
      await store.append([entry({ id: "shipped:r1", title: "first slice" })]);
      await writeProjectStateDigest(dir, ts);
      const file = projectStatePath(dir);
      const first = await fs.readFile(file, "utf8");
      expect(first).toContain("first slice");
      // Regenerate from the same ledger -> identical (same timestamp).
      await writeProjectStateDigest(dir, ts);
      expect(await fs.readFile(file, "utf8")).toBe(first);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("does NOT create a file for an empty ledger (no noise)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-state-"));
    try {
      await writeProjectStateDigest(dir, ts);
      await expect(fs.stat(projectStatePath(dir))).rejects.toThrow();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("redacts secret-shaped content on the way out", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-state-"));
    try {
      const store = new LedgerStore(dir);
      await store.append([
        entry({
          id: "d1",
          kind: "decision",
          status: "open",
          title: "rotate the key",
          detail: "old key was sk-ant-api03-abcdef012345678901234567890123456789012345678901234567890123",
        }),
      ]);
      await writeProjectStateDigest(dir, ts);
      const body = await fs.readFile(projectStatePath(dir), "utf8");
      expect(body).not.toContain("sk-ant-api03-abcdef012345678901234567890123456789012345678901234567890123");
      expect(body).toContain("[REDACTED"); // marker is [REDACTED:<name>]
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("recordRunInLedger regenerates STATE.md at the run boundary", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-state-"));
    try {
      const { recordRunInLedger } = await import("../src/core/context/project-ledger.js");
      await recordRunInLedger(dir, "run-1", ts, {
        status: "merge_ready",
        displayName: "bold-lovelace",
        task: "do the thing",
      });
      const body = await fs.readFile(projectStatePath(dir), "utf8");
      expect(body).toContain("bold-lovelace");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
