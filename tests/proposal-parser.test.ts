import { describe, it, expect } from "vitest";
import { parseProposal } from "../src/roadmap/proposal-parser.js";

const happy = `# Plan

A short summary.

AMACO_ROADMAP_ITEM:
TITLE: Build onboarding
DESCRIPTION: Make first-run setup simple for vibe coders.
PRIORITY: high
TAGS: onboarding, setup

AMACO_TASK:
TITLE: Create setup wizard
ROADMAP: Build onboarding
DESCRIPTION: Add guided setup flow.
RISK: medium
SKILLS: typescript-node-cli, ux-design
LIKELY_FILES: src/cli/commands/setup.ts, src/setup/setup-service.ts
VALIDATION: pnpm typecheck, pnpm test

AMACO_TASK:
TITLE: Add setup tests
ROADMAP: Build onboarding
DESCRIPTION: Tests for the wizard.
DEPENDS_ON: Create setup wizard
RISK: low
SKILLS: testing
LIKELY_FILES: tests/setup-service.test.ts
VALIDATION: pnpm test
`;

describe("parseProposal — happy path", () => {
  const r = parseProposal({
    proposalId: "demo",
    sourcePath: "/p.md",
    rawText: happy,
  });

  it("extracts roadmap items and tasks", () => {
    expect(r.roadmapItems).toHaveLength(1);
    expect(r.roadmapItems[0]!.title).toBe("Build onboarding");
    expect(r.roadmapItems[0]!.priority).toBe("high");
    expect(r.tasks).toHaveLength(2);
  });

  it("links task ROADMAP to a roadmap item title", () => {
    expect(r.tasks[0]!.roadmapTitle).toBe("Build onboarding");
    expect(r.tasks[1]!.roadmapTitle).toBe("Build onboarding");
  });

  it("parses RISK and parses LIKELY_FILES + SKILLS as comma-separated", () => {
    expect(r.tasks[0]!.riskLevel).toBe("medium");
    expect(r.tasks[0]!.requiredSkills).toEqual([
      "typescript-node-cli",
      "ux-design",
    ]);
    expect(r.tasks[0]!.touchedFiles).toEqual([
      "src/cli/commands/setup.ts",
      "src/setup/setup-service.ts",
    ]);
    expect(r.tasks[0]!.validationHints).toEqual(["pnpm typecheck", "pnpm test"]);
  });

  it("links DEPENDS_ON by task title", () => {
    expect(r.tasks[1]!.dependencies).toEqual(["Create setup wizard"]);
    expect(r.dependencyEdges).toContainEqual({
      from: "Create setup wizard",
      to: "Add setup tests",
    });
  });

  it("has no errors", () => {
    expect(r.errors).toEqual([]);
  });
});

describe("parseProposal — validation", () => {
  it("missing TITLE on a task is a fatal error", () => {
    const r = parseProposal({
      proposalId: "x",
      rawText: "AMACO_TASK:\nDESCRIPTION: no title here\n",
    });
    expect(r.tasks).toHaveLength(0);
    expect(r.errors.some((e) => /missing TITLE/.test(e.message))).toBe(true);
  });

  it("duplicate task titles in one proposal are a fatal error", () => {
    const r = parseProposal({
      proposalId: "x",
      rawText: `AMACO_TASK:\nTITLE: same\n\nAMACO_TASK:\nTITLE: same\n`,
    });
    expect(r.errors.some((e) => /Duplicate task/.test(e.message))).toBe(true);
  });

  it("duplicate roadmap item titles in one proposal are a fatal error", () => {
    const r = parseProposal({
      proposalId: "x",
      rawText: `AMACO_ROADMAP_ITEM:\nTITLE: A\n\nAMACO_ROADMAP_ITEM:\nTITLE: A\n`,
    });
    expect(r.errors.some((e) => /Duplicate roadmap item/.test(e.message))).toBe(
      true,
    );
  });

  it("invalid RISK falls back to medium with a warning", () => {
    const r = parseProposal({
      proposalId: "x",
      rawText: `AMACO_TASK:\nTITLE: x\nRISK: spicy\n`,
    });
    expect(r.tasks[0]!.riskLevel).toBe("medium");
    expect(r.warnings.some((w) => /Invalid RISK/.test(w.message))).toBe(true);
  });

  it("rejects path traversal in LIKELY_FILES", () => {
    const r = parseProposal({
      proposalId: "x",
      rawText: `AMACO_TASK:\nTITLE: x\nLIKELY_FILES: ../etc/passwd, /etc/shadow\n`,
    });
    expect(r.tasks[0]!.touchedFiles).toEqual([]);
    expect(
      r.errors.filter((e) => /Unsafe path/.test(e.message)).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("unknown DEPENDS_ON yields a warning, not an error", () => {
    const r = parseProposal({
      proposalId: "x",
      rawText: `AMACO_TASK:\nTITLE: x\nDEPENDS_ON: ghost\n`,
    });
    expect(r.tasks[0]!.dependencies).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(
      r.warnings.some((w) => /references unknown task/.test(w.message)),
    ).toBe(true);
  });

  it("DEPENDS_ON: none is treated as no dependency", () => {
    const r = parseProposal({
      proposalId: "x",
      rawText: `AMACO_TASK:\nTITLE: x\nDEPENDS_ON: none\n`,
    });
    expect(r.tasks[0]!.dependencies).toEqual([]);
  });

  it("AMACO_NEEDS_CLARIFICATION is captured", () => {
    const r = parseProposal({
      proposalId: "x",
      rawText: `AMACO_NEEDS_CLARIFICATION: which auth provider?\n`,
    });
    expect(r.needsClarification).toBe("which auth provider?");
    expect(r.tasks).toEqual([]);
  });
});
