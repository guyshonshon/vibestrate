import { describe, it, expect } from "vitest";
import {
  OutputAdapterError,
  textOutputAdapter,
  type ProviderOutputAdapter,
} from "../src/providers/output-adapter.js";
import { detectApprovalRequest } from "../src/core/approval-types.js";

describe("text output adapter (default)", () => {
  it("passes stdout through as the response text with no metrics", () => {
    const turn = textOutputAdapter.finalize("plan looks good\nDECISION: APPROVED\n");
    expect(turn.responseText).toBe("plan looks good\nDECISION: APPROVED\n");
    expect(turn.metrics).toBeNull();
  });

  it("preserves a HUMAN_APPROVAL marker so the gate still fires", () => {
    const raw = "Risky change.\nHUMAN_APPROVAL: REQUIRED\nHUMAN_APPROVAL_REASON: deletes data\n";
    const turn = textOutputAdapter.finalize(raw);
    // The control parser must see the same marker it would in plain-text mode.
    expect(detectApprovalRequest(turn.responseText).required).toBe(true);
    expect(detectApprovalRequest(raw).required).toBe(true);
  });

  it("has no live filter (caller streams chunks verbatim)", () => {
    expect(textOutputAdapter.createLiveFilter).toBeUndefined();
  });
});

describe("adapter contract (what a structured adapter must honor)", () => {
  // A minimal stand-in for a real JSON adapter: extracts the assistant text
  // from a fake event stream and FAILS LOUD on a malformed stream — never
  // returns garbage that could hide an approval marker from the control parser.
  const fakeJsonAdapter: ProviderOutputAdapter = {
    id: "fake-json",
    finalize(raw) {
      const lines = raw.split("\n").filter((l) => l.trim());
      const last = lines[lines.length - 1];
      if (!last) throw new OutputAdapterError("empty stream");
      let obj: { type?: string; text?: string };
      try {
        obj = JSON.parse(last);
      } catch {
        throw new OutputAdapterError("unparseable stream");
      }
      if (obj.type !== "result" || typeof obj.text !== "string") {
        throw new OutputAdapterError("no result event");
      }
      return { responseText: obj.text, metrics: null };
    },
  };

  it("losslessly extracts the response text (incl. control markers)", () => {
    const stream = [
      JSON.stringify({ type: "delta", text: "working…" }),
      JSON.stringify({ type: "result", text: "Done.\nHUMAN_APPROVAL: REQUIRED\n" }),
    ].join("\n");
    const turn = fakeJsonAdapter.finalize(stream);
    expect(turn.responseText).toContain("HUMAN_APPROVAL: REQUIRED");
    expect(detectApprovalRequest(turn.responseText).required).toBe(true);
  });

  it("fails loud on a malformed stream (never silently degrades)", () => {
    expect(() => fakeJsonAdapter.finalize("{not json")).toThrow(OutputAdapterError);
    expect(() => fakeJsonAdapter.finalize("")).toThrow(OutputAdapterError);
    expect(() =>
      fakeJsonAdapter.finalize(JSON.stringify({ type: "delta", text: "x" })),
    ).toThrow(OutputAdapterError);
  });
});
