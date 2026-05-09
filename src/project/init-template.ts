import path from "node:path";
import { ensureDir, writeText, pathExists } from "../utils/fs.js";
import {
  amacoRoot,
  projectAgentsDir,
  projectConfigPath,
  projectRulesPath,
  projectRunsDir,
  projectSkillsDir,
} from "../utils/paths.js";
import {
  getBuiltinAgentIds,
  readDefaultPrompt,
} from "../agents/default-agents.js";
import { defaultProjectName } from "./project-detector.js";

const RULES_TEMPLATE = `# Project Rules for Amaco

These rules are provided to local agent CLIs during Amaco runs.

## Project Overview

Describe the project here.

## Architecture Rules

Add architecture constraints here.

## Code Style Rules

Add code style and implementation conventions here.

## Testing Rules

Add testing expectations here.

## Security Rules

- Do not read or print secrets.
- Do not edit \`.env\` files.
- Do not weaken authentication or authorization.
- Do not skip validation commands.
- Do not fake test results.
- Do not make unrelated broad refactors.

## Product / UX Rules

Add product behavior, UX, and copywriting rules here.

## Agent Behavior Rules

- Stay within task scope.
- Ask for human approval only when blocked, unsafe, ambiguous, or when destructive actions are needed.
- Do not push.
- Do not merge.
- Preserve artifacts.
- Report uncertainty clearly.

## Additional Notes

Add anything planner, architect, executor, reviewer, and verifier agents should know.
`;

const SKILLS_README = `# Project Skills

Drop reusable instruction bundles here as Markdown files. Each filename stem
(e.g. \`security.md\` → \`security\`) is the name you reference in
\`.amaco/project.yml\` under \`agents.<agent>.skills\`.

Examples:

- security.md
- frontend-ux.md
- testing.md
- privacy.md
- database.md
- performance.md
- accessibility.md

Skills are explicit only in V0 — they are loaded only when listed in config.
`;

function projectYaml(projectName: string): string {
  return `project:
  name: "${projectName}"
  type: generic

git:
  mainBranch: main
  branchPrefix: amaco/
  worktreeDir: ../.amaco-worktrees
  requireCleanMain: false
  allowAutoMerge: false
  allowAutoPush: false

workflow:
  id: default-plan-build-review
  maxReviewLoops: 2
  requireHumanMerge: true

execution:
  backend: local-worktree

providers:
  claude:
    type: cli
    command: claude
    args:
      - "-p"
    input: stdin

agents:
  planner:
    provider: claude
    prompt: .amaco/agents/planner.md
    permissions: read_only
    skills: []

  architect:
    provider: claude
    prompt: .amaco/agents/architect.md
    permissions: read_only
    skills: []

  executor:
    provider: claude
    prompt: .amaco/agents/executor.md
    permissions: code_write
    skills: []

  fixer:
    provider: claude
    prompt: .amaco/agents/fixer.md
    permissions: code_write
    skills: []

  reviewer:
    provider: claude
    prompt: .amaco/agents/reviewer.md
    permissions: read_only
    skills: []

  verifier:
    provider: claude
    prompt: .amaco/agents/verifier.md
    permissions: read_only
    skills: []

commands:
  validate: []

permissions:
  profiles:
    read_only:
      allowWrite: false
      allowShell: false
      cwd: worktree
    code_write:
      allowWrite: true
      allowShell: true
      cwd: worktree
      forbiddenPaths:
        - ".env"
        - ".env.*"
      forbiddenOperations:
        - "push"
        - "merge"
        - "delete-worktree"

policies:
  forbidMainBranchWrites: true
  forbidSecretsAccess: true
  forbidAutoPush: true
  forbidAutoMerge: true
  preserveArtifacts: true
`;
}

export type InitOptions = {
  projectRoot: string;
  force?: boolean;
};

export type InitResult = {
  created: string[];
  skipped: string[];
};

async function writeIfMissing(
  filePath: string,
  contents: string,
  result: InitResult,
  force: boolean,
): Promise<void> {
  const exists = await pathExists(filePath);
  if (exists && !force) {
    result.skipped.push(filePath);
    return;
  }
  await writeText(filePath, contents);
  result.created.push(filePath);
}

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const { projectRoot } = opts;
  const force = !!opts.force;

  const result: InitResult = { created: [], skipped: [] };

  await ensureDir(amacoRoot(projectRoot));
  await ensureDir(projectAgentsDir(projectRoot));
  await ensureDir(projectSkillsDir(projectRoot));
  await ensureDir(projectRunsDir(projectRoot));

  const name = await defaultProjectName(projectRoot);
  await writeIfMissing(
    projectConfigPath(projectRoot),
    projectYaml(name),
    result,
    force,
  );
  await writeIfMissing(projectRulesPath(projectRoot), RULES_TEMPLATE, result, force);
  await writeIfMissing(
    path.join(projectSkillsDir(projectRoot), "README.md"),
    SKILLS_README,
    result,
    force,
  );

  for (const agentId of getBuiltinAgentIds()) {
    const target = path.join(projectAgentsDir(projectRoot), `${agentId}.md`);
    const contents = await readDefaultPrompt(agentId);
    await writeIfMissing(target, contents, result, force);
  }

  return result;
}
