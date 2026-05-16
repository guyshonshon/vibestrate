import path from "node:path";
import fs from "node:fs/promises";
import { pathExists, readText } from "../utils/fs.js";
import { isPathInside, projectSkillsDir } from "../utils/paths.js";
import { readSkillMcpServers } from "../mcp/mcp-resolve.js";
import type { McpServersMap } from "../mcp/mcp-schema.js";

export type SkillSource = "amaco" | "claude" | "user";

export type DiscoveredSkill = {
  id: string;
  name: string;
  description: string | null;
  source: SkillSource;
  filePath: string;
  rootDir: string;
  bodyPreview: string;
  frontmatter: Record<string, unknown>;
  /**
   * MCP servers declared by a sibling `.mcp.json` next to the skill's
   * `SKILL.md`. Empty when no file exists or for flat `.md` skills.
   * Errors during parsing are surfaced via `mcpError` so the UI/CLI
   * can tell the user the file exists but failed validation, rather
   * than silently dropping it.
   */
  mcpServers: McpServersMap;
  mcpError: string | null;
};

const SKILL_FILE_NAMES = ["SKILL.md", "skill.md"];

function parseFrontmatter(text: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!text.startsWith("---")) return { frontmatter: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { frontmatter: {}, body: text };
  const block = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\s*\n/, "");
  const fm: Record<string, unknown> = {};
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    fm[key] = val;
  }
  return { frontmatter: fm, body };
}

function makeSkillId(source: SkillSource, name: string): string {
  return `${source}:${name}`;
}

async function discoverFromDir(input: {
  rootDir: string;
  source: SkillSource;
}): Promise<DiscoveredSkill[]> {
  const out: DiscoveredSkill[] = [];
  if (!(await pathExists(input.rootDir))) return out;
  let entries: string[];
  try {
    entries = await fs.readdir(input.rootDir);
  } catch {
    return out;
  }
  for (const entry of entries.sort()) {
    const candidatePath = path.join(input.rootDir, entry);
    let stat;
    try {
      stat = await fs.stat(candidatePath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Look for SKILL.md (or skill.md) inside.
      let skillFile: string | null = null;
      for (const fileName of SKILL_FILE_NAMES) {
        const p = path.join(candidatePath, fileName);
        if (await pathExists(p)) {
          skillFile = p;
          break;
        }
      }
      if (!skillFile) continue;
      if (!isPathInside(input.rootDir, skillFile)) continue;
      const text = await readText(skillFile);
      const { frontmatter, body } = parseFrontmatter(text);
      const fmName = typeof frontmatter.name === "string" ? frontmatter.name : entry;
      const description =
        typeof frontmatter.description === "string"
          ? frontmatter.description
          : null;
      let mcpServers: McpServersMap = {};
      let mcpError: string | null = null;
      try {
        mcpServers = await readSkillMcpServers(skillFile);
      } catch (err) {
        mcpError = err instanceof Error ? err.message : String(err);
      }
      out.push({
        id: makeSkillId(input.source, fmName),
        name: fmName,
        description,
        source: input.source,
        filePath: skillFile,
        rootDir: input.rootDir,
        bodyPreview: body.slice(0, 240),
        frontmatter,
        mcpServers,
        mcpError,
      });
      continue;
    }

    // Flat .md skill (legacy Amaco style).
    if (entry.endsWith(".md") && entry !== "README.md") {
      const text = await readText(candidatePath);
      const { frontmatter, body } = parseFrontmatter(text);
      const stem = entry.replace(/\.md$/i, "");
      const name = typeof frontmatter.name === "string" ? frontmatter.name : stem;
      const description =
        typeof frontmatter.description === "string"
          ? frontmatter.description
          : null;
      // Flat skills can't carry a sibling .mcp.json (they have no
      // dedicated dir), so MCP servers are always empty for this shape.
      out.push({
        id: makeSkillId(input.source, name),
        name,
        description,
        source: input.source,
        filePath: candidatePath,
        rootDir: input.rootDir,
        bodyPreview: body.slice(0, 240),
        frontmatter,
        mcpServers: {},
        mcpError: null,
      });
    }
  }
  return out;
}

export async function discoverSkills(projectRoot: string): Promise<DiscoveredSkill[]> {
  const amacoDir = projectSkillsDir(projectRoot);
  const claudeDir = path.join(projectRoot, ".claude", "skills");

  const [amaco, claude] = await Promise.all([
    discoverFromDir({ rootDir: amacoDir, source: "amaco" }),
    discoverFromDir({ rootDir: claudeDir, source: "claude" }),
  ]);

  const merged: DiscoveredSkill[] = [];
  const seen = new Set<string>();
  for (const skill of [...amaco, ...claude]) {
    if (seen.has(skill.id)) continue;
    seen.add(skill.id);
    merged.push(skill);
  }
  return merged;
}

export async function findSkillById(
  projectRoot: string,
  id: string,
): Promise<DiscoveredSkill | null> {
  const all = await discoverSkills(projectRoot);
  return all.find((s) => s.id === id) ?? null;
}

export async function findSkillByName(
  projectRoot: string,
  name: string,
): Promise<DiscoveredSkill | null> {
  const all = await discoverSkills(projectRoot);
  return all.find((s) => s.name === name) ?? null;
}
