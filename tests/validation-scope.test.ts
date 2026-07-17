import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  classifyChangedFilesForValidation,
  isInertPath,
} from "../src/core/validation/validation-scope.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { runEventsPath } from "../src/utils/paths.js";
import type { VibestrateEvent } from "../src/core/stores/event-log.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Proportional validation scoping, slice 1 (proportional-orchestration.md / B3).
// The safety property under test: validation is skipped ONLY when EVERY changed
// file is provably-inert. The classifier is an allowlist, so anything unknown
// (code, .json, .yaml, .sql, no-extension) forces validation - a misjudgment can
// only ever cause MORE validation, never less.

describe("classifyChangedFilesForValidation - fail-safe inert allowlist", () => {
  it("all-inert diff (docs/text/assets) -> allInert true", () => {
    const d = classifyChangedFilesForValidation([
      "README.md",
      "docs/guide.txt",
      "assets/logo.svg",
      "fonts/Inter.woff2",
    ]);
    expect(d.allInert).toBe(true);
    expect(d.nonInert).toEqual([]);
    expect(d.changedFileCount).toBe(4);
  });

  it("one code file in the diff -> NOT allInert (validate everything)", () => {
    const d = classifyChangedFilesForValidation(["README.md", "src/app.ts"]);
    expect(d.allInert).toBe(false);
    expect(d.nonInert).toEqual(["src/app.ts"]);
  });

  it("only code -> NOT allInert", () => {
    expect(classifyChangedFilesForValidation(["src/a.ts", "src/b.py"]).allInert).toBe(false);
  });

  it("config/data extensions are code-class, never inert (the inverted taxonomy)", () => {
    // .json can be package.json scripts; .yaml can be CI/k8s; .sql can be a
    // migration; .toml can be Cargo. All must validate.
    for (const p of ["package.json", "ci.yml", "migrate.sql", "Cargo.toml", "config.yaml"]) {
      expect(isInertPath(p), `${p} must NOT be inert`).toBe(false);
    }
    expect(classifyChangedFilesForValidation(["feature-flags.json"]).allInert).toBe(false);
  });

  it("unknown extension and extension-less files are non-inert (fail-safe)", () => {
    for (const p of ["weird.xyz", "Makefile", "README", "Dockerfile", ".gitignore", "bin/tool"]) {
      expect(isInertPath(p), `${p} must NOT be inert`).toBe(false);
    }
  });

  it("empty diff is not allInert (no skip when nothing changed)", () => {
    const d = classifyChangedFilesForValidation([]);
    expect(d.allInert).toBe(false);
    expect(d.changedFileCount).toBe(0);
  });

  it("inert detection is case-insensitive and basename-scoped", () => {
    expect(isInertPath("docs/NOTES.MD")).toBe(true);
    expect(isInertPath("a/b/c/photo.PNG")).toBe(true);
    // a directory named like a doc must not fool basename extraction
    expect(isInertPath("weird.md/actual.ts")).toBe(false);
  });
});

// Integration: drive a real run whose executor writes one controlled file, and
// assert validation is skipped for an inert file and runs for a code file.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function eventsFor(dir: string, runId: string): Promise<VibestrateEvent[]> {
  const raw = await fs.readFile(runEventsPath(dir, runId), "utf8");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as VibestrateEvent);
}

async function makeRepoAndRun(writeFileName: string): Promise<VibestrateEvent[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-valscope-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  // Fake provider: the executor writes the WRITE_FILE marker file into its cwd
  // (the worktree), so the run produces a real diff of a known file type.
  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(
    fakeJs,
    `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  const m = i.match(/WRITE_FILE=([^\\s'"]+)/);
  if (i.includes('Vibestrate Agent: reviewer')) console.log('# Review\\n\\nDECISION: APPROVED');
  else if (i.includes('Vibestrate Agent: verifier')) console.log('VERIFICATION: PASSED');
  else if (i.includes('Vibestrate Agent: planner')) console.log('# Plan');
  else if (i.includes('Vibestrate Agent: architect')) console.log('# Architecture\\nNothing risky.');
  else if (i.includes('Vibestrate Agent: executor')) {
    if (m) { try { require('fs').writeFileSync(m[1], 'content\\n'); } catch (e) {} }
    console.log('# Implementation Summary\\nwrote ' + (m ? m[1] : 'nothing'));
  }
  else if (i.includes('Vibestrate Agent: fixer')) console.log('# Fix\\nNone.');
  else console.log('?');
});
`,
    { mode: 0o755 },
  );
  await fs.chmod(fakeJs, 0o755);

  await setConfigValue(
    dir,
    "providers.claude",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "claude");
  // A harmless always-pass validation command so the non-scoped path is observable.
  await setConfigValue(dir, "commands.validate", JSON.stringify(["node --version"]));

  const loaded = await loadConfig(dir);
  const orch = new Orchestrator({
    projectRoot: dir,
    config: loaded.config,
    rules: loaded.rules,
    task: `Create a file. WRITE_FILE=${writeFileName}`,
    isGitRepo: true,
    onProgress: () => {},
  });
  const result = await orch.run();
  return eventsFor(dir, result.runId);
}

describe("validation scoping (integration)", () => {
  it("skips configured validation when the only changed file is inert (.md)", async () => {
    const events = await makeRepoAndRun("notes.md");
    expect(events.find((e) => e.type === "validation.scoped"), "scoped event expected").toBeDefined();
    expect(events.find((e) => e.type === "validation.command.completed")).toBeUndefined();
  }, 60_000);

  it("runs configured validation when a code file changed (.ts)", async () => {
    const events = await makeRepoAndRun("mod.ts");
    expect(events.find((e) => e.type === "validation.scoped")).toBeUndefined();
    expect(
      events.find((e) => e.type === "validation.command.completed"),
      "the configured command should have run",
    ).toBeDefined();
  }, 60_000);
});
