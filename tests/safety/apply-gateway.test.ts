import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  extractProposedPatch,
  applyProposedPatchThroughGateway,
} from "../../src/safety/apply-gateway.js";
import {
  DefaultActionBroker,
  readActionLog,
  type ActionEvaluator,
} from "../../src/safety/action-broker.js";

async function tempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ag-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(path.join(dir, "src/a.ts"), "export const a = 1\n");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

const PATCH = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1 +1,2 @@",
  " export const a = 1",
  "+// added-by-agent",
  "",
].join("\n");

describe("extractProposedPatch", () => {
  it("pulls a ```diff fenced block", () => {
    const out = `Here is my change:\n\n\`\`\`diff\n${PATCH}\`\`\`\nDone.`;
    const p = extractProposedPatch(out);
    expect(p).toContain("diff --git a/src/a.ts");
    expect(p).toContain("added-by-agent");
  });

  it("returns null when there is no patch", () => {
    expect(extractProposedPatch("no diff here")).toBeNull();
  });

  it("returns null for a ```diff fence that is just prose (no hunk/header)", () => {
    expect(
      extractProposedPatch("```diff\njust some explanation, not a patch\n```"),
    ).toBeNull();
  });
});

describe("applyProposedPatchThroughGateway", () => {
  it("applies an agent-proposed diff and records evidence", async () => {
    const wt = await tempRepo();
    try {
      const broker = new DefaultActionBroker(wt, "run-1");
      const r = await applyProposedPatchThroughGateway({
        broker,
        runId: "run-1",
        roleId: "executor",
        worktree: wt,
        output: `\`\`\`diff\n${PATCH}\`\`\``,
      });
      expect(r.status).toBe("applied");
      expect(await fs.readFile(path.join(wt, "src/a.ts"), "utf8")).toContain(
        "added-by-agent",
      );
      const log = await readActionLog(wt, "run-1");
      const rec = log.find(
        (x) =>
          x.request.kind === "file.patch" &&
          x.request.subject.op === "apply-only",
      );
      expect(rec?.evidence?.ok).toBe(true);
    } finally {
      await fs.rm(wt, { recursive: true, force: true });
    }
  });

  it("no_patch when the agent proposed nothing — worktree untouched", async () => {
    const wt = await tempRepo();
    try {
      const broker = new DefaultActionBroker(wt, "run-1");
      const r = await applyProposedPatchThroughGateway({
        broker,
        runId: "run-1",
        roleId: "executor",
        worktree: wt,
        output: "I considered it but made no changes.",
      });
      expect(r.status).toBe("no_patch");
      expect(await fs.readFile(path.join(wt, "src/a.ts"), "utf8")).toBe(
        "export const a = 1\n",
      );
    } finally {
      await fs.rm(wt, { recursive: true, force: true });
    }
  });

  it("refuses (and applies nothing) when a policy denies file.patch", async () => {
    const wt = await tempRepo();
    try {
      const deny: ActionEvaluator = (req) =>
        req.kind === "file.patch"
          ? { effect: "deny", ruleIds: ["x"], reason: "no apply" }
          : null;
      const broker = new DefaultActionBroker(wt, "run-1", { evaluators: [deny] });
      const r = await applyProposedPatchThroughGateway({
        broker,
        runId: "run-1",
        roleId: "executor",
        worktree: wt,
        output: `\`\`\`diff\n${PATCH}\`\`\``,
      });
      expect(r.status).toBe("refused");
      expect(await fs.readFile(path.join(wt, "src/a.ts"), "utf8")).toBe(
        "export const a = 1\n",
      );
    } finally {
      await fs.rm(wt, { recursive: true, force: true });
    }
  });

  it("refuses (applies nothing) when the reply has multiple diff blocks", async () => {
    const wt = await tempRepo();
    try {
      const broker = new DefaultActionBroker(wt, "run-1");
      const r = await applyProposedPatchThroughGateway({
        broker,
        runId: "run-1",
        roleId: "executor",
        worktree: wt,
        output: `\`\`\`diff\n${PATCH}\`\`\`\nand also:\n\`\`\`diff\n${PATCH}\`\`\``,
      });
      expect(r.status).toBe("refused");
      if (r.status === "refused") expect(r.reason).toMatch(/multiple diff blocks/i);
      // First block was NOT silently applied.
      expect(await fs.readFile(path.join(wt, "src/a.ts"), "utf8")).toBe(
        "export const a = 1\n",
      );
    } finally {
      await fs.rm(wt, { recursive: true, force: true });
    }
  });

  it("refuses a secret-bearing patch via built-in safety", async () => {
    const wt = await tempRepo();
    try {
      const secretPatch = [
        "diff --git a/.env b/.env",
        "--- /dev/null",
        "+++ b/.env",
        "@@ -0,0 +1 @@",
        "+API_KEY=sk-livesecret",
        "",
      ].join("\n");
      const broker = new DefaultActionBroker(wt, "run-1");
      const r = await applyProposedPatchThroughGateway({
        broker,
        runId: "run-1",
        roleId: "executor",
        worktree: wt,
        output: `\`\`\`diff\n${secretPatch}\`\`\``,
      });
      expect(r.status).toBe("refused");
    } finally {
      await fs.rm(wt, { recursive: true, force: true });
    }
  });
});
