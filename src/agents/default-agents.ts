import path from "node:path";
import { fileURLToPath } from "node:url";
import { readText, pathExists } from "../utils/fs.js";
import type { BuiltinAgentId } from "./agent-schema.js";
import { builtinAgentIds } from "./agent-schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const candidates = [
  // Source build (tsx dev): src/agents/default-agents.ts -> sibling default-prompts.
  path.join(here, "default-prompts"),
  // Bundled build (dist/index.js): step up to package root, then src/agents/default-prompts.
  path.resolve(here, "..", "src", "agents", "default-prompts"),
  // Defensive: nested cases.
  path.resolve(here, "..", "..", "src", "agents", "default-prompts"),
];

async function findPromptsDir(): Promise<string> {
  for (const c of candidates) {
    if (await pathExists(c)) return c;
  }
  throw new Error(
    `Could not locate default-prompts directory. Looked in:\n${candidates.join("\n")}`,
  );
}

export async function readDefaultPrompt(agentId: BuiltinAgentId): Promise<string> {
  const dir = await findPromptsDir();
  return readText(path.join(dir, `${agentId}.md`));
}

export function getBuiltinAgentIds(): readonly BuiltinAgentId[] {
  return builtinAgentIds;
}
