import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue, readDocumentText } from "../src/setup/config-update-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import {
  addOwnerPolicy,
  listPolicies,
  removePolicy,
  proposePolicy,
  confirmPolicy,
  rejectPolicy,
  migratePersonaPreferences,
} from "../src/project/project-policy-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });
const NOW = "2026-06-28T12:00:00.000Z";

describe("project-policy-service (owner-explicit capture, project-scoped)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-policysvc-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  });

  it("an owner add is confirmed-on-create (live immediately, no confirm step)", async () => {
    const added = await addOwnerPolicy(
      dir,
      { id: "no-em-dash", statement: "do not use em-dash characters", correction: "use a hyphen ( - ) instead" },
      NOW,
    );
    expect(added.source).toBe("owner");
    expect(added.confirmedAt).toBe(NOW);
    expect(added.tier).toBe("advise");
    const list = await listPolicies(dir);
    expect(list.map((p) => p.id)).toEqual(["no-em-dash"]);
    expect(list[0]!.confirmedAt).toBe(NOW);
  });

  it("an owner add can be a block tier with a matcher (owner-only)", async () => {
    const added = await addOwnerPolicy(
      dir,
      { id: "no-eyebrow", statement: "no eyebrow labels", tier: "block", matcher: "SectionEyebrow" },
      NOW,
    );
    expect(added.tier).toBe("block");
    expect(added.matcher).toBe("SectionEyebrow");
  });

  it("a bad --block (no matcher) fails fast at the schema door", async () => {
    await expect(
      addOwnerPolicy(dir, { id: "x", statement: "y", tier: "block" }, NOW),
    ).rejects.toThrow();
  });

  it("appends without disturbing earlier policies", async () => {
    await addOwnerPolicy(dir, { id: "a", statement: "rule a" }, NOW);
    await addOwnerPolicy(dir, { id: "b", statement: "rule b" }, NOW);
    expect((await listPolicies(dir)).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("refuses a duplicate policy id (fail fast)", async () => {
    await addOwnerPolicy(dir, { id: "a", statement: "rule a" }, NOW);
    await expect(
      addOwnerPolicy(dir, { id: "a", statement: "again" }, NOW),
    ).rejects.toThrow(/already/i);
  });

  it("removes a policy by id (and reports when there was nothing to remove)", async () => {
    await addOwnerPolicy(dir, { id: "a", statement: "rule a" }, NOW);
    expect((await removePolicy(dir, "a")).removed).toBe(true);
    expect(await listPolicies(dir)).toEqual([]);
    expect((await removePolicy(dir, "a")).removed).toBe(false);
  });

  it("a supervisor-proposed policy can NEVER be a hard block (block is owner-only)", async () => {
    const p = await proposePolicy(dir, { id: "x", statement: "a rule" });
    expect(p.tier).toBe("advise");
    expect(p.matcher).toBeNull();
  });

  it("a proposed policy is pending and inert (source supervisor-proposed, confirmedAt null)", async () => {
    const p = await proposePolicy(dir, { id: "no-em-dash", statement: "no em-dash" });
    expect(p.source).toBe("supervisor-proposed");
    expect(p.confirmedAt).toBeNull();
    const list = await listPolicies(dir);
    expect(list.map((x) => x.id)).toEqual(["no-em-dash"]);
    expect(list[0]!.confirmedAt).toBeNull();
  });

  it("confirming a pending policy makes it active; idempotent; reports unknown", async () => {
    await proposePolicy(dir, { id: "p", statement: "rule p" });
    expect((await confirmPolicy(dir, "p", NOW)).confirmed).toBe(true);
    expect((await listPolicies(dir))[0]!.confirmedAt).toBe(NOW);
    expect((await confirmPolicy(dir, "p", "2027-01-01T00:00:00.000Z")).confirmed).toBe(true);
    expect((await listPolicies(dir))[0]!.confirmedAt).toBe(NOW); // unchanged
    expect((await confirmPolicy(dir, "ghost", NOW)).confirmed).toBe(false);
  });

  it("rejecting removes a PENDING policy only, never an active one", async () => {
    await proposePolicy(dir, { id: "pending", statement: "pending rule" });
    await addOwnerPolicy(dir, { id: "active", statement: "active rule" }, NOW);
    expect((await rejectPolicy(dir, "pending")).rejected).toBe(true);
    expect((await rejectPolicy(dir, "active")).rejected).toBe(false);
    expect((await listPolicies(dir)).map((p) => p.id)).toEqual(["active"]);
    expect((await rejectPolicy(dir, "ghost")).rejected).toBe(false);
  });

  it("scopes an advise policy to lenses when provided", async () => {
    await addOwnerPolicy(
      dir,
      { id: "a11y", statement: "alt text", scopeLenses: ["accessibility"] },
      NOW,
    );
    expect((await listPolicies(dir))[0]!.scope.lenses).toEqual(["accessibility"]);
  });
});

describe("migratePersonaPreferences (legacy persona.preferences -> projectPolicies)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-policymigrate-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  });

  it("lifts a legacy persona preference (severity/pattern -> tier/matcher) and removes the key", async () => {
    // Hand-write a legacy config the loader would now reject, then migrate it.
    const { text, configPath } = await readDocumentText(dir);
    const legacy =
      text +
      "\npersonas:\n  staff-engineer:\n    label: Staff\n    preferences:\n" +
      "      - id: no-eyebrow\n        statement: no eyebrow labels\n        confirmedAt: '2026-06-28T00:00:00.000Z'\n" +
      "        severity: block\n        pattern: SectionEyebrow\n";
    await fs.writeFile(configPath, legacy);

    // The loader fails fast with a targeted error before migrate.
    await expect(loadConfig(dir)).rejects.toThrow(/vibe policies migrate/i);

    const { moved } = await migratePersonaPreferences(dir);
    expect(moved).toBe(1);

    // Now it loads, with the rule lifted to projectPolicies.
    const { config } = await loadConfig(dir);
    const lifted = config.projectPolicies.find((p) => p.id === "no-eyebrow");
    expect(lifted).toBeDefined();
    expect(lifted!.tier).toBe("block");
    expect(lifted!.matcher).toBe("SectionEyebrow");
    expect(config.personas?.["staff-engineer"]).toBeDefined();
    expect("preferences" in (config.personas!["staff-engineer"] as object)).toBe(false);
  });

  it("is a no-op when there are no persona preferences", async () => {
    expect((await migratePersonaPreferences(dir)).moved).toBe(0);
  });

  it("renames colliding ids uniquely and never throws on a long renamed id", async () => {
    const { text, configPath } = await readDocumentText(dir);
    const longId = "x".repeat(58); // 58 + '-pa' suffix would exceed the 60 cap
    const legacy =
      text +
      "\nprojectPolicies:\n" +
      `  - id: ${longId}\n    statement: pre-existing\n    confirmedAt: '2026-06-28T00:00:00.000Z'\n` +
      "personas:\n  pa:\n    label: PA\n    preferences:\n" +
      `      - id: ${longId}\n        statement: collides on id\n        confirmedAt: '2026-06-28T00:00:00.000Z'\n` +
      "  pb:\n    label: PB\n    preferences:\n" +
      `      - id: ${longId}\n        statement: collides again\n        confirmedAt: '2026-06-28T00:00:00.000Z'\n`;
    await fs.writeFile(configPath, legacy);

    const { moved } = await migratePersonaPreferences(dir);
    expect(moved).toBe(2);
    const { config } = await loadConfig(dir);
    const ids = config.projectPolicies.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(ids.every((id) => id.length <= 60)).toBe(true); // within the cap
  });
});
