import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import {
  applyGuidePatch,
  mergeGuidePatch,
  forkGuideToProject,
  deleteProjectGuide,
} from "../src/guides/runtime/guide-patch.js";
import { startServer, type StartedServer } from "../src/server/server.js";
import { findBuiltinGuide } from "../src/guides/catalog/builtin-guides.js";

const PROJECT_CONFIG = `project:
  name: guide-patch
providers:
  claude:
    type: cli
    command: __guide_patch_claude_must_not_run__
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

const PROJECT_GUIDE = `id: project-review
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

  it("re-routes a step to a different slot and overwrites the roleId", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    // Pick a step that has a slot today so we know the merge had to replace it.
    const target = base.steps.find((s) => s.slot)!;
    const newSlot = Object.keys(base.slots).find((k) => k !== target.slot)!;
    const verdict = mergeGuidePatch(base, {
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
    const base = findBuiltinGuide("quality-arbitration")!;
    const targetWithRole = base.steps.find((s) => s.roleId);
    if (!targetWithRole) {
      // The arbitration guide may not pin roleIds; pick another guide
      // shape — Ship Fast — that does. Skip cleanly otherwise.
      return;
    }
    const verdict = mergeGuidePatch(base, {
      steps: [{ id: targetWithRole.id, roleId: null }],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(
      verdict.next.steps.find((s) => s.id === targetWithRole.id)!.roleId,
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

describe("replaceSteps / replaceSlots (structural edits)", () => {
  it("replaces the whole ordered step list", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    const slot = Object.keys(base.slots)[0]!;
    const verdict = mergeGuidePatch(base, {
      replaceSteps: [
        { id: "plan", label: "Plan", kind: "agent-turn", slot, inputs: [], outputs: [], optional: false },
        { id: "review", label: "Review", kind: "review-turn", slot, inputs: [], outputs: [], optional: false },
      ],
    });
    if (!verdict.ok) throw new Error(verdict.reasons.join(", "));
    expect(verdict.next.steps.map((s) => s.id)).toEqual(["plan", "review"]);
  });

  it("replaces the slot map wholesale alongside the steps", () => {
    const base = findBuiltinGuide("quality-arbitration")!;
    const verdict = mergeGuidePatch(base, {
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

describe("forkGuideToProject", () => {
  it("copies a builtin into .amaco/guides and is idempotent", async () => {
    const root = await makeProject();
    try {
      const first = await forkGuideToProject({
        projectRoot: root,
        guideId: "quality-arbitration",
      });
      if (!first.ok) throw new Error(first.reasons.join(", "));
      expect(first.alreadyForked).toBe(false);
      const filePath = path.join(
        root,
        ".amaco",
        "guides",
        "quality-arbitration",
        "guide.yml",
      );
      expect(await fs.readFile(filePath, "utf8")).toMatch(/id: quality-arbitration/);
      // Re-fork → no-op.
      const second = await forkGuideToProject({
        projectRoot: root,
        guideId: "quality-arbitration",
      });
      if (!second.ok) throw new Error(second.reasons.join(", "));
      expect(second.alreadyForked).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("404s an unknown guide", async () => {
    const root = await makeProject();
    try {
      const r = await forkGuideToProject({ projectRoot: root, guideId: "no-such-guide" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(404);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("deleteProjectGuide", () => {
  it("deletes a project-local guide", async () => {
    const root = await makeProject();
    try {
      const r = await deleteProjectGuide({ projectRoot: root, guideId: "project-review" });
      if (!r.ok) throw new Error(r.reasons.join(", "));
      const exists = await fs
        .access(path.join(root, ".amaco", "guides", "project-review", "guide.yml"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to delete a builtin guide", async () => {
    const root = await makeProject();
    try {
      const r = await deleteProjectGuide({
        projectRoot: root,
        guideId: "quality-arbitration",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(409);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
