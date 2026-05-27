import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  readComposerPresets,
  slugifyPresetName,
  upsertComposerPreset,
  deleteComposerPreset,
} from "../src/server/composer-presets.js";
import { startServer, type StartedServer } from "../src/server/server.js";

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-presets-"));
  await fs.mkdir(path.join(root, ".amaco"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".amaco", "project.yml"),
    `project:
  name: presets-test
providers:
  claude:
    type: cli
    command: __must_not_run__
roles:
  planner:
    provider: claude
    prompt: .amaco/roles/planner.md
    permissions: readOnly
`,
  );
  return root;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("slugifyPresetName (pure)", () => {
  it("lowercases / dashes / strips junk and caps length", () => {
    expect(slugifyPresetName("Quality · Arbitration")).toBe(
      "quality-arbitration",
    );
    expect(slugifyPresetName("  Hello  World  ")).toBe("hello-world");
    expect(slugifyPresetName("$$$$")).toBe("preset");
  });
});

describe("upsertComposerPreset", () => {
  it("inserts new presets and updates existing ones by slug", async () => {
    const root = await makeProject();
    const first = await upsertComposerPreset({
      projectRoot: root,
      preset: {
        name: "Ship Fast Crew",
        kind: "crew",
        brief: null,
        guide: {
          id: "ship-fast",
          contextPolicy: "balanced",
          slotProviders: { executor: "claude" },
          skippedOptionalSteps: [],
        },
        provider: null,
        skills: ["typescript"],
        readOnly: false,
      },
    });
    expect(first.created).toBe(true);
    expect(first.preset.createdAt).toBeDefined();

    const second = await upsertComposerPreset({
      projectRoot: root,
      preset: {
        name: "ship fast crew",
        kind: "crew",
        brief: null,
        guide: {
          id: "ship-fast",
          contextPolicy: "compact",
          slotProviders: { executor: "claude" },
          skippedOptionalSteps: [],
        },
        provider: null,
        skills: ["typescript", "react"],
        readOnly: true,
      },
    });
    expect(second.created).toBe(false);
    expect(second.preset.createdAt).toBe(first.preset.createdAt);
    expect(second.preset.skills).toEqual(["typescript", "react"]);
    expect(second.preset.readOnly).toBe(true);
    expect(second.preset.guide?.contextPolicy).toBe("compact");

    const list = await readComposerPresets(root);
    expect(list).toHaveLength(1);
  });

  it("delete is idempotent (returns deleted=false for unknown names)", async () => {
    const root = await makeProject();
    expect(
      (await deleteComposerPreset({ projectRoot: root, name: "nope" })).deleted,
    ).toBe(false);
    await upsertComposerPreset({
      projectRoot: root,
      preset: {
        name: "Test",
        kind: "template",
        brief: "a brief",
        guide: null,
        provider: null,
        skills: [],
        readOnly: false,
      },
    });
    expect(
      (await deleteComposerPreset({ projectRoot: root, name: "Test" })).deleted,
    ).toBe(true);
    expect(await readComposerPresets(root)).toHaveLength(0);
  });
});

describe("composer presets HTTP routes", () => {
  it("POST creates, GET lists, DELETE removes — full round-trip", async () => {
    const root = await makeProject();
    server = await startServer({
      projectRoot: root,
      port: 0,
      host: "127.0.0.1",
    });

    const create = await fetch(`${server.url}/api/composer/presets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Quality Crew",
        kind: "crew",
        guide: {
          id: "quality-arbitration",
          contextPolicy: "balanced",
          slotProviders: {},
          skippedOptionalSteps: [],
        },
        skills: [],
        readOnly: false,
      }),
    });
    expect(create.status).toBe(201);

    const list = await fetch(`${server.url}/api/composer/presets`).then((r) =>
      r.json(),
    );
    expect((list as { presets: unknown[] }).presets).toHaveLength(1);

    const deleted = await fetch(
      `${server.url}/api/composer/presets/${encodeURIComponent("Quality Crew")}`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(200);

    const missing = await fetch(
      `${server.url}/api/composer/presets/${encodeURIComponent("Quality Crew")}`,
      { method: "DELETE" },
    );
    expect(missing.status).toBe(404);
  });

  it("rejects invalid bodies with 400", async () => {
    const root = await makeProject();
    server = await startServer({
      projectRoot: root,
      port: 0,
      host: "127.0.0.1",
    });
    const bad = await fetch(`${server.url}/api/composer/presets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(bad.status).toBe(400);
  });
});
