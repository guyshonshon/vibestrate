// Integration test: per-item outcome summaries must be redacted before they
// land on disk (item-N-summary.md) or are carried forward (before-item-N.md /
// all-items.md). Uses the same fake-CLI harness as
// tests/checklist-shape-b-band.test.ts.
import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { pickupReviewFlow } from "../src/flows/catalog/builtin-flows.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// A token-shaped AWS key that matches the SECRET_CONTENT_PATTERNS regex.
// Pattern: AKIA + 16 uppercase alphanumeric chars.
const SECRET_TOKEN = "AKIAIOSFODNN7EXAMPLE";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Fake provider whose `implement` step echoes the SECRET_TOKEN in its output.
// All other steps behave like a simple approve (no fix loop) so the run
// completes with one item and produces item-1-summary.md and all-items.md.
const FAKE_WITH_SECRET = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const SECRET = '${SECRET_TOKEN}';
let inp = '';
process.stdin.on('data', (c) => (inp += c));
process.stdin.on('end', () => {
  const sm = inp.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const id = sm ? sm[1] : '';
  if (id === 'plan' || id === 'micro-plan') {
    console.log('# Plan\\nWork the items in order.');
    return;
  }
  if (id === 'implement') {
    // Echo the secret token inside the implementation summary so it would
    // reach the item outcome if left unredacted.
    const im = inp.match(/Current checklist item - (\\d+) of/);
    const n = im ? im[1] : 'x';
    fs.appendFileSync('item' + n + '.txt', 'work @ ' + Date.now() + '\\n');
    console.log('# Implementation Summary\\nDid the work. Token: ' + SECRET + ' is in output.');
    return;
  }
  if (id === 'review-correctness') {
    console.log('# Correctness review\\nLooks fine.');
    return;
  }
  if (id === 'review-security-risk') {
    console.log('# Risk review\\nNo risk.');
    return;
  }
  if (id === 'arbiter') {
    console.log('# Arbiter verdict\\nDECISION: APPROVED');
    return;
  }
  if (id === 'review') {
    console.log('# Holistic review\\nDECISION: APPROVED');
    return;
  }
  console.log('ok');
});
`;

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "vibestrate-redaction-test-"),
  );
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(fakeJs, FAKE_WITH_SECRET, { mode: 0o755 });
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({
      type: "cli",
      command: "node",
      args: [fakeJs],
      input: "stdin",
    }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

async function runPickupReview(input: {
  dir: string;
  taskId: string;
  title: string;
}) {
  const loaded = await loadConfig(input.dir);
  const resolved = resolveFlow({
    flow: pickupReviewFlow,
    source: { kind: "builtin", ref: "pickup-review" },
    config: loaded.config,
    task: input.title,
  });
  const orch = new Orchestrator({
    projectRoot: input.dir,
    config: loaded.config,
    rules: loaded.rules,
    task: input.title,
    isGitRepo: true,
    taskId: input.taskId,
    flow: resolved,
    checklistMode: "continuous",
    onProgress: () => {},
  });
  return await orch.run();
}

describe("per-item outcome summary redaction", () => {
  it("scrubs a token-shaped secret from item-N-summary.md and all-items.md", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build two things" });
    await svc.addChecklistItem(task.id, "create the first file");
    await svc.addChecklistItem(task.id, "create the second file");

    const out = await runPickupReview({
      dir,
      taskId: task.id,
      title: task.title,
    });

    const artifactsBase = path.join(
      dir,
      ".vibestrate",
      "runs",
      out.runId,
      "artifacts",
      "flows",
      "checklist",
    );

    // item-1-summary.md - the per-item artifact written to disk.
    const item1 = await fs.readFile(
      path.join(artifactsBase, "item-1-summary.md"),
      "utf8",
    );
    expect(item1).not.toContain(SECRET_TOKEN);
    // Should contain a redaction marker instead.
    expect(item1).toContain("[REDACTED:");

    // item-2-summary.md - second item (also echoes the secret).
    const item2 = await fs.readFile(
      path.join(artifactsBase, "item-2-summary.md"),
      "utf8",
    );
    expect(item2).not.toContain(SECRET_TOKEN);

    // all-items.md - the carry-forward artifact written after the last item.
    const allItems = await fs.readFile(
      path.join(artifactsBase, "all-items.md"),
      "utf8",
    );
    expect(allItems).not.toContain(SECRET_TOKEN);
  }, 60_000);
});
