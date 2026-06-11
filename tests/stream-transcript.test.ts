import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  createTranscriptFilter,
  toolUseLabel,
} from "../src/providers/adapters/stream-transcript.js";
import {
  appendStreamLine,
  listStreams,
  readStream,
  streamFilePath,
} from "../src/core/provider-stream-store.js";

const textDelta = (text: string) =>
  JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_delta", delta: { type: "text_delta", text } },
  });
const thinkingDelta = (thinking: string) =>
  JSON.stringify({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "thinking_delta", thinking },
    },
  });
const assistantToolUse = (name: string, input: unknown) =>
  JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", name, input }] },
  });

describe("createTranscriptFilter", () => {
  it("emits typed chunks for text, thinking, and tools", () => {
    const f = createTranscriptFilter();
    const out = f(
      `${textDelta("Hello ")}\n${thinkingDelta("hmm")}\n${assistantToolUse("Read", { file_path: "src/x.ts" })}\n`,
    );
    expect(out).toEqual([
      { kind: "text", text: "Hello " },
      { kind: "thinking", text: "hmm" },
      { kind: "tool", text: "Read · src/x.ts" },
    ]);
  });

  it("classifies Agent/Task tool_use as subagent", () => {
    const f = createTranscriptFilter();
    const out = f(
      `${assistantToolUse("Task", { description: "explore the repo" })}\n`,
    );
    expect(out).toEqual([
      { kind: "subagent", text: "Task · explore the repo" },
    ]);
  });

  it("buffers partial lines split across chunks", () => {
    const f = createTranscriptFilter();
    const line = textDelta("split");
    const a = f(line.slice(0, 25));
    const b = f(`${line.slice(25)}\n`);
    expect(a).toEqual([]);
    expect(b).toEqual([{ kind: "text", text: "split" }]);
  });

  it("tolerates garbage and unknown events", () => {
    const f = createTranscriptFilter();
    expect(
      f('not json\n{"type":"system"}\n{"type":"result","result":"x"}\n'),
    ).toEqual([]);
  });

  it("does not duplicate text from complete assistant messages", () => {
    const f = createTranscriptFilter();
    const out = f(
      `${JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "already streamed" }] },
      })}\n`,
    );
    expect(out).toEqual([]);
  });
});

describe("toolUseLabel", () => {
  it("prefers the first known field and truncates", () => {
    expect(toolUseLabel("Bash", { command: "ls -la" })).toBe("Bash · ls -la");
    expect(toolUseLabel("Read", {})).toBe("Read");
    expect(toolUseLabel("Read", { file_path: "x".repeat(200) }).length).toBeLessThan(
      140,
    );
  });
});

describe("provider-stream-store (P2)", () => {
  it("redacts high-precision token shapes at the capture seam", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-stream-"));
    const planted = `key is AKIA${"A".repeat(16)} ok`;
    await appendStreamLine(dir, "run1", "flows/implement/prompt", {
      stream: "stdout",
      kind: "text",
      chunk: planted,
      at: "2026-06-12T00:00:00.000Z",
    });
    const lines = await readStream(dir, "run1", "flows/implement/prompt");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.chunk).not.toContain("AKIA");
    expect(lines[0]!.kind).toBe("text");
  });

  it("lists nested flow streams recursively (the empty-panel root cause)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-stream-"));
    await appendStreamLine(dir, "run1", "flows/implement/prompt", {
      stream: "stdout",
      chunk: "a",
      at: "2026-06-12T00:00:00.000Z",
    });
    await appendStreamLine(dir, "run1", "top-level", {
      stream: "stdout",
      chunk: "b",
      at: "2026-06-12T00:00:01.000Z",
    });
    const streams = await listStreams(dir, "run1");
    const names = streams.map((s) => s.promptName).sort();
    expect(names).toEqual(["flows/implement/prompt", "top-level"]);
  });

  it("refuses stream names that escape the streams dir", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-stream-"));
    expect(() => streamFilePath(dir, "run1", "../../evil")).toThrow();
    expect(await readStream(dir, "run1", "../../evil")).toEqual([]);
  });
});
