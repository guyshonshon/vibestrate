/**
 * Scaffolds a project's `.vibestrate/` directory: the generated `project.yml`,
 * the rules doc, README stubs for policies and skills, and a copy of each
 * built-in role prompt. In source order: the embedded templates as string
 * constants, the YAML renderers, then `runInit`.
 *
 * Init is re-runnable. Without `force`, a path that already exists is recorded
 * under `skipped` and left untouched, so running init again on a live project
 * does not clobber hand-edited config or role prompts.
 *
 * `project.yml` is assembled by string concatenation rather than a YAML
 * serializer, so everything interpolated into a double-quoted scalar goes
 * through `yamlQuote`. The project name is the one that reaches it from
 * outside: it comes from the repo's package.json `name`, or failing that the
 * directory basename, and a quote in either used to produce a project.yml that
 * no command could parse.
 */
import path from "node:path";
import { ensureDir, writeText, pathExists } from "../utils/fs.js";
import {
  vibestrateRoot,
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
} from "../agents/default-roles.js";
import { defaultProjectName } from "./project-detector.js";
import { PROVIDER_PRESETS } from "../providers/provider-presets.js";
import type { KnownProviderId } from "../providers/provider-detection.js";
import type { SetupPlan } from "../setup/setup-service.js";

const RULES_TEMPLATE = `# Project Instructions for Vibestrate

These instructions are injected into every agent's prompt on every run. They
are guidance, not guarantees - an agent may follow or ignore them, the same way
a teammate reads a style guide. For gates that are enforced in code (and that a
model cannot talk its way past), use policies in \`.vibestrate/policies/*.yml\`.

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

const POLICIES_README = `# Vibestrate Policies

User-supplied rules that refuse a suggestion or bundle apply if they match.
They never *permit* a patch - built-in safety (path-based + content-based
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
- \`vibe policies list [--json]\`
- \`vibe policies check <patchFile> [--surface suggestion-apply|bundle-apply]\`
- \`vibe policies doctor [--json]\`

Malformed files (parse / schema / regex / glob errors) are skipped with a
clear reason. Sibling well-formed files still apply.
`;

const SKILLS_README = `# Project Skills

Drop reusable instruction bundles here as Markdown files. Each filename stem
(e.g. \`security.md\` → \`security\`) is the name you reference in
\`.vibestrate/project.yml\` under \`roles.<role>.skills\`.

Examples:

- security.md
- frontend-ux.md
- testing.md
- privacy.md
- database.md
- performance.md
- accessibility.md

Skills are explicit only in V0 - they are loaded only when listed in config.
`;

type ProjectYamlInput = {
  projectName: string;
  providerSection: string;
  validationCommands: readonly string[];
  defaultProviderRef: string;
  /** The repo's actual default branch, detected from HEAD. */
  mainBranch: string;
};

/**
 * Body of a YAML double-quoted scalar. Backslash first: escaping only the
 * quote turns `a\` into `a\"` and breaks the string it was meant to protect.
 * A real line break has to become the `\n` escape rather than pass through -
 * a double-quoted scalar cannot span lines, and package.json `name` is
 * arbitrary JSON, so one can arrive.
 */
function yamlQuote(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function renderValidationYaml(commands: readonly string[]): string {
  if (commands.length === 0) {
    return `commands:
  validate: []`;
  }
  const list = commands.map((c) => `    - "${yamlQuote(c)}"`).join("\n");
  return `commands:
  validate:
${list}`;
}

/** The provider entry `vibe init` scaffolds into a fresh `project.yml`. */
export type ScaffoldedProvider = {
  id: KnownProviderId;
  command: string;
  args: string[];
  input: "stdin" | "arg";
};

/**
 * The single answer to "which provider does a fresh `project.yml` get?".
 *
 * `pickRecommendedProvider` only ever returns a preset-ready CLI, so the
 * recommended id always has an entry in `PROVIDER_PRESETS` - that entry is
 * where `args`/`input` come from, rather than being retyped here. Init used to
 * hardcode `claude` in BOTH branches, so a machine whose only CLI was codex
 * got told "codex detected" and handed a config pointing at a binary it did
 * not have.
 *
 * With nothing detected the fallback stays `claude`, matching
 * `SetupPlan.defaultProviderId`: the schema needs a provider, doctor warns
 * that it is not on PATH, and `vibe provider setup` swaps it.
 *
 * Every scaffolded provider is written as `type: cli`, including claude, whose
 * canonical preset is `type: claude-code`. That is deliberate and documented
 * (docs/content/getting-started/quickstart.md): `claude-code` is what grants a
 * write seat `--permission-mode acceptEdits`, and handing a fresh project
 * write permission by default is an opt-in the user makes, not something init
 * decides for them.
 *
 * Both the YAML writer and init's "Default agents will use:" line read this,
 * so what is printed cannot drift from what is written.
 */
export function scaffoldedProvider(plan: SetupPlan | null): ScaffoldedProvider {
  const recommended = plan?.recommendedProvider ?? null;
  const id: KnownProviderId = recommended?.id ?? "claude";
  const { preset } = PROVIDER_PRESETS[id];
  return {
    id,
    command: recommended?.command || preset.command,
    args: [...preset.args],
    input: preset.input,
  };
}

/** How that provider is invoked, for display (`codex exec`, `claude -p`). */
export function scaffoldedProviderInvocation(plan: SetupPlan | null): string {
  const p = scaffoldedProvider(plan);
  return [p.command, ...p.args].join(" ");
}

function renderProvidersYaml(input: SetupPlan | null): {
  section: string;
  defaultRef: string;
} {
  const p = scaffoldedProvider(input);
  const args =
    p.args.length === 0
      ? "    args: []"
      : `    args:\n${p.args.map((a) => `      - "${yamlQuote(a)}"`).join("\n")}`;
  return {
    section: `providers:
  ${p.id}:
    type: cli
    command: "${yamlQuote(p.command)}"
${args}
    input: ${p.input}`,
    defaultRef: p.id,
  };
}

/**
 * The branch runs fork from and merge advice compares against.
 *
 * HEAD's short name, because that is what the repo actually uses - `main`,
 * `master`, `trunk`, whatever the host initialised. Detached HEAD or a
 * repo-less directory falls back to "main", the same value the template
 * hardcoded, so the failure mode cannot get worse than it was.
 */
async function detectDefaultBranch(projectRoot: string): Promise<string> {
  try {
    const { execa } = await import("execa");
    const r = await execa("git", ["symbolic-ref", "--short", "HEAD"], {
      cwd: projectRoot,
      reject: false,
    });
    const branch = (r.stdout ?? "").trim();
    if (r.exitCode === 0 && branch) return branch;
  } catch {
    /* fall through */
  }
  return "main";
}

function projectYaml(input: ProjectYamlInput): string {
  const ref = input.defaultProviderRef;
  return `project:
  name: "${yamlQuote(input.projectName)}"
  type: generic

git:
  mainBranch: "${yamlQuote(input.mainBranch)}"
  branchPrefix: vibestrate/
  worktreeDir: ../.vibestrate-worktrees
  requireCleanMain: false

workflow:
  id: default-plan-build-review
  # maxReviewLoops: 3   # optional GLOBAL ceiling on review->fix loops across all
  #                     # flows; omit (default) = each flow uses its own budget.
  requireHumanMerge: true

execution:
  backend: local-worktree

${input.providerSection}

# Profiles = reusable runtime setups. A Profile picks a provider plus how
# strong/expensive to run (model, effort). Effort (the "power" field) is
# provider-specific; leave it null when the provider exposes no effort control.
profiles:
  ${ref}-balanced:
    provider: ${ref}
    label: ${ref} balanced
    model: null
    power: medium

# Crews = your local team of Roles. Each Role runs on a Profile and lists the
# Seats it can fill in a Flow (the same Role can fill several seats).
crews:
  default:
    label: Default
    roles:
      planner:
        label: Planner
        seats: [planner]
        profile: ${ref}-balanced
        prompt: .vibestrate/roles/planner.json
        permissions: read_only
        skills: []

      architect:
        label: Architect
        seats: [architect]
        profile: ${ref}-balanced
        prompt: .vibestrate/roles/architect.json
        permissions: read_only
        skills: []

      executor:
        label: Backend Implementer
        seats: [implementer, executor, builder]
        profile: ${ref}-balanced
        prompt: .vibestrate/roles/executor.json
        permissions: code_write
        skills: []

      fixer:
        label: Fixer
        seats: [fixer]
        profile: ${ref}-balanced
        prompt: .vibestrate/roles/fixer.json
        permissions: code_write
        skills: []

      reviewer:
        label: Reviewer
        seats: [reviewer, challenger]
        profile: ${ref}-balanced
        prompt: .vibestrate/roles/reviewer.json
        permissions: read_only
        skills: []

      verifier:
        label: Verifier
        seats: [verifier, arbiter]
        profile: ${ref}-balanced
        prompt: .vibestrate/roles/verifier.json
        permissions: read_only
        skills: []

defaultCrew: default

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
  # Stages where Vibestrate MUST pause for human approval before continuing.
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
  # Concurrency for the local task scheduler (\`vibe queue run\`).
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

commits:
  # When Vibestrate authors/assists a commit (per-item pick-up commits,
  # integrator merges), it adds a Co-authored-by credit trailer. Set
  # coAuthor: false to opt out, or override the identity below.
  coAuthor: true
  coAuthorName: Vibestrate
  coAuthorEmail: noreply@vibestrate.com
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

  await ensureDir(vibestrateRoot(projectRoot));
  await ensureDir(projectRolesDir(projectRoot));
  await ensureDir(projectSkillsDir(projectRoot));
  await ensureDir(projectRunsDir(projectRoot));
  await ensureDir(policiesDir(projectRoot));

  const name = opts.plan?.project.name ?? (await defaultProjectName(projectRoot));
  // The repo's real default branch, not the literal "main". A fresh init on a
  // `master` repo used to scaffold `mainBranch: main`, and every run then died
  // at worktree creation with `fatal: invalid reference: main` - the first run
  // a new user ever starts, failing on a config file they did not write.
  const mainBranch = await detectDefaultBranch(projectRoot);
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
        mainBranch,
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
    const target = path.join(projectRolesDir(projectRoot), `${roleId}.json`);
    const contents = await readDefaultPrompt(roleId);
    await writeIfMissing(target, contents, result, force);
  }

  // NOTE: crew presets (fast/thorough/cheap/local) are NOT seeded at init on
  // purpose - they'd bloat every project.yml and overlap the on-demand path.
  // They're installed when wanted via `vibe crew presets add` / the dashboard
  // Crew page, both of which surface availability so a fresh project still sees
  // them.

  return result;
}
