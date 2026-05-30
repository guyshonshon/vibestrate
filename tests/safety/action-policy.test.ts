import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  actionPolicyMatches,
  buildActionEvaluators,
  loadActionPolicyEvaluators,
} from "../../src/policies/action-policy-engine.js";
import { loadPolicySnapshot } from "../../src/policies/policy-store.js";
import { createActionBroker } from "../../src/safety/action-broker.js";
import type { ActionPolicy } from "../../src/policies/policy-types.js";
import type { ActionRequest } from "../../src/safety/action-broker.js";

const req = (over: Partial<ActionRequest>): ActionRequest => ({
  runId: "r",
  kind: "provider.spawn",
  subject: {},
  proposedBy: "system",
  ...over,
});

const policy = (over: Partial<ActionPolicy>): ActionPolicy => ({
  id: "p1",
  description: "d",
  on: ["provider.spawn"],
  match: undefined,
  effect: "deny",
  message: "blocked",
  ...over,
});

describe("actionPolicyMatches", () => {
  it("kind-only policy matches every request of that kind, not others", () => {
    const p = policy({ on: ["command.run"], match: undefined });
    expect(actionPolicyMatches(p, req({ kind: "command.run" }))).toBe(true);
    expect(actionPolicyMatches(p, req({ kind: "provider.spawn" }))).toBe(false);
  });

  it("matches exact providerId", () => {
    const p = policy({ match: { providerId: "claude" } });
    expect(
      actionPolicyMatches(p, req({ subject: { providerId: "claude" } })),
    ).toBe(true);
    expect(
      actionPolicyMatches(p, req({ subject: { providerId: "fake" } })),
    ).toBe(false);
  });

  it("matches commandRegex", () => {
    const p = policy({
      on: ["command.run"],
      match: { commandRegex: "rm\\s+-rf", commandFlags: "i" },
    });
    expect(
      actionPolicyMatches(
        p,
        req({ kind: "command.run", subject: { command: "RM -rf /" } }),
      ),
    ).toBe(true);
    expect(
      actionPolicyMatches(
        p,
        req({ kind: "command.run", subject: { command: "ls" } }),
      ),
    ).toBe(false);
  });

  it("matches pathGlob over path and files[]", () => {
    const p = policy({
      on: ["file.write"],
      match: { pathGlob: "**/*.env" },
    });
    expect(
      actionPolicyMatches(
        p,
        req({ kind: "file.write", subject: { path: "a/b/secrets.env" } }),
      ),
    ).toBe(true);
    expect(
      actionPolicyMatches(
        p,
        req({ kind: "file.patch", subject: { files: ["x.ts"] } }),
      ),
    ).toBe(false); // wrong kind
  });

  it("pathGlob with leading **/ also matches a repo-ROOT file (no bypass)", () => {
    const p = policy({ on: ["file.write"], match: { pathGlob: "**/*.env" } });
    // Root-level secret — must still match (regression: **/ used to require a /).
    expect(
      actionPolicyMatches(p, req({ kind: "file.write", subject: { path: ".env" } })),
    ).toBe(true);
    // Nested still matches.
    expect(
      actionPolicyMatches(
        p,
        req({ kind: "file.write", subject: { path: "config/prod.env" } }),
      ),
    ).toBe(true);
    // A non-match still doesn't.
    expect(
      actionPolicyMatches(
        p,
        req({ kind: "file.write", subject: { path: "src/a.ts" } }),
      ),
    ).toBe(false);
  });

  it("matches exact run.complete status", () => {
    const p = policy({
      on: ["run.complete"],
      effect: "require_approval",
      match: { status: "merge_ready" },
    });
    expect(
      actionPolicyMatches(
        p,
        req({ kind: "run.complete", subject: { status: "merge_ready" } }),
      ),
    ).toBe(true);
    expect(
      actionPolicyMatches(
        p,
        req({ kind: "run.complete", subject: { status: "blocked" } }),
      ),
    ).toBe(false);
  });
});

describe("buildActionEvaluators", () => {
  it("produces a deny decision carrying the rule id and message", () => {
    const [ev] = buildActionEvaluators([
      policy({ match: { providerId: "claude" }, message: "no claude" }),
    ]);
    const d = ev!(req({ subject: { providerId: "claude" } }));
    expect(d?.effect).toBe("deny");
    expect(d?.ruleIds).toEqual(["p1"]);
    if (d && d.effect !== "allow") expect(d.reason).toContain("no claude");
    expect(ev!(req({ subject: { providerId: "other" } }))).toBeNull();
  });
});

describe("policy store loads action policies", () => {
  it("parses actions and records malformed regex", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ap-"));
    try {
      const dir = path.join(root, ".vibestrate", "policies");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "good.yml"),
        [
          "actions:",
          "  - id: no-fake",
          "    description: block the fake provider",
          "    on: [provider.spawn]",
          "    match: { providerId: fake }",
          "    effect: deny",
          "    message: fake provider is not allowed",
          "",
        ].join("\n"),
      );
      await fs.writeFile(
        path.join(dir, "bad.yml"),
        [
          "actions:",
          "  - id: bad-re",
          "    description: bad regex",
          "    on: [command.run]",
          "    match: { commandRegex: '([' }",
          "    effect: deny",
          "    message: x",
          "",
        ].join("\n"),
      );
      const snap = await loadPolicySnapshot(root);
      expect(snap.actions.map((a) => a.id)).toEqual(["no-fake"]);
      expect(snap.malformedFiles.some((m) => /uncompilable/.test(m.reason))).toBe(
        true,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("createActionBroker enforces on-disk action policies", () => {
  it("denies a matching effect and allows a non-matching one (lazy-loaded)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-apb-"));
    try {
      const dir = path.join(root, ".vibestrate", "policies");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "p.yml"),
        [
          "actions:",
          "  - id: no-fake",
          "    description: block fake",
          "    on: [provider.spawn]",
          "    match: { providerId: fake }",
          "    effect: deny",
          "    message: fake provider blocked",
          "",
        ].join("\n"),
      );
      const broker = createActionBroker(root, "run-1");
      const denied = await broker.decide({
        runId: "run-1",
        kind: "provider.spawn",
        subject: { providerId: "fake" },
        proposedBy: "system",
      });
      expect(denied.effect).toBe("deny");
      if (denied.effect === "deny") {
        expect(denied.ruleIds).toEqual(["no-fake"]);
      }
      const allowed = await broker.decide({
        runId: "run-1",
        kind: "provider.spawn",
        subject: { providerId: "claude" },
        proposedBy: "system",
      });
      expect(allowed.effect).toBe("allow");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("verifies loadActionPolicyEvaluators returns one evaluator per policy", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-apl-"));
    try {
      const dir = path.join(root, ".vibestrate", "policies");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "p.yml"),
        [
          "actions:",
          "  - id: a1",
          "    description: d",
          "    on: [terminal.create]",
          "    effect: require_approval",
          "    message: ask first",
          "",
        ].join("\n"),
      );
      const evs = await loadActionPolicyEvaluators(root);
      expect(evs).toHaveLength(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
