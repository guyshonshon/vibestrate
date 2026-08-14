/**
 * Role prompts are stored as JSON role files, not Markdown. These cover the two
 * halves that have to agree - what `vibe init` scaffolds and what the run path
 * loads - plus the failure messages a project on the old `.md` shape gets.
 */
import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runInit } from "../src/project/init-template.js";
import { loadConfig, loadRolePrompt } from "../src/project/config-loader.js";
import { parseRoleFile, ROLE_FILE_SCHEMA_VERSION } from "../src/agents/role-schema.js";
import { getBuiltinRoleIds } from "../src/agents/default-roles.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const promptsDir = path.join(repoRoot, "src", "agents", "default-prompts");

const tmpDirs: string[] = [];
async function tempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-role-file-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })),
  );
});

async function writeRoleFile(dir: string, id: string, body: unknown): Promise<string> {
  const file = path.join(dir, `${id}.json`);
  await fs.writeFile(file, JSON.stringify(body), "utf8");
  return file;
}

describe("role files are JSON", () => {
  it("every bundled role file parses, including the roadmap planner", async () => {
    const ids = [...getBuiltinRoleIds(), "roadmap-planner"];
    for (const id of ids) {
      const file = path.join(promptsDir, `${id}.json`);
      const parsed = parseRoleFile(await fs.readFile(file, "utf8"), file);
      expect(parsed.id).toBe(id);
      expect(parsed.prompt.trim().length).toBeGreaterThan(0);
    }
  });

  it("the bundled dir ships no Markdown prompts", async () => {
    const entries = await fs.readdir(promptsDir);
    expect(entries.filter((f) => f.endsWith(".md"))).toEqual([]);
  });

  it("init scaffolds JSON role files the loader can read", async () => {
    const projectRoot = await tempProject();
    await runInit({ projectRoot });

    const rolesDir = path.join(projectRoot, ".vibestrate", "roles");
    const entries = await fs.readdir(rolesDir);
    expect(entries.filter((f) => f.endsWith(".md"))).toEqual([]);
    for (const roleId of getBuiltinRoleIds()) {
      expect(entries).toContain(`${roleId}.json`);
    }

    // Drive the real read path: whatever init wrote, the run path must load.
    const { config } = await loadConfig(projectRoot);
    const roles = config.crews[config.defaultCrew]!.roles;
    for (const [roleId, role] of Object.entries(roles)) {
      expect(role.prompt.endsWith(".json"), `${roleId} still points at ${role.prompt}`)
        .toBe(true);
      const prompt = await loadRolePrompt(projectRoot, role.prompt);
      expect(prompt.trim().length).toBeGreaterThan(0);
      // The instruction text, not the envelope.
      expect(prompt.trimStart().startsWith("{")).toBe(false);
    }
  });

  it("a config still pointing at a .md prompt fails with the fix in the message", async () => {
    const projectRoot = await tempProject();
    await expect(
      loadRolePrompt(projectRoot, ".vibestrate/roles/planner.md"),
    ).rejects.toThrow(/\.vibestrate\/roles\/planner\.json/);
  });

  it("a missing role file names the path", async () => {
    const projectRoot = await tempProject();
    await expect(
      loadRolePrompt(projectRoot, ".vibestrate/roles/nobody.json"),
    ).rejects.toThrow(/nobody\.json/);
  });

  it("a role file that is really Markdown fails as invalid JSON", async () => {
    const dir = await tempProject();
    const file = path.join(dir, "planner.json");
    await fs.writeFile(file, "# Planner Agent\n\nYou plan things.\n", "utf8");
    await expect(loadRolePrompt(dir, file)).rejects.toThrow(/not valid JSON/);
  });

  it("rejects an unknown schemaVersion instead of guessing", async () => {
    const dir = await tempProject();
    const file = await writeRoleFile(dir, "planner", {
      schemaVersion: ROLE_FILE_SCHEMA_VERSION + 1,
      id: "planner",
      prompt: "hi",
    });
    await expect(loadRolePrompt(dir, file)).rejects.toThrow(/schemaVersion/);
  });

  it("rejects unknown keys so a typo is not silently dropped", async () => {
    const dir = await tempProject();
    const file = await writeRoleFile(dir, "planner", {
      schemaVersion: ROLE_FILE_SCHEMA_VERSION,
      id: "planner",
      prompt: "hi",
      promptText: "hi",
    });
    await expect(loadRolePrompt(dir, file)).rejects.toThrow(/promptText/);
  });

  it("rejects an id that disagrees with the filename", async () => {
    const dir = await tempProject();
    const file = await writeRoleFile(dir, "my-planner", {
      schemaVersion: ROLE_FILE_SCHEMA_VERSION,
      id: "planner",
      prompt: "hi",
    });
    await expect(loadRolePrompt(dir, file)).rejects.toThrow(/my-planner\.json/);
  });

  it("an empty prompt is a broken role, not an empty one", async () => {
    const dir = await tempProject();
    const file = await writeRoleFile(dir, "planner", {
      schemaVersion: ROLE_FILE_SCHEMA_VERSION,
      id: "planner",
      prompt: "",
    });
    await expect(loadRolePrompt(dir, file)).rejects.toThrow(/prompt/);
  });
});
