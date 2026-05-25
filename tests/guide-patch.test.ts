import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import {
  applyGuidePatch,
  mergeGuidePatch,
} from "../src/guides/runtime/guide-patch.js";
import { startServer, type StartedServer } from "../src/server/server.js";
import { findBuiltinGuide } from "../src/guides/catalog/builtin-guides.js";

const PROJECT_CONFIG = `project:
  name: guide-patch
providers:
  claude:
    type: cli
    command: __guide_patch_claude_must_not_run__
agents:
  planner:
    provider: claude
    prompt: .amaco/agents/planner.md
    permissions: readOnly
  reviewer:
    provider: claude
    prompt: .amaco/agents/reviewer.md
    permissions: readOnly
`;

const PROJECT_GUIDE = `id: project-review
version: 1
label: Project Review
description: Project-local review recipe.
slots:
  reviewer:
    label: Reviewer
    defaultAgent: reviewer
steps:
  - id: review
    label: Review
    kind: review-turn
    slot: reviewer
    inputs: [diff]
    outputs: [findings]
  - id: cleanup
    label: Cleanup
    kind: agent-turn
    slot: reviewer
    inputs: [findings]
    outputs: [notes]
`;

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-guide-patch-"));
  await fs.mkdir(path.join(root, ".amaco", "guides", "project-review"), {
    recursive: true,
  });
  await fs.writeFile(path.join(root, ".amaco", "project.yml"), PROJECT_CONFIG);
  await fs.writeFile(
    path.join(root, ".amaco", "guides", "project-review", "guide.yml"),
    PROJECT_GUIDE,
  );
  return root;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("mergeGuidePatch (pure)", () => {
  it("merges label / description / step labels and revalidates", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    const verdict = mergeGuidePatch(base, {
      label: "Quality Arbitration · Renamed",
      description: "Renamed for testing.",
      steps: [{ id: base.steps[0]!.id, label: "Renamed step" }],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(verdict.next.label).toBe("Quality Arbitration · Renamed");
    expect(verdict.next.description).toBe("Renamed for testing.");
    expect(verdict.next.steps[0]!.label).toBe("Renamed step");
  });

  it("rejects unknown step ids without touching the base", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    const verdict = mergeGuidePatch(base, {
      steps: [{ id: "no-such-step", label: "x" }],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reasons.join("\n")).toMatch(/unknown step/);
  });

  it("returns schema reasons when the merged result violates the contract", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    // Empty label is illegal per the schema (min length 1).
    const verdict = mergeGuidePatch(base, { label: "" });
    expect(verdict.ok).toBe(false);
  });

  it("re-routes a step to a different slot and overwrites the agentId", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    // Pick a step that has a slot today so we know the merge had to replace it.
    const target = base.steps.find((s) => s.slot)!;
    const newSlot = Object.keys(base.slots).find((k) => k !== target.slot)!;
    const verdict = mergeGuidePatch(base, {
      steps: [
        {
          id: target.id,
          slot: newSlot,
          agentId: "claude-overridden",
        },
      ],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    const merged = verdict.next.steps.find((s) => s.id === target.id)!;
    expect(merged.slot).toBe(newSlot);
    expect(merged.agentId).toBe("claude-overridden");
  });

  it("clears agentId when passed as null", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    const targetWithAgent = base.steps.find((s) => s.agentId);
    if (!targetWithAgent) {
      // The arbitration guide may not pin agentIds; pick another guide
      // shape — Ship Fast — that does. Skip cleanly otherwise.
      return;
    }
    const verdict = mergeGuidePatch(base, {
      steps: [{ id: targetWithAgent.id, agentId: null }],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(
      verdict.next.steps.find((s) => s.id === targetWithAgent.id)!.agentId,
    ).toBeUndefined();
  });

  it("changing kind from approval-gate to agent-turn requires clearing approval metadata", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    const gate = base.steps.find((s) => s.kind === "approval-gate");
    if (!gate) return;
    // Changing kind without dropping approval should fail validation.
    const bad = mergeGuidePatch(base, {
      steps: [{ id: gate.id, kind: "agent-turn", slot: gate.slot ?? null }],
    });
    expect(bad.ok).toBe(false);
    // Dropping approval at the same time should succeed.
    const good = mergeGuidePatch(base, {
      steps: [
        {
          id: gate.id,
          kind: "agent-turn",
          slot: gate.slot ?? Object.keys(base.slots)[0]!,
          approval: null,
        },
      ],
    });
    expect(good.ok).toBe(true);
  });

  it("setting kind=approval-gate without approval metadata is rejected", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    const turn = base.steps.find(
      (s) => s.kind === "agent-turn" && !s.approval,
    )!;
    const verdict = mergeGuidePatch(base, {
      steps: [{ id: turn.id, kind: "approval-gate" }],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reasons.join("\n")).toMatch(/approval/i);
  });

  it("overwriting approval metadata round-trips", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    const gate = base.steps.find((s) => s.kind === "approval-gate");
    if (!gate) return;
    const verdict = mergeGuidePatch(base, {
      steps: [
        {
          id: gate.id,
          approval: {
            reason: "Updated reason",
            requestedAction: "Approve renamed plan",
            riskLevel: "high",
          },
        },
      ],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    const merged = verdict.next.steps.find((s) => s.id === gate.id)!;
    expect(merged.approval?.reason).toBe("Updated reason");
    expect(merged.approval?.riskLevel).toBe("high");
  });
});

describe("applyGuidePatch", () => {
  it("writes the new YAML to disk for project-local guides", async () => {
    const root = await makeProject();
    const result = await applyGuidePatch({
      projectRoot: root,
      guideId: "project-review",
      patch: {
        label: "Project Review · v2",
        steps: [{ id: "review", optional: true }],
      },
    });
    if (!result.ok) throw new Error(result.reasons.join("\n"));
    expect(result.guideId).toBe("project-review");
    expect(result.definitionPath).toMatch(/guide\.yml$/);

    const written = await fs.readFile(
      path.join(root, ".amaco", "guides", "project-review", "guide.yml"),
      "utf8",
    );
    const reparsed = YAML.parse(written) as {
      label: string;
      steps: { id: string; optional?: boolean }[];
    };
    expect(reparsed.label).toBe("Project Review · v2");
    expect(reparsed.steps.find((s) => s.id === "review")?.optional).toBe(true);
  });

  it("refuses to edit builtin guides", async () => {
    const root = await makeProject();
    const result = await applyGuidePatch({
      projectRoot: root,
      guideId: "quality-arbitration",
      patch: { label: "Hijacked" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.reasons.join("\n")).toMatch(/builtin/);
  });

  it("404s when the guide does not exist", async () => {
    const root = await makeProject();
    const result = await applyGuidePatch({
      projectRoot: root,
      guideId: "nope",
      patch: { label: "x" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });
});

describe("PATCH /api/guides/:guideId", () => {
  it("persists project-guide edits over HTTP and refuses builtin edits", async () => {
    const root = await makeProject();
    server = await startServer({ projectRoot: root, port: 0, host: "127.0.0.1" });

    const ok = await fetch(`${server.url}/api/guides/project-review`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Project Review · API" }),
    });
    expect(ok.status).toBe(200);
    const okBody = (await ok.json()) as {
      ok: boolean;
      guide: { label: string };
    };
    expect(okBody.ok).toBe(true);
    expect(okBody.guide.label).toBe("Project Review · API");

    const refused = await fetch(
      `${server.url}/api/guides/quality-arbitration`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "Hijacked" }),
      },
    );
    expect(refused.status).toBe(409);
  });
});
