import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { z } from "zod";
import { applySetup } from "../src/setup/setup-service.js";
import {
  runAssist,
  resolveAssistTarget,
  extractJson,
  AssistError,
  type AssistProviderRunner,
} from "../src/assist/assist-runner.js";
import { loadConfig } from "../src/project/config-loader.js";
import { readActionLog } from "../src/safety/action-broker.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-assist-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

/** Fake provider runner: replays canned responses, one per attempt. */
function fakeRunner(responses: string[], exitCode = 0): AssistProviderRunner {
  let i = 0;
  return async () => ({
    exitCode,
    normalized: {
      responseText: responses[Math.min(i++, responses.length - 1)] ?? "",
      metrics: null,
    },
  });
}

const itemsSchema = z.object({ items: z.array(z.string()) });

describe("extractJson", () => {
  it("pulls a bare object", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
  it("strips markdown fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("ignores surrounding prose and trailing text", () => {
    expect(extractJson('Here you go:\n{"items":["x"]}\nThanks!')).toBe(
      '{"items":["x"]}',
    );
  });
  it("handles nested braces and braces inside strings", () => {
    const src = 'noise {"a":{"b":"}"}} tail';
    expect(extractJson(src)).toBe('{"a":{"b":"}"}}');
  });
  it("extracts arrays too", () => {
    expect(extractJson("result = [1, 2, 3]")).toBe("[1, 2, 3]");
  });
  it("returns null when there is no JSON", () => {
    expect(extractJson("just some words")).toBeNull();
  });
});

describe("runAssist", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeProject();
  });

  it("resolves the crew planner's profile by default", async () => {
    const loaded = await loadConfig(projectRoot);
    const target = resolveAssistTarget(loaded);
    // The default crew's planner runs on the *-balanced profile → claude.
    expect(target.providerId).toBeTruthy();
    expect(target.profileId).toContain("balanced");
  });

  it("returns validated structured output on the happy path", async () => {
    const res = await runAssist({
      projectRoot,
      label: "test",
      instruction: "list things",
      schema: itemsSchema,
      schemaHint: '{ "items": [] }',
      runner: fakeRunner(['{"items":["a","b"]}']),
    });
    expect(res.parsed.items).toEqual(["a", "b"]);
    expect(res.attempts).toBe(1);
  });

  it("retries once on an unparseable response, then succeeds", async () => {
    const res = await runAssist({
      projectRoot,
      label: "test",
      instruction: "x",
      schema: itemsSchema,
      schemaHint: "{}",
      runner: fakeRunner(["not json at all", '{"items":["ok"]}']),
    });
    expect(res.parsed.items).toEqual(["ok"]);
    expect(res.attempts).toBe(2);
  });

  it("throws AssistError after exhausting attempts", async () => {
    await expect(
      runAssist({
        projectRoot,
        label: "test",
        instruction: "x",
        schema: itemsSchema,
        schemaHint: "{}",
        runner: fakeRunner(["nope", "still nope"]),
        maxAttempts: 2,
      }),
    ).rejects.toBeInstanceOf(AssistError);
  });

  it("rejects output that parses but fails the schema", async () => {
    await expect(
      runAssist({
        projectRoot,
        label: "test",
        instruction: "x",
        schema: itemsSchema,
        schemaHint: "{}",
        // valid JSON, wrong shape (items must be an array)
        runner: fakeRunner(['{"items":"nope"}', '{"items":"still"}']),
        maxAttempts: 2,
      }),
    ).rejects.toBeInstanceOf(AssistError);
  });

  it("records the spawn in the action-broker evidence log", async () => {
    await runAssist({
      projectRoot,
      label: "audit-me",
      instruction: "x",
      schema: itemsSchema,
      schemaHint: "{}",
      runner: fakeRunner(['{"items":[]}']),
    });
    const log = await readActionLog(projectRoot, "assist");
    expect(log.length).toBeGreaterThan(0);
    const spawn = log.find((r) => r.request.kind === "provider.spawn");
    expect(spawn).toBeTruthy();
    expect(spawn!.evidence?.ok).toBe(true);
  });
});
