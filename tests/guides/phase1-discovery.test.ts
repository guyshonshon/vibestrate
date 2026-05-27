import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  discoverGuides,
  GuideDiscoveryError,
} from "../../src/guides/catalog/guide-discovery.js";
import {
  startServer,
  type StartedServer,
} from "../../src/server/server.js";

const PROJECT_CONFIG = `project:
  name: guides-phase1
providers:
  claude:
    type: cli
    command: __guide_phase1_claude_must_not_run__
  codex:
    type: cli
    command: __guide_phase1_codex_must_not_run__
roles:
  planner:
    provider: claude
    prompt: .amaco/roles/planner.md
    permissions: readOnly
  architect:
    provider: claude
    prompt: .amaco/roles/architect.md
    permissions: readOnly
  executor:
    provider: claude
    prompt: .amaco/roles/executor.md
    permissions: codeWrite
  fixer:
    provider: claude
    prompt: .amaco/roles/fixer.md
    permissions: codeWrite
  reviewer:
    provider: codex
    prompt: .amaco/roles/reviewer.md
    permissions: readOnly
  verifier:
    provider: codex
    prompt: .amaco/roles/verifier.md
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
`;

async function makeProject(): Promise<string> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-guides-phase1-"));
  await fs.mkdir(path.join(projectRoot, ".amaco"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, ".amaco", "project.yml"),
    PROJECT_CONFIG,
  );
  await fs.mkdir(path.join(projectRoot, ".amaco", "guides", "project-review"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(projectRoot, ".amaco", "guides", "project-review", "guide.yml"),
    PROJECT_GUIDE,
  );
  return projectRoot;
}

let server: StartedServer | null = null;

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("Guide Phase 1 discovery", () => {
  it("discovers built-in and project Guide definitions", async () => {
    const projectRoot = await makeProject();
    const guides = await discoverGuides(projectRoot);

    expect(guides.map((guide) => guide.id)).toEqual(
      expect.arrayContaining(["quality-arbitration", "project-review"]),
    );
    expect(guides.find((guide) => guide.id === "project-review")).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({ kind: "project" }),
        definitionPath: expect.stringMatching(/guide\.yml$/),
      }),
    );
  });

  it("lets a project guide shadow a builtin of the same id (fork to customize)", async () => {
    const projectRoot = await makeProject();
    await fs.mkdir(
      path.join(projectRoot, ".amaco", "guides", "quality-arbitration"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(
        projectRoot,
        ".amaco",
        "guides",
        "quality-arbitration",
        "guide.yml",
      ),
      PROJECT_GUIDE.replace("project-review", "quality-arbitration"),
    );

    const guides = await discoverGuides(projectRoot);
    const winner = guides.filter((g) => g.id === "quality-arbitration");
    // Exactly one entry, and it's the project copy (not the builtin).
    expect(winner).toHaveLength(1);
    expect(winner[0]!.source.kind).toBe("project");
  });

  it("rejects two project guides that claim the same id", async () => {
    const projectRoot = await makeProject();
    await fs.mkdir(path.join(projectRoot, ".amaco", "guides", "dup"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, ".amaco", "guides", "dup", "guide.yml"),
      PROJECT_GUIDE.replace("project-review", "project-review"), // id stays project-review
    );
    await expect(discoverGuides(projectRoot)).rejects.toThrow(
      GuideDiscoveryError,
    );
  });
});

describe("Guide Phase 1 server preview", () => {
  it("lists Guides and resolves the shared preview snapshot", async () => {
    const projectRoot = await makeProject();
    server = await startServer({ projectRoot, port: 0, host: "127.0.0.1" });

    const list = (await fetch(`${server.url}/api/guides`).then((res) =>
      res.json(),
    )) as { guides: { id: string }[] };
    expect(list.guides.map((guide) => guide.id)).toContain("quality-arbitration");

    const res = await fetch(
      `${server.url}/api/guides/quality-arbitration/resolve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "Preview the quality arbitration plan.",
          slotProviders: { challenger: "claude" },
          skippedOptionalSteps: ["plan-review"],
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      snapshot: {
        guideId: string;
        slots: { id: string; providerId: string }[];
        steps: { id: string; enabled: boolean }[];
      };
    };
    expect(body.snapshot.guideId).toBe("quality-arbitration");
    expect(body.snapshot.slots).toContainEqual(
      expect.objectContaining({ id: "challenger", providerId: "claude" }),
    );
    expect(body.snapshot.steps).toContainEqual(
      expect.objectContaining({ id: "plan-review", enabled: false }),
    );
  });

  it("returns a client error for an invalid slot override", async () => {
    const projectRoot = await makeProject();
    server = await startServer({ projectRoot, port: 0, host: "127.0.0.1" });

    const res = await fetch(
      `${server.url}/api/guides/quality-arbitration/resolve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "Reject an unknown slot before providers run.",
          slotProviders: { ghost: "codex" },
        }),
      },
    );
    expect(res.status).toBe(400);
  });
});
