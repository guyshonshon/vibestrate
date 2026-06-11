import { describe, it, expect } from "vitest";
import {
  parseReviewOutput,
  extractFlowOutputJson,
  FLOW_OUTPUT_MARKER,
  FLOW_OUTPUT_END_MARKER,
} from "../src/flows/runtime/review-findings.js";

describe("parseReviewOutput - prose contract (default flow)", () => {
  it("parses the DECISION line", () => {
    const out = parseReviewOutput(
      "## Review\n\nLooks mostly fine.\n\nDECISION: CHANGES_REQUESTED\n",
    );
    expect(out.decision).toBe("CHANGES_REQUESTED");
    expect(out.structured).toBe(false);
    expect(out.findings).toEqual([]);
  });

  it("returns null decision when no line is present", () => {
    const out = parseReviewOutput("just prose, no verdict");
    expect(out.decision).toBeNull();
    expect(out.structured).toBe(false);
  });

  it("never throws on empty / nullish-ish input", () => {
    expect(parseReviewOutput("").decision).toBeNull();
    expect(parseReviewOutput("   \n\n").findings).toEqual([]);
  });
});

describe("parseReviewOutput - structured findings block", () => {
  const block = (payload: unknown) =>
    `Review prose first.\n\n${FLOW_OUTPUT_MARKER} ${JSON.stringify(payload)} ${FLOW_OUTPUT_END_MARKER}\n`;

  it("maps findings with severity/category/file", () => {
    const out = parseReviewOutput(
      block({
        contract: "vibestrate.flow.findings.v1",
        findings: [
          {
            title: "Race in scheduler",
            severity: "high",
            category: "correctness",
            evidence: [{ file: "src/scheduler/run.ts", lineStart: 10 }],
            detail: "Two writers, no lock.",
          },
          { title: "Naming nit", severity: "low" },
        ],
      }),
    );
    expect(out.structured).toBe(true);
    expect(out.findings).toHaveLength(2);
    expect(out.findings[0]).toMatchObject({
      title: "Race in scheduler",
      severity: "high",
      category: "correctness",
      file: "src/scheduler/run.ts",
      detail: "Two writers, no lock.",
    });
    expect(out.findings[1]!.file).toBeNull();
  });

  it("derives decision from a decision-summary recommendation when no DECISION line", () => {
    const out = parseReviewOutput(
      block({ recommendation: "request_changes", findings: [] }),
    );
    expect(out.decision).toBe("CHANGES_REQUESTED");
  });

  it("prose DECISION line wins over the block", () => {
    const text =
      block({ recommendation: "approve", findings: [] }) + "\nDECISION: BLOCKED\n";
    expect(parseReviewOutput(text).decision).toBe("BLOCKED");
  });

  it("degrades to unstructured on malformed JSON", () => {
    const out = parseReviewOutput(
      `${FLOW_OUTPUT_MARKER} { not json !!! ${FLOW_OUTPUT_END_MARKER}\nDECISION: APPROVED\n`,
    );
    expect(out.structured).toBe(false);
    expect(out.decision).toBe("APPROVED");
  });

  it("skips junk findings and caps text length", () => {
    const out = parseReviewOutput(
      block({
        findings: [
          null,
          42,
          { noTitle: true },
          { title: "x".repeat(800) },
        ],
      }),
    );
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]!.title.length).toBeLessThanOrEqual(501);
  });
});

describe("extractFlowOutputJson", () => {
  it("falls back to the last ```json fence", () => {
    const text =
      'first\n```json\n{"a": 1}\n```\nmiddle\n```json\n{"b": 2}\n```\n';
    expect(extractFlowOutputJson(text)).toEqual({ b: 2 });
  });

  it("uses the marker block when both exist", () => {
    const text = `\`\`\`json\n{"fence": true}\n\`\`\`\n${FLOW_OUTPUT_MARKER} {"marker": true} ${FLOW_OUTPUT_END_MARKER}`;
    expect(extractFlowOutputJson(text)).toEqual({ marker: true });
  });

  it("tolerates a missing end marker", () => {
    expect(
      extractFlowOutputJson(`${FLOW_OUTPUT_MARKER} {"open": 1}`),
    ).toEqual({ open: 1 });
  });

  it("returns null on garbage", () => {
    expect(extractFlowOutputJson("no block here")).toBeNull();
    expect(extractFlowOutputJson("")).toBeNull();
  });
});
