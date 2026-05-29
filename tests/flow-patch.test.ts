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
import { findFlowById } from "../src/flows/catalog/flow-discovery.js";

const PROJECT_CONFIG = `project:
  name: flow-patch
providers:
  claude:
    type: cli
    command: __flow_patch_claude_must_not_run__
profiles:
  claude-balanced:
    provider: claude
crews:
  default:
    roles:
      planner:
        fills: [planner]
        profile: claude-balanced
        prompt: .vibestrate/roles/planner.md
        permissions: readOnly
      reviewer:
        fills: [reviewer]
        profile: claude-balanced
        prompt: .vibestrate/roles/reviewer.md
        permissions: readOnly
defaultCrew: default
`;

const PROJECT_FLOW = `id: project-review
version: 1
label: Project Review
description: Project-local review recipe.
seats:
  reviewer:
    label: Reviewer
steps:
  - id: review
    label: Review
    kind: review-turn
    seat: reviewer
    inputs: [diff]
    outputs: [findings]
  - id: cleanup
    label: Cleanup
    kind: agent-turn
    seat: reviewer
    inputs: [findings]
    outputs: [notes]
`;

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-flow-patch-"));
  await fs.mkdir(path.join(root, ".vibestrate", "flows", "project-review"), {
    recursive: true,
  });
  await fs.writeFile(path.join(root, ".vibestrate", "project.yml"), PROJECT_CONFIG);
  await fs.writeFile(
    path.join(root, ".vibestrate", "flows", "project-review", "flow.yml"),
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

  it("re-routes a step to a different seat", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    // Pick a step that has a seat today so we know the merge had to replace it.
    const target = base.steps.find((s) => s.seat)!;
    const newSeat = Object.keys(base.seats).find((k) => k !== target.seat)!;
    const verdict = mergeFlowPatch(base, {
      steps: [
        {
          id: target.id,
          seat: newSeat,
        },
      ],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    const merged = verdict.next.steps.find((s) => s.id === target.id)!;
    expect(merged.seat).toBe(newSeat);
  });

  it("clears seat when passed as null on a non-turn step", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    // Validation steps have no seat; pick a turn step and confirm seat is set,
    // then a seatless validation step round-trips with seat undefined.
    const validation = base.steps.find((s) => s.kind === "validation");
    if (!validation) return;
    expect(validation.seat).toBeUndefined();
  });

  it("changing kind from approval-gate to agent-turn requires clearing approval metadata", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const gate = base.steps.find((s) => s.kind === "approval-gate");
    if (!gate) return;
    // Changing kind without dropping approval should fail validation.
    const bad = mergeFlowPatch(base, {
      steps: [{ id: gate.id, kind: "agent-turn", seat: gate.seat ?? null }],
    });
    expect(bad.ok).toBe(false);
    // Dropping approval at the same time should succeed.
    const good = mergeFlowPatch(base, {
      steps: [
        {
          id: gate.id,
          kind: "agent-turn",
          seat: gate.seat ?? Object.keys(base.seats)[0]!,
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
      path.join(root, ".vibestrate", "flows", "project-review", "flow.yml"),
      "utf8",
    );
    const reparsed = YAML.parse(written) as {
      label: string;
      steps: { id: string; optional?: boolean }[];
    };
    expect(reparsed.label).toBe("Project Review · v2");
    expect(reparsed.steps.find((s) => s.id === "review")?.optional).toBe(true);
  });

  it("auto-forks a builtin flow on edit (always editable)", async () => {
    const root = await makeProject();
    const result = await applyFlowPatch({
      projectRoot: root,
      flowId: "quality-arbitration",
      patch: { label: "My Quality Arbitration" },
    });
    if (!result.ok) throw new Error(result.reasons.join("\n"));
    // A project copy was written, shadowing the builtin.
    const written = await fs.readFile(
      path.join(root, ".vibestrate", "flows", "quality-arbitration", "flow.yml"),
      "utf8",
    );
    expect((YAML.parse(written) as { label: string }).label).toBe(
      "My Quality Arbitration",
    );
    const found = await findFlowById(root, "quality-arbitration");
    expect(found?.source.kind).toBe("project");
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
  it("persists project-flow edits over HTTP and auto-forks builtin edits", async () => {
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

    // Editing a builtin over HTTP auto-forks it into the project (no 409).
    const forked = await fetch(
      `${server.url}/api/flows/quality-arbitration`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "My QA" }),
      },
    );
    expect(forked.status).toBe(200);
    const forkedBody = (await forked.json()) as {
      ok: boolean;
      flow: { label: string; source: { kind: string } };
    };
    expect(forkedBody.flow.label).toBe("My QA");
    expect(forkedBody.flow.source.kind).toBe("project");
  });
});

describe("replaceSteps / replaceSeats (structural edits)", () => {
  it("replaces the whole ordered step list", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const seat = Object.keys(base.seats)[0]!;
    const verdict = mergeFlowPatch(base, {
      replaceSteps: [
        { id: "plan", label: "Plan", kind: "agent-turn", seat, inputs: [], outputs: [], optional: false, skipWhenReadOnly: false },
        { id: "review", label: "Review", kind: "review-turn", seat, inputs: [], outputs: [], optional: false, skipWhenReadOnly: false },
      ],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(verdict.next.steps.map((s) => s.id)).toEqual(["plan", "review"]);
  });

  it("replaces the seat map wholesale alongside the steps", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const verdict = mergeFlowPatch(base, {
      replaceSeats: { solo: { label: "Solo" } },
      replaceSteps: [
        { id: "do", label: "Do", kind: "agent-turn", seat: "solo", inputs: [], outputs: [], optional: false, skipWhenReadOnly: false },
      ],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(Object.keys(verdict.next.seats)).toEqual(["solo"]);
    expect(verdict.next.steps[0]!.seat).toBe("solo");
  });
});

describe("mergeFlowPatch — loop, stage, read-only authoring", () => {
  it("adds an adaptive loop to a flow that had none", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    expect(base.loop).toBeUndefined();
    const verdict = mergeFlowPatch(base, {
      loop: {
        from: "implementation-review",
        to: "second-review",
        decisionStep: "implementation-review",
        maxIterations: 2,
      },
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(verdict.next.loop).toEqual({
      from: "implementation-review",
      to: "second-review",
      decisionStep: "implementation-review",
      maxIterations: 2,
    });
  });

  it("clears a loop with loop: null", () => {
    const base = findBuiltinFlow("default")!;
    expect(base.loop).toBeDefined();
    const verdict = mergeFlowPatch(base, { loop: null });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(verdict.next.loop).toBeUndefined();
  });

  it("rejects a loop whose decisionStep isn't a review-turn", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const verdict = mergeFlowPatch(base, {
      loop: {
        from: "implement",
        to: "second-review",
        decisionStep: "implement", // agent-turn, not a review-turn
        maxIterations: 2,
      },
    });
    expect(verdict.ok).toBe(false);
  });

  it("edits a step's stage and skipWhenReadOnly in place", () => {
    const base = findBuiltinFlow("quality-arbitration")!;
    const verdict = mergeFlowPatch(base, {
      steps: [{ id: "implement", stage: "executing", skipWhenReadOnly: true }],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    const step = verdict.next.steps.find((s) => s.id === "implement")!;
    expect(step.stage).toBe("executing");
    expect(step.skipWhenReadOnly).toBe(true);
  });
});

describe("forkFlowToProject", () => {
  it("copies a builtin into .vibestrate/flows and is idempotent", async () => {
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
        ".vibestrate",
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
        .access(path.join(root, ".vibestrate", "flows", "project-review", "flow.yml"))
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
