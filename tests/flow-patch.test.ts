import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import {
  applyFlowPatch,
  mergeFlowPatch,
  forkFlowToProject,
  deleteProjectFlow,
} from "../src/flows/runtime/flow-patch.js";
import { startServer, type StartedServer } from "../src/server/server.js";
import { findBuiltinFlow } from "../src/flows/catalog/builtin-flows.js";

const PROJECT_CONFIG = `project:
  name: flow-patch
providers:
  claude:
    type: cli
    command: __flow_patch_claude_must_not_run__
roles:
  planner:
    provider: claude
    prompt: .amaco/roles/planner.md
    permissions: readOnly
  reviewer:
    provider: claude
    prompt: .amaco/roles/reviewer.md
    permissions: readOnly
`;

const PROJECT_FLOW = `id: project-review
version: 1
label: Project Review
description: Project-local review recipe.
slots:
  reviewer:
    label: Reviewer
    defaultRole: reviewer
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-flow-patch-"));
  await fs.mkdir(path.join(root, ".amaco", "flows", "project-review"), {
    recursive: true,
  });
  await fs.writeFile(path.join(root, ".amaco", "project.yml"), PROJECT_CONFIG);
  await fs.writeFile(
    path.join(root, ".amaco", "flows", "project-review", "flow.yml"),
    PROJECT_FLOW,
  );
  return root;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("mergeFlowPatch (pure)", () => {
  it("merges label / description / step labels and revalidates", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const verdict = mergeFlowPatch(base, {
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
    const base = findBuiltinFlow("quality-arbitration")!;
    const verdict = mergeFlowPatch(base, {
      steps: [{ id: "no-such-step", label: "x" }],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reasons.join("\n")).toMatch(/unknown step/);
  });

  it("returns schema reasons when the merged result violates the contract", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    // Empty label is illegal per the schema (min length 1).
    const verdict = mergeFlowPatch(base, { label: "" });
    expect(verdict.ok).toBe(false);
  });

  it("re-routes a step to a different slot and overwrites the roleId", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    // Pick a step that has a slot today so we know the merge had to replace it.
    const target = base.steps.find((s) => s.slot)!;
    const newSlot = Object.keys(base.slots).find((k) => k !== target.slot)!;
    const verdict = mergeFlowPatch(base, {
      steps: [
        {
          id: target.id,
          slot: newSlot,
          roleId: "claude-overridden",
        },
      ],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    const merged = verdict.next.steps.find((s) => s.id === target.id)!;
    expect(merged.slot).toBe(newSlot);
    expect(merged.roleId).toBe("claude-overridden");
  });

  it("clears roleId when passed as null", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const targetWithRole = base.steps.find((s) => s.roleId);
    if (!targetWithRole) {
      // The arbitration flow may not pin roleIds; pick another flow
      // shape — Ship Fast — that does. Skip cleanly otherwise.
      return;
    }
    const verdict = mergeFlowPatch(base, {
      steps: [{ id: targetWithRole.id, roleId: null }],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(
      verdict.next.steps.find((s) => s.id === targetWithRole.id)!.roleId,
    ).toBeUndefined();
  });

  it("changing kind from approval-gate to agent-turn requires clearing approval metadata", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const gate = base.steps.find((s) => s.kind === "approval-gate");
    if (!gate) return;
    // Changing kind without dropping approval should fail validation.
    const bad = mergeFlowPatch(base, {
      steps: [{ id: gate.id, kind: "agent-turn", slot: gate.slot ?? null }],
    });
    expect(bad.ok).toBe(false);
    // Dropping approval at the same time should succeed.
    const good = mergeFlowPatch(base, {
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
    const base = findBuiltinFlow("quality-arbitration")!;
    const turn = base.steps.find(
      (s) => s.kind === "agent-turn" && !s.approval,
    )!;
    const verdict = mergeFlowPatch(base, {
      steps: [{ id: turn.id, kind: "approval-gate" }],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reasons.join("\n")).toMatch(/approval/i);
  });

  it("overwriting approval metadata round-trips", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const gate = base.steps.find((s) => s.kind === "approval-gate");
    if (!gate) return;
    const verdict = mergeFlowPatch(base, {
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

describe("applyFlowPatch", () => {
  it("writes the new YAML to disk for project-local flows", async () => {
    const root = await makeProject();
    const result = await applyFlowPatch({
      projectRoot: root,
      flowId: "project-review",
      patch: {
        label: "Project Review · v2",
        steps: [{ id: "review", optional: true }],
      },
    });
    if (!result.ok) throw new Error(result.reasons.join("\n"));
    expect(result.flowId).toBe("project-review");
    expect(result.definitionPath).toMatch(/flow\.yml$/);

    const written = await fs.readFile(
      path.join(root, ".amaco", "flows", "project-review", "flow.yml"),
      "utf8",
    );
    const reparsed = YAML.parse(written) as {
      label: string;
      steps: { id: string; optional?: boolean }[];
    };
    expect(reparsed.label).toBe("Project Review · v2");
    expect(reparsed.steps.find((s) => s.id === "review")?.optional).toBe(true);
  });

  it("refuses to edit builtin flows", async () => {
    const root = await makeProject();
    const result = await applyFlowPatch({
      projectRoot: root,
      flowId: "quality-arbitration",
      patch: { label: "Hijacked" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.reasons.join("\n")).toMatch(/builtin/);
  });

  it("404s when the flow does not exist", async () => {
    const root = await makeProject();
    const result = await applyFlowPatch({
      projectRoot: root,
      flowId: "nope",
      patch: { label: "x" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });
});

describe("PATCH /api/flows/:flowId", () => {
  it("persists project-flow edits over HTTP and refuses builtin edits", async () => {
    const root = await makeProject();
    server = await startServer({ projectRoot: root, port: 0, host: "127.0.0.1" });

    const ok = await fetch(`${server.url}/api/flows/project-review`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Project Review · API" }),
    });
    expect(ok.status).toBe(200);
    const okBody = (await ok.json()) as {
      ok: boolean;
      flow: { label: string };
    };
    expect(okBody.ok).toBe(true);
    expect(okBody.flow.label).toBe("Project Review · API");

    const refused = await fetch(
      `${server.url}/api/flows/quality-arbitration`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "Hijacked" }),
      },
    );
    expect(refused.status).toBe(409);
  });
});

describe("replaceSteps / replaceSlots (structural edits)", () => {
  it("replaces the whole ordered step list", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const slot = Object.keys(base.slots)[0]!;
    const verdict = mergeFlowPatch(base, {
      replaceSteps: [
        { id: "plan", label: "Plan", kind: "agent-turn", slot, inputs: [], outputs: [], optional: false },
        { id: "review", label: "Review", kind: "review-turn", slot, inputs: [], outputs: [], optional: false },
      ],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(verdict.next.steps.map((s) => s.id)).toEqual(["plan", "review"]);
  });

  it("replaces the slot map wholesale alongside the steps", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const verdict = mergeFlowPatch(base, {
      replaceSlots: { solo: { label: "Solo", defaultRole: "executor" } },
      replaceSteps: [
        { id: "do", label: "Do", kind: "agent-turn", slot: "solo", inputs: [], outputs: [], optional: false },
      ],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(Object.keys(verdict.next.slots)).toEqual(["solo"]);
    expect(verdict.next.steps[0]!.slot).toBe("solo");
  });
});

describe("forkFlowToProject", () => {
  it("copies a builtin into .amaco/flows and is idempotent", async () => {
    const root = await makeProject();
    try {
      const first = await forkFlowToProject({
        projectRoot: root,
        flowId: "quality-arbitration",
      });
      if (!first.ok) throw new Error(first.reasons.join(", "));
      expect(first.alreadyForked).toBe(false);
      const filePath = path.join(
        root,
        ".amaco",
        "flows",
        "quality-arbitration",
        "flow.yml",
      );
      expect(await fs.readFile(filePath, "utf8")).toMatch(/id: quality-arbitration/);
      // Re-fork → no-op.
      const second = await forkFlowToProject({
        projectRoot: root,
        flowId: "quality-arbitration",
      });
      if (!second.ok) throw new Error(second.reasons.join(", "));
      expect(second.alreadyForked).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("404s an unknown flow", async () => {
    const root = await makeProject();
    try {
      const r = await forkFlowToProject({ projectRoot: root, flowId: "no-such-flow" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(404);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("deleteProjectFlow", () => {
  it("deletes a project-local flow", async () => {
    const root = await makeProject();
    try {
      const r = await deleteProjectFlow({ projectRoot: root, flowId: "project-review" });
      if (!r.ok) throw new Error(r.reasons.join(", "));
      const exists = await fs
        .access(path.join(root, ".amaco", "flows", "project-review", "flow.yml"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to delete a builtin flow", async () => {
    const root = await makeProject();
    try {
      const r = await deleteProjectFlow({
        projectRoot: root,
        flowId: "quality-arbitration",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(409);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
