import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  listIssues,
  recordIssue,
  resolveIssue,
} from "../src/core/issues-store.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-issues-"));
}

describe("issues store", () => {
  let root: string;
  beforeEach(async () => {
    root = await tempProject();
    await fs.mkdir(path.join(root, ".vibestrate"), { recursive: true });
  });

  it("recordIssue + listIssues round-trips with newest first", async () => {
    await recordIssue(root, { kind: "test", message: "first" });
    await recordIssue(root, { kind: "test", message: "second" });
    const list = await listIssues(root);
    expect(list.map((i) => i.message)).toEqual(["second", "first"]);
  });

  it("listIssues on a fresh project returns an empty array (no throw)", async () => {
    const list = await listIssues(root);
    expect(list).toEqual([]);
  });

  it("resolveIssue marks the matching row as resolved", async () => {
    const issue = await recordIssue(root, {
      kind: "test",
      message: "fix me",
    });
    const r = await resolveIssue(root, issue.id);
    expect(r.ok).toBe(true);
    const list = await listIssues(root);
    expect(list[0]!.resolved).toBe(true);
  });

  it("resolveIssue returns ok:false for a missing id", async () => {
    const r = await resolveIssue(root, "no-such-issue");
    expect(r.ok).toBe(false);
  });

  it("captures fix + context + detail when supplied", async () => {
    await recordIssue(root, {
      kind: "spawn-failure",
      message: "vibestrate queue run failed to spawn",
      detail: "Error: ENOENT\n  at …",
      fix: "verify dist/index.js exists; run `pnpm build`",
      context: { argv: ["queue", "run"], cwd: "/tmp/x" },
    });
    const [latest] = await listIssues(root);
    expect(latest!.fix).toMatch(/pnpm build/);
    expect(latest!.detail).toMatch(/ENOENT/);
    expect(latest!.context?.argv).toEqual(["queue", "run"]);
  });
});
