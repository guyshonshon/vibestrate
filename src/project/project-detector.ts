import path from "node:path";
import fs from "node:fs/promises";
import { findGitRoot } from "../git/git.js";
import { pathExists } from "../utils/fs.js";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun" | "unknown";
export type ProjectType =
  | "nextjs"
  | "vite"
  | "typescript"
  | "node"
  | "generic";

export type ProjectContext = {
  projectRoot: string;
  gitRoot: string | null;
  isGitRepo: boolean;
};

export type DetectedProject = {
  projectRoot: string;
  isGitRepo: boolean;
  name: string;
  packageManager: PackageManager;
  projectType: ProjectType;
  hasPackageJson: boolean;
  packageScripts: Record<string, string>;
  suggestedValidationCommands: string[];
  notes: string[];
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
  const pkg = await readPackageJson(projectRoot);
  if (pkg?.name && typeof pkg.name === "string" && pkg.name.trim().length > 0) {
    return pkg.name.trim();
  }
  return base;
}

type PackageJson = {
  name?: unknown;
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};

async function readPackageJson(projectRoot: string): Promise<PackageJson | null> {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!(await pathExists(pkgPath))) return null;
  try {
    const raw = await fs.readFile(pkgPath, "utf8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

export async function detectPackageManager(projectRoot: string): Promise<PackageManager> {
  if (await pathExists(path.join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (await pathExists(path.join(projectRoot, "bun.lockb"))) return "bun";
  if (await pathExists(path.join(projectRoot, "bun.lock"))) return "bun";
  if (await pathExists(path.join(projectRoot, "yarn.lock"))) return "yarn";
  if (await pathExists(path.join(projectRoot, "package-lock.json"))) return "npm";
  return "unknown";
}

export async function detectProjectType(projectRoot: string): Promise<ProjectType> {
  const has = (rel: string) => pathExists(path.join(projectRoot, rel));

  if (
    (await has("next.config.js")) ||
    (await has("next.config.mjs")) ||
    (await has("next.config.ts")) ||
    (await has("next.config.cjs"))
  ) {
    return "nextjs";
  }
  if (
    (await has("vite.config.js")) ||
    (await has("vite.config.mjs")) ||
    (await has("vite.config.ts")) ||
    (await has("vite.config.cjs"))
  ) {
    return "vite";
  }
  if (await has("tsconfig.json")) return "typescript";
  if (await has("package.json")) return "node";
  return "generic";
}

function packageScripts(pkg: PackageJson | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!pkg?.scripts || typeof pkg.scripts !== "object") return out;
  for (const [k, v] of Object.entries(pkg.scripts)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

const VALIDATION_SCRIPT_PRIORITY = [
  "lint",
  "typecheck",
  "type-check",
  "tsc",
  "check-types",
  "test",
  "test:unit",
  "test:ci",
];

function pmCommandFor(pm: PackageManager, scriptName: string): string | null {
  switch (pm) {
    case "pnpm":
      return `pnpm ${scriptName}`;
    case "yarn":
      return `yarn ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    case "npm":
      return `npm run ${scriptName}`;
    case "unknown":
    default:
      return null;
  }
}

export function suggestValidationCommands(
  pm: PackageManager,
  scripts: Record<string, string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of VALIDATION_SCRIPT_PRIORITY) {
    if (!scripts[candidate]) continue;
    const cmd = pmCommandFor(pm, candidate);
    if (!cmd || seen.has(cmd)) continue;
    seen.add(cmd);
    out.push(cmd);
  }
  return out;
}

export async function detectFullProject(
  cwd: string = process.cwd(),
): Promise<DetectedProject> {
  const ctx = await detectProject(cwd);
  const pkg = await readPackageJson(ctx.projectRoot);
  const name = await defaultProjectName(ctx.projectRoot);
  const packageManager = await detectPackageManager(ctx.projectRoot);
  const projectType = await detectProjectType(ctx.projectRoot);
  const scripts = packageScripts(pkg);
  const suggested = suggestValidationCommands(packageManager, scripts);

  const notes: string[] = [];
  if (!ctx.isGitRepo) {
    notes.push("Not inside a git repository. Run `git init` before `vibestrate run`.");
  }
  if (!pkg) {
    notes.push("No package.json found — Vibestrate cannot suggest validation commands.");
  } else if (suggested.length === 0) {
    notes.push(
      "package.json has no recognized scripts (lint/typecheck/test). You can still run Vibestrate; reviews are stronger when validation is configured.",
    );
  }
  if (packageManager === "unknown" && pkg) {
    notes.push(
      "No lockfile detected. Vibestrate cannot suggest a package-manager-specific command. Run `vibestrate config set commands.validate \"[...]\"` to add your own.",
    );
  }

  return {
    projectRoot: ctx.projectRoot,
    isGitRepo: ctx.isGitRepo,
    name,
    packageManager,
    projectType,
    hasPackageJson: pkg !== null,
    packageScripts: scripts,
    suggestedValidationCommands: suggested,
    notes,
  };
}

export function describeProjectType(t: ProjectType): string {
  switch (t) {
    case "nextjs":
      return "Next.js";
    case "vite":
      return "Vite";
    case "typescript":
      return "TypeScript";
    case "node":
      return "Node.js";
    case "generic":
    default:
      return "Generic";
  }
}
