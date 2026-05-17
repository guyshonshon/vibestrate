import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendStreamLine,
  ensureStreamsDir,
  listStreams,
  readStream,
  streamFilePath,
} from "../src/core/provider-stream-store.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "amaco-stream-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("provider-stream-store", () => {
  it("appends and reads ndjson lines per agent", async () => {
    await ensureStreamsDir(root, "run-1");
    await appendStreamLine(root, "run-1", "1_planner-prompt.md", {
      stream: "stdout",
      chunk: "Hello",
      at: "2026-05-17T10:00:00Z",
    });
    await appendStreamLine(root, "run-1", "1_planner-prompt.md", {
      stream: "stderr",
      chunk: "warn",
      at: "2026-05-17T10:00:01Z",
    });
    const lines = await readStream(root, "run-1", "1_planner-prompt");
    expect(lines).toHaveLength(2);
    expect(lines[0]?.chunk).toBe("Hello");
    expect(lines[1]?.stream).toBe("stderr");
  });

  it("listStreams reports each agent's file, newest first", async () => {
    await ensureStreamsDir(root, "run-2");
    await appendStreamLine(root, "run-2", "1_planner.md", {
      stream: "stdout",
      chunk: "p",
      at: "2026-05-17T10:00:00Z",
    });
    await new Promise((r) => setTimeout(r, 5));
    await appendStreamLine(root, "run-2", "2_executor.md", {
      stream: "stdout",
      chunk: "e",
      at: "2026-05-17T10:00:01Z",
    });
    const streams = await listStreams(root, "run-2");
    expect(streams.map((s) => s.promptName)).toEqual([
      "2_executor",
      "1_planner",
    ]);
    expect(streams[0]?.bytes).toBeGreaterThan(0);
  });

  it("readStream returns [] for a missing file", async () => {
    expect(await readStream(root, "run-x", "nope")).toEqual([]);
  });

  it("streamFilePath strips the prompt's extension", () => {
    const p = streamFilePath(root, "run-z", "1_planner.md");
    expect(p.endsWith("1_planner.ndjson")).toBe(true);
  });
});
