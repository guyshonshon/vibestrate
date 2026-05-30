import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  installSkillFromUrl,
  assessSkill,
} from "../src/skills/skill-fetch.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { FetchImpl } from "../src/flows/runtime/flow-portability.js";
import type { AssistProviderRunner } from "../src/assist/assist-runner.js";

function okFetch(body: string): FetchImpl {
  return async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => body,
  });
}

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-skf-"));
}

describe("installSkillFromUrl", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await tempProject();
  });

  it("installs a skill markdown under .vibestrate/skills/", async () => {
    const r = await installSkillFromUrl({
      projectRoot: dir,
      url: "https://example.test/skills/Rust-Style.md",
      allowPrivateHosts: true,
      fetchImpl: okFetch("# Rust style\nUse rustfmt."),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.name).toBe("rust-style");
      const written = await fs.readFile(
        path.join(dir, ".vibestrate", "skills", "rust-style.md"),
        "utf8",
      );
      expect(written).toContain("Use rustfmt.");
    }
  });

  it("redacts secret-shaped content before writing", async () => {
    const r = await installSkillFromUrl({
      projectRoot: dir,
      url: "https://example.test/s/x.md",
      allowPrivateHosts: true,
      fetchImpl: okFetch("token AKIAIOSFODNN7EXAMPLE here"),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.redactedSecrets).toBeGreaterThan(0);
      const written = await fs.readFile(
        path.join(dir, ".vibestrate", "skills", "x.md"),
        "utf8",
      );
      expect(written).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(written).toContain("[REDACTED:");
    }
  });

  it("refuses to overwrite an existing skill unless told to", async () => {
    const opts = {
      projectRoot: dir,
      url: "https://example.test/s/dup.md",
      allowPrivateHosts: true,
    };
    const first = await installSkillFromUrl({ ...opts, fetchImpl: okFetch("v1") });
    expect(first.ok).toBe(true);
    const second = await installSkillFromUrl({ ...opts, fetchImpl: okFetch("v2") });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toMatch(/already exists/);
    expect(
      await fs.readFile(path.join(dir, ".vibestrate", "skills", "dup.md"), "utf8"),
    ).toContain("v1");
    const third = await installSkillFromUrl({
      ...opts,
      overwrite: true,
      fetchImpl: okFetch("v3"),
    });
    expect(third.ok).toBe(true);
    expect(
      await fs.readFile(path.join(dir, ".vibestrate", "skills", "dup.md"), "utf8"),
    ).toContain("v3");
  });

  it("blocks SSRF (localhost) and reports empty content", async () => {
    const blocked = await installSkillFromUrl({
      projectRoot: dir,
      url: "http://localhost/skill.md",
      allowPrivateHosts: false,
      fetchImpl: okFetch("never read"),
    });
    expect(blocked.ok).toBe(false);
    const empty = await installSkillFromUrl({
      projectRoot: dir,
      url: "https://example.test/e.md",
      allowPrivateHosts: true,
      fetchImpl: okFetch("   "),
    });
    expect(empty.ok).toBe(false);
  });
});

describe("assessSkill (AI overview)", () => {
  it("returns a structured verdict from a read-only assist", async () => {
    const dir = await tempProject();
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({
      options: { projectRoot: dir },
      detectionRunner: async () => ({ exitCode: 127, stdout: "", stderr: "" }),
    });

    const runner: AssistProviderRunner = async () => ({
      exitCode: 0,
      normalized: {
        responseText:
          '{"verdict":"helpful","reason":"adds new Rust guidance","overlaps":[]}',
        metrics: null,
      },
    });
    const a = await assessSkill({
      projectRoot: dir,
      skillText: "# Rust style\nUse clippy.",
      runner,
    });
    expect(a.verdict).toBe("helpful");
    expect(a.reason).toContain("Rust");
  });
});
