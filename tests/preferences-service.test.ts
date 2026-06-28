import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import {
  addOwnerPreference,
  listPreferences,
  removePreference,
  proposePreference,
  confirmPreference,
  rejectPreference,
} from "../src/project/preferences-service.js";
import { BUILTIN_PERSONAS } from "../src/orchestrator/personas.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });
const NOW = "2026-06-28T12:00:00.000Z";

describe("preferences-service (M1 owner-explicit capture)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-prefsvc-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  });

  it("an owner add is confirmed-on-create (live immediately, no confirm step)", async () => {
    const added = await addOwnerPreference(
      dir,
      { personaId: "staff-engineer", id: "no-em-dash", statement: "do not use em-dash characters", correction: "use a hyphen ( - ) instead" },
      NOW,
    );
    expect(added.source).toBe("owner");
    expect(added.confirmedAt).toBe(NOW); // trusted at creation - the friction-killer
    const list = await listPreferences(dir, "staff-engineer");
    expect(list.map((p) => p.id)).toEqual(["no-em-dash"]);
    expect(list[0]!.confirmedAt).toBe(NOW);
  });

  it("adding to a BUILT-IN persona materializes a faithful copy (does not wipe its review lenses)", async () => {
    await addOwnerPreference(dir, { personaId: "security", id: "no-em-dash", statement: "no em-dash" }, NOW);
    const { config } = await loadConfig(dir);
    const persona = config.personas?.["security"];
    expect(persona).toBeDefined();
    // The built-in's behavioral fields survive the materialization.
    expect(persona!.reviewLenses).toEqual(BUILTIN_PERSONAS["security"]!.reviewLenses);
    expect(persona!.specUpPosture).toBe(BUILTIN_PERSONAS["security"]!.specUpPosture);
    expect(persona!.preferences.map((p) => p.id)).toEqual(["no-em-dash"]);
  });

  it("appends to an existing PROJECT persona without disturbing earlier preferences", async () => {
    await setConfigValue(dir, "personas.mine", JSON.stringify({ label: "Mine" }));
    await addOwnerPreference(dir, { personaId: "mine", id: "a", statement: "rule a" }, NOW);
    await addOwnerPreference(dir, { personaId: "mine", id: "b", statement: "rule b" }, NOW);
    const list = await listPreferences(dir, "mine");
    expect(list.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("refuses a duplicate preference id (fail fast)", async () => {
    await addOwnerPreference(dir, { personaId: "mine-x", id: "a", statement: "rule a" }, NOW).catch(() => {});
    await setConfigValue(dir, "personas.dup", JSON.stringify({ label: "Dup" }));
    await addOwnerPreference(dir, { personaId: "dup", id: "a", statement: "rule a" }, NOW);
    await expect(
      addOwnerPreference(dir, { personaId: "dup", id: "a", statement: "again" }, NOW),
    ).rejects.toThrow(/already/i);
  });

  it("refuses an unknown persona", async () => {
    await expect(
      addOwnerPreference(dir, { personaId: "nope-not-real", id: "a", statement: "x" }, NOW),
    ).rejects.toThrow(/persona/i);
  });

  it("listing an unknown persona is rejected (no silent fallback to the default's list)", async () => {
    await expect(listPreferences(dir, "nope-not-real")).rejects.toThrow(/persona/i);
  });

  it("removes a preference by id (and reports when there was nothing to remove)", async () => {
    await setConfigValue(dir, "personas.r", JSON.stringify({ label: "R" }));
    await addOwnerPreference(dir, { personaId: "r", id: "a", statement: "rule a" }, NOW);
    expect((await removePreference(dir, "r", "a")).removed).toBe(true);
    expect(await listPreferences(dir, "r")).toEqual([]);
    expect((await removePreference(dir, "r", "a")).removed).toBe(false);
  });

  it("a supervisor-proposed preference can NEVER be a hard block (block is owner-only)", async () => {
    const p = await proposePreference(dir, { personaId: "staff-engineer", id: "x", statement: "a rule" });
    expect(p.severity).toBe("advise");
    expect(p.pattern).toBeNull();
  });

  it("a proposed preference is pending and inert (source supervisor-proposed, confirmedAt null)", async () => {
    const p = await proposePreference(dir, { personaId: "staff-engineer", id: "no-em-dash", statement: "no em-dash" });
    expect(p.source).toBe("supervisor-proposed");
    expect(p.confirmedAt).toBeNull();
    const list = await listPreferences(dir, "staff-engineer");
    expect(list.map((x) => x.id)).toEqual(["no-em-dash"]);
    expect(list[0]!.confirmedAt).toBeNull(); // inert until confirmed
  });

  it("confirming a pending preference makes it active; idempotent; reports unknown", async () => {
    await proposePreference(dir, { personaId: "staff-engineer", id: "p", statement: "rule p" });
    expect((await confirmPreference(dir, "staff-engineer", "p", NOW)).confirmed).toBe(true);
    expect((await listPreferences(dir, "staff-engineer"))[0]!.confirmedAt).toBe(NOW);
    // idempotent on an already-confirmed entry
    expect((await confirmPreference(dir, "staff-engineer", "p", "2027-01-01T00:00:00.000Z")).confirmed).toBe(true);
    expect((await listPreferences(dir, "staff-engineer"))[0]!.confirmedAt).toBe(NOW); // unchanged
    // unknown id
    expect((await confirmPreference(dir, "staff-engineer", "ghost", NOW)).confirmed).toBe(false);
  });

  it("rejecting removes a PENDING preference only, never an active one", async () => {
    await proposePreference(dir, { personaId: "staff-engineer", id: "pending", statement: "pending rule" });
    await addOwnerPreference(dir, { personaId: "staff-engineer", id: "active", statement: "active rule" }, NOW);
    expect((await rejectPreference(dir, "staff-engineer", "pending")).rejected).toBe(true);
    // the active one survives a reject (reject is for pending proposals)
    expect((await rejectPreference(dir, "staff-engineer", "active")).rejected).toBe(false);
    expect((await listPreferences(dir, "staff-engineer")).map((p) => p.id)).toEqual(["active"]);
    // nothing to reject
    expect((await rejectPreference(dir, "staff-engineer", "ghost")).rejected).toBe(false);
  });

  it("scopes a preference to lenses when provided", async () => {
    await addOwnerPreference(
      dir,
      { personaId: "staff-engineer", id: "a11y", statement: "alt text", scopeLenses: ["accessibility"] },
      NOW,
    );
    const list = await listPreferences(dir, "staff-engineer");
    expect(list[0]!.scope.lenses).toEqual(["accessibility"]);
  });
});
