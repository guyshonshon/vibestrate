import { describe, it, expect } from "vitest";
import { claudeStreamJsonAdapter } from "../src/providers/adapters/claude-stream-json.js";
import { OutputAdapterError } from "../src/providers/output-adapter.js";
import { detectApprovalRequest } from "../src/core/approval-types.js";

// Fixtures captured from real `claude` 2.1.x (`-p --output-format stream-json
// --verbose [--include-partial-messages]`), trimmed to the relevant events.
const RESULT_EVENT = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "pong",
  session_id: "13bcda85-d9be-4f06-8d43-6209fce2dbbc",
  total_cost_usd: 0.07067224999999999,
  usage: {
    input_tokens: 4861,
    cache_creation_input_tokens: 6545,
    cache_read_input_tokens: 9704,
    output_tokens: 4,
  },
  modelUsage: {
    "claude-haiku-4-5-20251001": { outputTokens: 13, costUSD: 0.000509 },
    "claude-opus-4-7[1m]": { outputTokens: 4, costUSD: 0.07016325 },
  },
});

const FULL_STREAM = [
  JSON.stringify({ type: "system", subtype: "init", session_id: "s" }),
  JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text: "pong" }] },
  }),
  RESULT_EVENT,
].join("\n");

describe("claude stream-json adapter — finalize", () => {
  it("extracts the response text from the terminal result event", () => {
    expect(claudeStreamJsonAdapter.finalize(FULL_STREAM).responseText).toBe("pong");
  });

  it("extracts real token/cost/model metrics", () => {
    const m = claudeStreamJsonAdapter.finalize(FULL_STREAM).metrics!;
    expect(m.totalCostUsd).toBeCloseTo(0.0706722, 5);
    expect(m.tokenUsage).toEqual({
      input: 4861,
      output: 4,
      cacheRead: 9704,
      cacheCreation: 6545,
    });
    // Primary model = costliest (opus), not the higher-token background haiku.
    expect(m.model).toBe("claude-opus-4-7[1m]");
    expect(m.perModelCost).toHaveLength(2);
    expect(m.sessionId).toBe("13bcda85-d9be-4f06-8d43-6209fce2dbbc");
  });

  it("preserves a HUMAN_APPROVAL marker so the gate still fires (parity)", () => {
    const stream = JSON.stringify({
      type: "result",
      subtype: "success",
      result: "Risky.\nHUMAN_APPROVAL: REQUIRED\nHUMAN_APPROVAL_REASON: deletes data\n",
      session_id: "s",
    });
    const turn = claudeStreamJsonAdapter.finalize(stream);
    expect(detectApprovalRequest(turn.responseText).required).toBe(true);
  });

  it("fails loud when there is no result event (never guesses)", () => {
    const noResult = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "assistant", message: { content: [] } }),
    ].join("\n");
    expect(() => claudeStreamJsonAdapter.finalize(noResult)).toThrow(OutputAdapterError);
    expect(() => claudeStreamJsonAdapter.finalize("")).toThrow(OutputAdapterError);
    expect(() => claudeStreamJsonAdapter.finalize("garbage\nlines")).toThrow(
      OutputAdapterError,
    );
  });
});

describe("claude stream-json adapter — live filter", () => {
  it("emits only assistant text deltas, buffering across split chunks", () => {
    const filter = claudeStreamJsonAdapter.createLiveFilter!();
    // A thinking/signature delta → nothing displayed.
    const thinking = JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "x" } },
    });
    const textDelta = JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "hello world" } },
    });
    expect(filter(`${thinking}\n`)).toBe("");
    // Feed the text-delta line split across two chunks — must still emit once
    // the newline arrives.
    const mid = Math.floor(textDelta.length / 2);
    expect(filter(textDelta.slice(0, mid))).toBe("");
    expect(filter(textDelta.slice(mid) + "\n")).toBe("hello world");
  });
});
