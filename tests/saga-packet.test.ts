import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  buildStepPacket,
  readFreshFileReads,
  type StepPacketItem,
} from "../src/feature/packet.js";

const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";

function baseItem(over: Partial<StepPacketItem> = {}): StepPacketItem {
  return {
    text: "create the auth module",
    objective: "Add a login() that validates credentials.",
    acceptanceCheck: "pnpm test passes and login rejects bad input.",
    index: 2,
    total: 5,
    fileHints: [],
    ...over,
  };
}

describe("buildStepPacket", () => {
  it("assembles the five sections in documented priority order", () => {
    const out = buildStepPacket({
      goal: "Ship a working auth subsystem.",
      priorItemsContext:
        "# Completed checklist items (carried forward)\n1. scaffold - done",
      accumulatedDiff: "diff --git a/scaffold.ts b/scaffold.ts\n+export const x = 1;",
      fileReads: [{ path: "src/auth.ts", content: "export function login() {}" }],
      item: baseItem(),
    });

    const goalAt = out.indexOf("Feature goal");
    const priorAt = out.indexOf("Prior step outcomes");
    const diffAt = out.indexOf("Accumulated diff so far");
    const freshAt = out.indexOf("Fresh code read");
    const stepAt = out.indexOf("This step");

    expect(goalAt).toBeGreaterThanOrEqual(0);
    expect(priorAt).toBeGreaterThan(goalAt);
    expect(diffAt).toBeGreaterThan(priorAt);
    expect(freshAt).toBeGreaterThan(diffAt);
    expect(stepAt).toBeGreaterThan(freshAt);
  });

  it("includes the goal, objective, acceptance check, and item text", () => {
    const out = buildStepPacket({
      goal: "Ship a working auth subsystem.",
      priorItemsContext: "",
      accumulatedDiff: "",
      fileReads: [],
      item: baseItem(),
    });
    expect(out).toContain("Ship a working auth subsystem.");
    expect(out).toContain("Add a login() that validates credentials.");
    expect(out).toContain("pnpm test passes and login rejects bad input.");
    expect(out).toContain("create the auth module");
  });

  it("redacts a token-shaped secret from BOTH the diff and a fresh file read", () => {
    const out = buildStepPacket({
      goal: "Ship it.",
      priorItemsContext: "",
      accumulatedDiff: `diff --git a/c.ts b/c.ts\n+const k = "${AWS_KEY}";`,
      fileReads: [{ path: "src/leak.ts", content: `const k = "${AWS_KEY}";` }],
      item: baseItem(),
    });
    expect(out).not.toContain(AWS_KEY);
    expect(out).toContain("[REDACTED:AWS access key id]");
  });

  it("redacts a secret placed in the goal or item fields too", () => {
    const out = buildStepPacket({
      goal: `Ship it with ${AWS_KEY}.`,
      priorItemsContext: "",
      accumulatedDiff: "",
      fileReads: [],
      item: baseItem({ objective: `Use ${AWS_KEY} for now.` }),
    });
    expect(out).not.toContain(AWS_KEY);
  });

  it("degrades cleanly with empty prior outcomes, empty diff, and empty fileHints", () => {
    const out = buildStepPacket({
      goal: "Ship it.",
      priorItemsContext: "",
      accumulatedDiff: "",
      fileReads: [],
      item: baseItem({ fileHints: [], objective: "", acceptanceCheck: "" }),
    });
    // No crash, goal + step always present.
    expect(out).toContain("Feature goal");
    expect(out).toContain("This step");
    // Empty optional sections are omitted entirely (no empty-section noise).
    expect(out).not.toContain("Prior step outcomes");
    expect(out).not.toContain("Accumulated diff so far");
    expect(out).not.toContain("Fresh code read");
  });

  it("renders the invariants ledger between goal and prior outcomes (M3)", () => {
    const out = buildStepPacket({
      goal: "Ship it.",
      priorItemsContext: "1. a - done",
      accumulatedDiff: "",
      fileReads: [],
      invariants: ["all API responses use snake_case"],
      item: baseItem(),
    });
    const invAt = out.indexOf("## Invariants");
    const goalAt = out.indexOf("Feature goal");
    const priorAt = out.indexOf("Prior step outcomes");
    expect(invAt).toBeGreaterThan(goalAt);
    expect(invAt).toBeLessThan(priorAt);
    expect(out).toContain("all API responses use snake_case");
  });

  it("omits the invariants section entirely when the ledger is empty", () => {
    const out = buildStepPacket({
      goal: "Ship it.",
      priorItemsContext: "1. a - done",
      accumulatedDiff: "",
      fileReads: [],
      invariants: [],
      item: baseItem(),
    });
    expect(out).not.toContain("## Invariants");
  });

  it("bounds each fresh file read and the diff so a marathon step can't blow the packet", () => {
    const huge = "x".repeat(50_000);
    const out = buildStepPacket({
      goal: "Ship it.",
      priorItemsContext: "",
      accumulatedDiff: huge,
      fileReads: [{ path: "src/big.ts", content: huge }],
      item: baseItem({ fileHints: ["src/big.ts"] }),
    });
    // Far smaller than the raw 100k of input - both sections are truncated.
    expect(out.length).toBeLessThan(40_000);
    expect(out).toContain("truncated");
  });
});

describe("readFreshFileReads", () => {
  it("re-reads the CURRENT contents of hinted files from the worktree", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-packet-read-"));
    const rel = "src/fresh.ts";
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, rel), "export const NOW = 42;");

    const reads = await readFreshFileReads({
      worktreePath: dir,
      fileHints: [rel],
    });
    expect(reads).toHaveLength(1);
    expect(reads[0]!.path).toBe(rel);
    expect(reads[0]!.content).toContain("export const NOW = 42;");
  });

  it("skips missing files and refuses paths that escape the worktree", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-packet-read2-"));
    const reads = await readFreshFileReads({
      worktreePath: dir,
      fileHints: ["does/not/exist.ts", "../escape.ts", "/etc/passwd"],
    });
    expect(reads).toEqual([]);
  });

  it("returns [] for empty fileHints", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-packet-read3-"));
    expect(await readFreshFileReads({ worktreePath: dir, fileHints: [] })).toEqual([]);
  });

  it("does not read secret-like paths (e.g. .env) even when hinted", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-packet-read4-"));
    await fs.writeFile(path.join(dir, ".env"), "SECRET=hunter2");
    const reads = await readFreshFileReads({
      worktreePath: dir,
      fileHints: [".env"],
    });
    expect(reads).toEqual([]);
  });
});
