import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import {
  SUPERVISOR_ARCHETYPES,
  listSupervisorArchetypes,
} from "../src/supervisor/supervisor-archetypes.js";
import {
  adoptArchetype,
  setDefaultPersona,
  removePersona,
} from "../src/supervisor/persona-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

describe("supervisor archetypes + persona-service", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-archetypes-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  });

  it("all archetypes are valid personas with closed-vocabulary lenses", () => {
    // The module-load validation already threw if not, but assert the shape too.
    expect(Object.keys(SUPERVISOR_ARCHETYPES).length).toBe(6);
    for (const [id, a] of Object.entries(SUPERVISOR_ARCHETYPES)) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(Array.isArray(a.reviewLenses)).toBe(true);
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("adopt writes the server-owned persona into project.yml", async () => {
    await adoptArchetype(dir, "security-hawk");
    const { config } = await loadConfig(dir);
    const persona = config.personas?.["security-hawk"];
    expect(persona).toBeDefined();
    expect(persona?.label).toBe("Security Hawk");
    expect(persona?.reviewLenses).toEqual([
      "authz",
      "secrets",
      "injection",
      "security-risk",
    ]);
    expect(persona?.prefersPosture).toBe("sandbox-suggested");
  });

  it("adopt is idempotent-ish: re-adopting overwrites and stays valid", async () => {
    await adoptArchetype(dir, "correctness-purist");
    // Re-adopt the same id - must not throw and must leave a single valid entry.
    await adoptArchetype(dir, "correctness-purist");
    const { config } = await loadConfig(dir);
    expect(config.personas?.["correctness-purist"]?.label).toBe(
      "Correctness Purist",
    );
  });

  it("adopting an unknown archetypeId throws", async () => {
    await expect(adoptArchetype(dir, "no-such-archetype")).rejects.toThrow();
  });

  it("SECURITY: prototype-chain ids (constructor/__proto__/toString) throw, not crash or write", async () => {
    // A plain-object index makes SUPERVISOR_ARCHETYPES["constructor"] truthy, so a
    // `!archetype` guard would pass them and then crash the YAML writer (500).
    // The Object.hasOwn guard must reject them as unknown ids.
    for (const id of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
      await expect(adoptArchetype(dir, id), id).rejects.toThrow(/Unknown supervisor archetype/);
    }
    // Nothing got written under any prototype-named key.
    const raw = await fs.readFile(path.join(dir, ".vibestrate", "project.yml"), "utf8");
    expect(raw).not.toContain("__proto__");
    expect(raw).not.toContain("constructor");
  });

  it("listSupervisorArchetypes flags adopted ids", async () => {
    await adoptArchetype(dir, "frontend-reviewer");
    const { config } = await loadConfig(dir);
    const ids = new Set(Object.keys(config.personas ?? {}));
    const listing = listSupervisorArchetypes(ids);
    const fe = listing.find((a) => a.id === "frontend-reviewer");
    const other = listing.find((a) => a.id === "ship-fast-pragmatist");
    expect(fe?.adopted).toBe(true);
    expect(other?.adopted).toBe(false);
  });

  it("setDefaultPersona to an adopted persona persists", async () => {
    await adoptArchetype(dir, "performance-skeptic");
    await setDefaultPersona(dir, "performance-skeptic");
    const { config } = await loadConfig(dir);
    expect(config.defaultPersona).toBe("performance-skeptic");
  });

  it("setDefaultPersona to a built-in persists", async () => {
    await setDefaultPersona(dir, "security");
    const { config } = await loadConfig(dir);
    expect(config.defaultPersona).toBe("security");
  });

  it("setDefaultPersona to a bogus id throws", async () => {
    await expect(setDefaultPersona(dir, "not-a-persona")).rejects.toThrow();
  });

  it("removing a built-in throws", async () => {
    await expect(removePersona(dir, "staff-engineer")).rejects.toThrow();
  });

  it("removing the active default throws", async () => {
    await adoptArchetype(dir, "ship-fast-pragmatist");
    await setDefaultPersona(dir, "ship-fast-pragmatist");
    await expect(removePersona(dir, "ship-fast-pragmatist")).rejects.toThrow();
  });

  it("removing an unknown project persona throws", async () => {
    await expect(removePersona(dir, "never-adopted")).rejects.toThrow();
  });

  it("remove deletes a non-default project persona", async () => {
    await adoptArchetype(dir, "data-migration-guardian");
    await removePersona(dir, "data-migration-guardian");
    const { config } = await loadConfig(dir);
    expect(config.personas?.["data-migration-guardian"]).toBeUndefined();
  });
});
