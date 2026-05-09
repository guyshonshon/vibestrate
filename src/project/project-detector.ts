import path from "node:path";
import { findGitRoot } from "../git/git.js";
import { pathExists } from "../utils/fs.js";

export type ProjectContext = {
  projectRoot: string;
  gitRoot: string | null;
  isGitRepo: boolean;
};

export async function detectProject(cwd: string = process.cwd()): Promise<ProjectContext> {
  const gitRoot = await findGitRoot(cwd);
  const projectRoot = gitRoot ?? cwd;
  return {
    projectRoot,
    gitRoot,
    isGitRepo: gitRoot !== null,
  };
}

export async function defaultProjectName(projectRoot: string): Promise<string> {
  const base = path.basename(projectRoot);
  const pkgPath = path.join(projectRoot, "package.json");
  if (await pathExists(pkgPath)) {
    try {
      const fs = await import("node:fs/promises");
      const raw = await fs.readFile(pkgPath, "utf8");
      const json = JSON.parse(raw) as { name?: unknown };
      if (typeof json.name === "string" && json.name.trim().length > 0) {
        return json.name.trim();
      }
    } catch {
      // ignore
    }
  }
  return base;
}
