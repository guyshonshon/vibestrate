import path from "node:path";
import { ensureDir, writeText, pathExists } from "../utils/fs.js";
import {
  amacoRoot,
  policiesDir,
  projectRolesDir,
  projectConfigPath,
  projectRulesPath,
  projectRunsDir,
  projectSkillsDir,
} from "../utils/paths.js";
import {
  getBuiltinRoleIds,
  readDefaultPrompt,
} from "../roles/default-roles.js";
import { defaultProjectName } from "./project-detector.js";
import type { SetupPlan } from "../setup/setup-service.js";

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

const POLICIES_README = `# Amaco Policies

User-supplied rules that refuse a suggestion or bundle apply if they match.
They never *permit* a patch — built-in safety (path-based + content-based
secret scanning) always runs first.

Drop \`*.yml\` (or \`*.yaml\`) files into this directory. Example:

\`\`\`yaml
rules:
  - id: no-console-log
    description: Use the logger, not console.log.
    appliesTo: [suggestion-apply, bundle-apply]
    matchAddedContent:
      regex: 'console\\.log'
      # flags is optional; subset of [gimsuy]
      flags: i
    # matchTouchedFiles is optional. When both matchers are present
    # both must hit (AND). At least one matcher is required.
    matchTouchedFiles:
      glob: 'src/**'
    message: "Use the logger instead of console.log."
\`\`\`

V0 limits:

- Surfaces: \`suggestion-apply\` and \`bundle-apply\` only.
- Severity: block-only (no warn yet).
- Authoring: file-based. The dashboard surfaces what's loaded.
- No JS plugins. No code is executed. The YAML parser is the only
  interpreter that touches rule files.
- Regex / glob / message lengths are capped; per-line scan input is
  truncated to 4096 chars.

CLI:
- \`amaco policies list [--json]\`
- \`amaco policies check <patchFile> [--surface suggestion-apply|bundle-apply]\`
- \`amaco policies doctor [--json]\`

Malformed files (parse / schema / regex / glob errors) are skipped with a
clear reason. Sibling well-formed files still apply.
`;

const SKILLS_README = `# Project Skills

Drop reusable instruction bundles here as Markdown files. Each filename stem
(e.g. \`security.md\` → \`security\`) is the name you reference in
\`.amaco/project.yml\` under \`roles.<role>.skills\`.

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

type ProjectYamlInput = {
  projectName: string;
  providerSection: string;
  validationCommands: readonly string[];
  defaultProviderRef: string;
};

function renderValidationYaml(commands: readonly string[]): string {
  if (commands.length === 0) {
    return `commands:
  validate: []`;
  }
  const list = commands.map((c) => `    - "${c.replace(/"/g, '\\"')}"`).join("\n");
  return `commands:
  validate:
${list}`;
}

function renderProvidersYaml(input: SetupPlan | null): {
  section: string;
  defaultRef: string;
} {
  // If recommended provider is Claude → ship a verified preset.
  if (input?.recommendedProvider && input.recommendedProvider.id === "claude") {
    const cmd = input.recommendedProvider.command || "claude";
    return {
      section: `providers:
  claude:
    type: cli
    command: ${cmd}
    args:
      - "-p"
    input: stdin`,
      defaultRef: "claude",
    };
  }

  // Otherwise, leave a placeholder claude provider so the schema validates;
  // doctor will warn if the command is not on PATH and `amaco provider setup`
  // can swap it.
  return {
    section: `providers:
  claude:
    type: cli
    command: claude
    args:
      - "-p"
    input: stdin`,
    defaultRef: "claude",
  };
}

function projectYaml(input: ProjectYamlInput): string {
  const ref = input.defaultProviderRef;
  return `project:
  name: "${input.projectName}"
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

${input.providerSection}

roles:
  planner:
    provider: ${ref}
    prompt: .amaco/roles/planner.md
    permissions: read_only
    skills: []

  architect:
    provider: ${ref}
    prompt: .amaco/roles/architect.md
    permissions: read_only
    skills: []

  executor:
    provider: ${ref}
    prompt: .amaco/roles/executor.md
    permissions: code_write
    skills: []

  fixer:
    provider: ${ref}
    prompt: .amaco/roles/fixer.md
    permissions: code_write
    skills: []

  reviewer:
    provider: ${ref}
    prompt: .amaco/roles/reviewer.md
    permissions: read_only
    skills: []

  verifier:
    provider: ${ref}
    prompt: .amaco/roles/verifier.md
    permissions: read_only
    skills: []

${renderValidationYaml(input.validationCommands)}

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
  # Stages where Amaco MUST pause for human approval before continuing.
  # Allowed values: planning, architecting, executing, validating, reviewing, fixing, verifying.
  # Example: requireApprovalAtStages: ["architecting", "verifying"]
  requireApprovalAtStages: []
  # OFF by default. When true, the dashboard exposes a per-run terminal panel
  # that opens an interactive shell inside that run's worktree. Browser
  # keystrokes are forwarded to an already-created PTY over a WebSocket;
  # the HTTP layer never accepts a command string to execute. The CWD is
  # restricted to known run worktrees only (no project root, no arbitrary
  # path). Sessions are user-launched only and not transcript-logged by
  # default. Requires the optional 'node-pty' native module to be
  # installable in your environment.
  allowInteractiveTerminal: false

scheduler:
  # Concurrency for the local task scheduler (\`amaco queue run\`).
  # Default 1 = one task run at a time. Increase to opt in to parallel runs;
  # each task still gets its own branch and worktree.
  maxConcurrentRuns: 1
  maxConcurrentWriteRoles: 1
  # warn  → start the second task and surface a warning if files overlap
  # block → keep the second task queued until the first finishes
  conflictPolicy: warn
  # fifo     → run in enqueue order
  # priority → run high before medium before low (FIFO within a priority)
  queuePolicy: fifo
`;
}

export type InitOptions = {
  projectRoot: string;
  force?: boolean;
  plan?: SetupPlan | null;
};

export type InitResult = {
  created: string[];
  skipped: string[];
  configWritten: boolean;
  plan: SetupPlan | null;
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

  const result: InitResult = {
    created: [],
    skipped: [],
    configWritten: false,
    plan: opts.plan ?? null,
  };

  await ensureDir(amacoRoot(projectRoot));
  await ensureDir(projectRolesDir(projectRoot));
  await ensureDir(projectSkillsDir(projectRoot));
  await ensureDir(projectRunsDir(projectRoot));
  await ensureDir(policiesDir(projectRoot));

  const name = opts.plan?.project.name ?? (await defaultProjectName(projectRoot));
  const providerYaml = renderProvidersYaml(opts.plan ?? null);
  const validation = opts.plan?.validationCommands ?? [];

  const configPath = projectConfigPath(projectRoot);
  const configExisted = await pathExists(configPath);
  if (!configExisted || force) {
    await writeText(
      configPath,
      projectYaml({
        projectName: name,
        providerSection: providerYaml.section,
        validationCommands: validation,
        defaultProviderRef: providerYaml.defaultRef,
      }),
    );
    result.created.push(configPath);
    result.configWritten = true;
  } else {
    result.skipped.push(configPath);
  }

  await writeIfMissing(projectRulesPath(projectRoot), RULES_TEMPLATE, result, force);
  await writeIfMissing(
    path.join(projectSkillsDir(projectRoot), "README.md"),
    SKILLS_README,
    result,
    force,
  );
  await writeIfMissing(
    path.join(policiesDir(projectRoot), "README.md"),
    POLICIES_README,
    result,
    force,
  );

  for (const roleId of getBuiltinRoleIds()) {
    const target = path.join(projectRolesDir(projectRoot), `${roleId}.md`);
    const contents = await readDefaultPrompt(roleId);
    await writeIfMissing(target, contents, result, force);
  }

  return result;
}
