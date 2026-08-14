// Every flow YAML that reaches disk must cross the Action Broker as a
// `file.write` and leave an evidence record. This is the invariant that lets a
// project deny flow authoring with the same `file.write` policy it uses for
// every other write - if a writer regains its own fs call, these fail.
//
// The broker here is the REAL one: each case drops an on-disk action policy in
// `.vibestrate/policies/` and lets `createActionBroker` load it, so the test
// drives the production decision path instead of an injected fake that could
// silently diverge from it.

import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  createProjectFlow,
  importFlowFromText,
} from "../src/flows/runtime/flow-portability.js";
import {
  applyFlowPatch,
  forkFlowToProject,
} from "../src/flows/runtime/flow-patch.js";
import { readActionLog } from "../src/safety/action-broker.js";

/** Same bucket the writer uses (`FLOW_AUDIT_RUN` in flow-portability.ts). */
const AUDIT_RUN = "flows";

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
`;

const NEW_FLOW = {
  id: "made-up-flow",
  version: 1,
  label: "Made Up Flow",
  description: "Created during a broker test.",
  seats: { worker: { label: "Worker" } },
  steps: [
    { id: "do", label: "Do the thing", kind: "agent-turn", seat: "worker" },
  ],
};

const IMPORTED_FLOW = `id: imported-flow
version: 1
label: Imported Flow
description: Imported during a broker test.
seats:
  worker:
    label: Worker
steps:
  - id: do
    label: Do the thing
    kind: agent-turn
    seat: worker
`;

const tmpRoots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-flowbroker-"));
  await fs.mkdir(path.join(root, ".vibestrate", "flows", "project-review"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, ".vibestrate", "flows", "project-review", "flow.yml"),
    PROJECT_FLOW,
  );
  tmpRoots.push(root);
  return root;
}

/** Drop an action policy that denies every `file.write` in this project. */
async function denyFileWrites(root: string): Promise<void> {
  const dir = path.join(root, ".vibestrate", "policies");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "no-writes.yml"),
    [
      "actions:",
      "  - id: no-file-writes",
      "    description: block every file write",
      "    on: [file.write]",
      "    effect: deny",
      "    message: file writes are blocked in this project",
      "",
    ].join("\n"),
  );
}

async function flowWriteRecords(root: string) {
  const log = await readActionLog(root, AUDIT_RUN);
  return log.filter((r) => r.request.kind === "file.write");
}

function flowFile(root: string, flowId: string): string {
  return path.join(root, ".vibestrate", "flows", flowId, "flow.yml");
}

async function exists(file: string): Promise<boolean> {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false);
}

afterEach(async () => {
  while (tmpRoots.length) {
    const r = tmpRoots.pop()!;
    await fs.rm(r, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("createProjectFlow crosses the Action Broker", () => {
  it("records a file.write with the written path on success", async () => {
    const root = await makeRoot();
    const result = await createProjectFlow({
      projectRoot: root,
      definition: NEW_FLOW,
    });
    if (!result.ok) throw new Error(result.reasons.join(", "));

    const writes = await flowWriteRecords(root);
    expect(writes).toHaveLength(1);
    const rec = writes[0]!;
    expect(rec.decision.effect).toBe("allow");
    expect(rec.request.subject.path).toBe(flowFile(root, "made-up-flow"));
    expect(rec.request.subject.purpose).toBe("flow-create");
    expect(rec.evidence?.ok).toBe(true);
  });

  it("refuses the write and leaves no file when a policy denies file.write", async () => {
    const root = await makeRoot();
    await denyFileWrites(root);

    const result = await createProjectFlow({
      projectRoot: root,
      definition: NEW_FLOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.reasons.join("\n")).toMatch(/Action broker deny/);

    expect(await exists(flowFile(root, "made-up-flow"))).toBe(false);
    const writes = await flowWriteRecords(root);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.decision.effect).toBe("deny");
  });
});

describe("importFlowFromText crosses the Action Broker", () => {
  it("refuses the write and leaves no file when a policy denies file.write", async () => {
    const root = await makeRoot();
    await denyFileWrites(root);

    const result = await importFlowFromText({
      projectRoot: root,
      text: IMPORTED_FLOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);

    expect(await exists(flowFile(root, "imported-flow"))).toBe(false);
    const writes = await flowWriteRecords(root);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.decision.effect).toBe("deny");
  });
});

describe("applyFlowPatch crosses the Action Broker", () => {
  it("records a file.write on success", async () => {
    const root = await makeRoot();
    const result = await applyFlowPatch({
      projectRoot: root,
      flowId: "project-review",
      patch: { label: "Renamed" },
    });
    if (!result.ok) throw new Error(result.reasons.join(", "));

    const writes = await flowWriteRecords(root);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.request.subject.purpose).toBe("flow-patch");
    expect(writes[0]!.evidence?.ok).toBe(true);
  });

  it("refuses the patch and leaves the flow untouched when a policy denies file.write", async () => {
    const root = await makeRoot();
    await denyFileWrites(root);
    const target = flowFile(root, "project-review");
    const before = await fs.readFile(target, "utf8");

    const result = await applyFlowPatch({
      projectRoot: root,
      flowId: "project-review",
      patch: { label: "Renamed" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);

    expect(await fs.readFile(target, "utf8")).toBe(before);
    const writes = await flowWriteRecords(root);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.decision.effect).toBe("deny");
  });
});

describe("forkFlowToProject crosses the Action Broker", () => {
  it("records a file.write when a builtin is copied into the project", async () => {
    const root = await makeRoot();
    const result = await forkFlowToProject({
      projectRoot: root,
      flowId: "quality-arbitration",
    });
    if (!result.ok) throw new Error(result.reasons.join(", "));

    const writes = await flowWriteRecords(root);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.request.subject.purpose).toBe("flow-fork");
    expect(writes[0]!.request.subject.flowId).toBe("quality-arbitration");
    expect(writes[0]!.evidence?.ok).toBe(true);
  });

  it("refuses the fork and leaves no file when a policy denies file.write", async () => {
    const root = await makeRoot();
    await denyFileWrites(root);

    const result = await forkFlowToProject({
      projectRoot: root,
      flowId: "quality-arbitration",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);

    expect(await exists(flowFile(root, "quality-arbitration"))).toBe(false);
    const writes = await flowWriteRecords(root);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.decision.effect).toBe("deny");
  });
});

describe("a targeted path policy reaches the flows directory", () => {
  it("denies a write matching a pathGlob over .vibestrate/flows", async () => {
    const root = await makeRoot();
    const dir = path.join(root, ".vibestrate", "policies");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "flows-locked.yml"),
      [
        "actions:",
        "  - id: flows-locked",
        "    description: flow recipes are reviewed by hand here",
        "    on: [file.write]",
        "    match: { pathGlob: '**/.vibestrate/flows/**' }",
        "    effect: deny",
        "    message: flow definitions are locked",
        "",
      ].join("\n"),
    );

    const result = await createProjectFlow({
      projectRoot: root,
      definition: NEW_FLOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join("\n")).toMatch(/flow definitions are locked/);
    expect(await exists(flowFile(root, "made-up-flow"))).toBe(false);
  });
});
