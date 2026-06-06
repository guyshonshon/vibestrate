import { describe, expect, it } from "vitest";
import { extractTurnInternals } from "../src/core/turn-internals.js";

// Real claude stream-json shapes (captured from `claude --output-format
// stream-json`, v2.x): system init, assistant messages with content[] blocks
// (thinking / tool_use / text), user tool_result, and a final result.
const j = (o: unknown) => JSON.stringify(o);

const READ_THEN_TEXT = [
  j({ type: "system", subtype: "init", session_id: "s" }),
  j({ type: "assistant", message: { content: [{ type: "thinking", thinking: "..." }] } }),
  j({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/x" } }] } }),
  j({ type: "user", message: { content: [{ type: "tool_result", content: "..." }] } }),
  j({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/y" } }] } }),
  j({ type: "assistant", message: { content: [{ type: "text", text: "done" }] } }),
  j({ type: "result", subtype: "success", num_turns: 2, total_cost_usd: 0.01 }),
].join("\n");

const WITH_SUBAGENT = [
  j({ type: "system", subtype: "init" }),
  j({ type: "assistant", message: { content: [{ type: "tool_use", name: "Agent", input: { description: "explore the repo", prompt: "..." } }] } }),
  j({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "echo hi" } }] } }),
  j({ type: "result", subtype: "success" }),
].join("\n");

describe("extractTurnInternals", () => {
  it("extracts and groups tool calls from stream-json", () => {
    const r = extractTurnInternals(READ_THEN_TEXT);
    expect(r.streamParsed).toBe(true);
    expect(r.tools).toEqual([{ name: "Read", count: 2 }]);
    expect(r.subAgents).toEqual([]);
  });

  it("recognizes a sub-agent spawn (Agent/Task) with its description", () => {
    const r = extractTurnInternals(WITH_SUBAGENT);
    expect(r.subAgents).toEqual([{ name: "Agent", description: "explore the repo" }]);
    // The sub-agent tool is not double-counted as a regular tool.
    expect(r.tools).toEqual([{ name: "Bash", count: 1 }]);
  });

  it("treats plain text output as opaque (no stream events)", () => {
    const r = extractTurnInternals("# Result\n\njust some plain text, no JSON");
    expect(r.streamParsed).toBe(false);
    expect(r.tools).toEqual([]);
    expect(r.subAgents).toEqual([]);
  });

  it("is robust to malformed lines", () => {
    const r = extractTurnInternals('{"type":"system"}\nnot json\n{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep"}]}}');
    expect(r.streamParsed).toBe(true);
    expect(r.tools).toEqual([{ name: "Grep", count: 1 }]);
  });
});
