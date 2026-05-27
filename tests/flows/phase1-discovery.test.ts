import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  discoverFlows,
  FlowDiscoveryError,
} from "../../src/flows/catalog/flow-discovery.js";
import {
  startServer,
  type StartedServer,
} from "../../src/server/server.js";

const PROJECT_CONFIG = `project:
  name: flows-phase1
providers:
  claude:
    type: cli
    command: __flow_phase1_claude_must_not_run__
  codex:
    type: cli
    command: __flow_phase1_codex_must_not_run__
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
`;

async function makeProject(): Promise<string> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-flows-phase1-"));
  await fs.mkdir(path.join(projectRoot, ".amaco"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, ".amaco", "project.yml"),
    PROJECT_CONFIG,
  );
  await fs.mkdir(path.join(projectRoot, ".amaco", "flows", "project-review"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(projectRoot, ".amaco", "flows", "project-review", "flow.yml"),
    PROJECT_FLOW,
  );
  return projectRoot;
}

let server: StartedServer | null = null;

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("Flow Phase 1 discovery", () => {
  it("discovers built-in and project Flow definitions", async () => {
    const projectRoot = await makeProject();
    const flows = await discoverFlows(projectRoot);

    expect(flows.map((flow) => flow.id)).toEqual(
      expect.arrayContaining(["quality-arbitration", "project-review"]),
    );
    expect(flows.find((flow) => flow.id === "project-review")).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({ kind: "project" }),
        definitionPath: expect.stringMatching(/flow\.yml$/),
      }),
    );
  });

  it("lets a project flow shadow a builtin of the same id (fork to customize)", async () => {
    const projectRoot = await makeProject();
    await fs.mkdir(
      path.join(projectRoot, ".amaco", "flows", "quality-arbitration"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(
        projectRoot,
        ".amaco",
        "flows",
        "quality-arbitration",
        "flow.yml",
      ),
      PROJECT_FLOW.replace("project-review", "quality-arbitration"),
    );

    const flows = await discoverFlows(projectRoot);
    const winner = flows.filter((g) => g.id === "quality-arbitration");
    // Exactly one entry, and it's the project copy (not the builtin).
    expect(winner).toHaveLength(1);
    expect(winner[0]!.source.kind).toBe("project");
  });

  it("rejects two project flows that claim the same id", async () => {
    const projectRoot = await makeProject();
    await fs.mkdir(path.join(projectRoot, ".amaco", "flows", "dup"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, ".amaco", "flows", "dup", "flow.yml"),
      PROJECT_FLOW.replace("project-review", "project-review"), // id stays project-review
    );
    await expect(discoverFlows(projectRoot)).rejects.toThrow(
      FlowDiscoveryError,
    );
  });
});

describe("Flow Phase 1 server preview", () => {
  it("lists Flows and resolves the shared preview snapshot", async () => {
    const projectRoot = await makeProject();
    server = await startServer({ projectRoot, port: 0, host: "127.0.0.1" });

    const list = (await fetch(`${server.url}/api/flows`).then((res) =>
      res.json(),
    )) as { flows: { id: string }[] };
    expect(list.flows.map((flow) => flow.id)).toContain("quality-arbitration");

    const res = await fetch(
      `${server.url}/api/flows/quality-arbitration/resolve`,
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
        flowId: string;
        slots: { id: string; providerId: string }[];
        steps: { id: string; enabled: boolean }[];
      };
    };
    expect(body.snapshot.flowId).toBe("quality-arbitration");
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
      `${server.url}/api/flows/quality-arbitration/resolve`,
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
