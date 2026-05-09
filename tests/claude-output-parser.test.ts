import { describe, it, expect } from "vitest";
import { parseClaudeCodeOutput } from "../src/providers/claude-code-output-parser.js";

describe("claude-code output parser", () => {
  it("parses a single JSON object with usage + cost + session", () => {
    const stdout = JSON.stringify({
      session_id: "sess-abc",
      model: "claude-sonnet-x",
      total_cost_usd: 0.0123,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 20,
      },
      tool_call_count: 4,
    });
    const r = parseClaudeCodeOutput({ outputFormat: "json", stdout });
    expect(r.parseAvailable).toBe(true);
    expect(r.sessionId).toBe("sess-abc");
    expect(r.model).toBe("claude-sonnet-x");
    expect(r.totalCostUsd).toBe(0.0123);
    expect(r.tokenUsage?.input).toBe(100);
    expect(r.tokenUsage?.output).toBe(50);
    expect(r.tokenUsage?.cacheRead).toBe(20);
    expect(r.toolCallCount).toBe(4);
  });

  it("parses stream-json by finding the final result line", () => {
    const lines = [
      JSON.stringify({ type: "delta", text: "thinking…" }),
      JSON.stringify({ type: "delta", text: "more…" }),
      JSON.stringify({
        type: "result",
        session_id: "s2",
        total_cost_usd: 0.5,
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
    ].join("\n");
    const r = parseClaudeCodeOutput({ outputFormat: "stream-json", stdout: lines });
    expect(r.sessionId).toBe("s2");
    expect(r.totalCostUsd).toBe(0.5);
    expect(r.tokenUsage?.input).toBe(1);
    expect(r.tokenUsage?.output).toBe(2);
  });

  it("returns parseAvailable=false when nothing parseable", () => {
    const r = parseClaudeCodeOutput({
      outputFormat: "text",
      stdout: "Hello, this is a plain text answer.",
    });
    expect(r.parseAvailable).toBe(false);
    expect(r.totalCostUsd).toBeNull();
    expect(r.tokenUsage).toBeNull();
  });

  it("never invents numbers when fields are missing", () => {
    const r = parseClaudeCodeOutput({
      outputFormat: "json",
      stdout: JSON.stringify({ session_id: "sess" }),
    });
    expect(r.sessionId).toBe("sess");
    expect(r.totalCostUsd).toBeNull();
    expect(r.tokenUsage).toBeNull();
    expect(r.toolCallCount).toBeNull();
  });
});
