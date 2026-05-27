import path from "node:path";
import { execa } from "execa";
import { pathExists, ensureDir, writeText } from "../utils/fs.js";
import {
  amacoRoot,
  projectRolesDir,
  projectRunsDir,
  projectSkillsDir,
  projectConfigPath,
} from "../utils/paths.js";
import { isGitAvailable, findGitRoot } from "../git/git.js";
import { configExists, loadConfig } from "../project/config-loader.js";
import { detectFullProject } from "../project/project-detector.js";
import {
  detectAllProviders,
  installHintForCommand,
  pickRecommendedProvider,
  type DetectedProvider,
} from "../providers/provider-detection.js";
import { resolveProfile } from "../permissions/permission-profiles.js";
import { readDefaultPrompt } from "../roles/default-roles.js";
import {
  builtinRoleIds,
  type BuiltinRoleId,
} from "../roles/role-schema.js";
import { discoverSkills } from "../skills/skill-discovery.js";
import {
  ensureProvider,
  assignRolesToProvider,
  setValidationCommands,
} from "./config-update-service.js";
import { buildProviderFromDetection } from "../providers/provider-presets.js";

export type DoctorSeverity = "ok" | "warn" | "fail";

export type DoctorFinding = {
  id: string;
  severity: DoctorSeverity;
  title: string;
  detail?: string;
  fixHint?: string;
  fixable: boolean;
};

export type DoctorReport = {
  projectRoot: string;
  inGitRepo: boolean;
  findings: DoctorFinding[];
  recommendedNextSteps: string[];
};

const ENV_FILES = [".env", ".env.local", ".env.development", ".env.production"];

async function checkProviderAvailable(command: string): Promise<boolean> {
  try {
    const result = await execa(command, ["--version"], {
      reject: false,
      timeout: 5_000,
      stdin: "ignore",
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function runDoctor(input: {
  cwd: string;
}): Promise<DoctorReport> {
  const gitRoot = await findGitRoot(input.cwd);
  const projectRoot = gitRoot ?? input.cwd;
  const findings: DoctorFinding[] = [];
  const nextSteps: string[] = [];

  if (!(await isGitAvailable())) {
    findings.push({
      id: "git-installed",
      severity: "fail",
      title: "git is not on PATH",
      detail: "Amaco needs git to create isolated worktrees.",
      fixHint: "Install git first.",
      fixable: false,
    });
  } else {
    findings.push({
      id: "git-installed",
      severity: "ok",
      title: "git is available",
      fixable: false,
    });
  }

  if (!gitRoot) {
    findings.push({
      id: "git-repo",
      severity: "fail",
      title: "Not inside a git repository",
      detail: `${input.cwd} is not inside a git repo.`,
      fixHint: "Run `git init` in your project, then re-run `amaco init`.",
      fixable: false,
    });
    nextSteps.push("Run `git init` in your project root, then `amaco init`.");
    return {
      projectRoot,
      inGitRepo: false,
      findings,
      recommendedNextSteps: nextSteps,
    };
  }
  findings.push({
    id: "git-repo",
    severity: "ok",
    title: "Inside a git repository",
    detail: gitRoot,
    fixable: false,
  });

  const hasConfig = await configExists(projectRoot);
  if (!hasConfig) {
    findings.push({
      id: "config-present",
      severity: "fail",
      title: "Amaco has not been initialized in this project",
      detail: `Missing ${path.join(".amaco", "project.yml")}.`,
      fixHint: "Run `amaco init`.",
      fixable: false,
    });
    nextSteps.push("Run `amaco init`.");
    return {
      projectRoot,
      inGitRepo: true,
      findings,
      recommendedNextSteps: nextSteps,
    };
  }
  findings.push({
    id: "config-present",
    severity: "ok",
    title: ".amaco/project.yml is present",
    fixable: false,
  });

  let loaded;
  try {
    loaded = await loadConfig(projectRoot);
    findings.push({
      id: "config-valid",
      severity: "ok",
      title: "Project config is valid",
      fixable: false,
    });
  } catch (err) {
    findings.push({
      id: "config-valid",
      severity: "fail",
      title: "Project config is invalid",
      detail: err instanceof Error ? err.message : String(err),
      fixHint: "Run `amaco config validate` to see the exact issues, or `amaco init --force` to regenerate (advanced).",
      fixable: false,
    });
    nextSteps.push("Fix `.amaco/project.yml` (see above), then `amaco doctor` again.");
    return {
      projectRoot,
      inGitRepo: true,
      findings,
      recommendedNextSteps: nextSteps,
    };
  }

  const project = await detectFullProject(projectRoot);
  findings.push({
    id: "project-detected",
    severity: "ok",
    title: `Project detected: ${project.name} (${project.projectType}, ${project.packageManager})`,
    fixable: false,
  });

  // Check provider availability for each configured provider.
  const providerIds = Object.keys(loaded.config.providers);
  for (const id of providerIds) {
    const cfg = loaded.config.providers[id]!;
    const available = await checkProviderAvailable(cfg.command);
    findings.push({
      id: `provider-${id}`,
      severity: available ? "ok" : "warn",
      title: available
        ? `Provider "${id}" is available (${cfg.command})`
        : `Provider "${id}" command "${cfg.command}" is not on PATH`,
      detail: available
        ? undefined
        : installHintForCommand(cfg.command) ??
          `Install ${cfg.command} or run \`amaco provider setup\` to switch.`,
      fixHint: available
        ? undefined
        : installHintForCommand(cfg.command) ??
          "Install the CLI, or run `amaco provider setup` to choose a different one.",
      fixable: false,
    });
  }

  // All agents reference valid providers.
  const missingProviderRefs: string[] = [];
  for (const [roleId, agent] of Object.entries(loaded.config.roles)) {
    if (!loaded.config.providers[agent.provider]) {
      missingProviderRefs.push(roleId);
    }
  }
  if (missingProviderRefs.length > 0) {
    findings.push({
      id: "agent-provider-refs",
      severity: "fail",
      title: `Agents reference a missing provider`,
      detail: `These agents point to providers that are not configured: ${missingProviderRefs.join(", ")}.`,
      fixHint:
        "Run `amaco provider setup` to add a provider, then `amaco provider set <id>` to assign it.",
      fixable: false,
    });
  } else {
    findings.push({
      id: "agent-provider-refs",
      severity: "ok",
      title: "All agents reference valid providers",
      fixable: false,
    });
  }

  // Check prompt files exist.
  const missingPrompts: string[] = [];
  for (const [roleId, agent] of Object.entries(loaded.config.roles)) {
    const promptPath = path.isAbsolute(agent.prompt)
      ? agent.prompt
      : path.join(projectRoot, agent.prompt);
    if (!(await pathExists(promptPath))) {
      missingPrompts.push(roleId);
    }
  }
  if (missingPrompts.length > 0) {
    const restorable = missingPrompts.filter((id) =>
      (builtinRoleIds as readonly string[]).includes(id),
    );
    findings.push({
      id: "prompt-files",
      severity: "fail",
      title: `Missing prompt files for: ${missingPrompts.join(", ")}`,
      detail: "Each agent needs a Markdown prompt file.",
      fixHint: restorable.length > 0
        ? `Run \`amaco doctor --fix\` to restore the default prompt(s) for: ${restorable.join(", ")}.`
        : "Restore the missing prompt files manually.",
      fixable: restorable.length > 0,
    });
  } else {
    findings.push({
      id: "prompt-files",
      severity: "ok",
      title: "All agents have prompt files",
      fixable: false,
    });
  }

  // Check skills referenced exist (discovery covers .amaco/skills/<name>.md, .amaco/skills/<dir>/SKILL.md, .claude/skills/<dir>/SKILL.md).
  const discovered = await discoverSkills(projectRoot);
  const knownNames = new Set(discovered.map((s) => s.name));
  const missingSkills: { roleId: string; skill: string }[] = [];
  for (const [roleId, agent] of Object.entries(loaded.config.roles)) {
    for (const skill of agent.skills) {
      // Legacy: check flat .amaco/skills/<name>.md too.
      const flat = path.join(projectSkillsDir(projectRoot), `${skill}.md`);
      const flatExists = await pathExists(flat);
      if (!flatExists && !knownNames.has(skill)) {
        missingSkills.push({ roleId, skill });
      }
    }
  }
  if (missingSkills.length > 0) {
    findings.push({
      id: "skills-present",
      severity: "fail",
      title: "Skills referenced by agents are missing",
      detail: missingSkills
        .map((m) => `${m.roleId} → ${m.skill}`)
        .join("; "),
      fixHint:
        "Create the missing skill in `.amaco/skills/<name>/SKILL.md`, drop a flat `.amaco/skills/<name>.md`, or unassign with `amaco skills unassign <agent> <skill>`.",
      fixable: false,
    });
  } else if (Object.values(loaded.config.roles).some((a) => a.skills.length > 0)) {
    findings.push({
      id: "skills-present",
      severity: "ok",
      title: "All skills referenced by agents are present",
      fixable: false,
    });
  }

  // Check write-enabled agents are configured for the worktree.
  for (const [roleId, agent] of Object.entries(loaded.config.roles)) {
    let profile;
    try {
      profile = resolveProfile(loaded.config.permissions.profiles, agent.permissions);
    } catch (err) {
      findings.push({
        id: `permission-${roleId}`,
        severity: "fail",
        title: `Agent "${roleId}" uses unknown permission profile "${agent.permissions}"`,
        detail: err instanceof Error ? err.message : String(err),
        fixHint:
          "Use one of the built-in profiles (read_only, code_write, review_only, verify_only) or define one under permissions.profiles.",
        fixable: false,
      });
      continue;
    }
    if (profile.allowWrite && profile.cwd !== "worktree") {
      findings.push({
        id: `permission-${roleId}`,
        severity: "fail",
        title: `Agent "${roleId}" can write but is configured to run in ${profile.cwd}`,
        detail: "Write-enabled agents must run inside the worktree to keep changes isolated.",
        fixHint: `Run \`amaco config set permissions.profiles.${agent.permissions}.cwd worktree\`.`,
        fixable: false,
      });
    }
  }

  // .amaco subdirs
  for (const [name, p] of [
    ["runs", projectRunsDir(projectRoot)],
    ["skills", projectSkillsDir(projectRoot)],
    ["roles", projectRolesDir(projectRoot)],
  ] as const) {
    if (!(await pathExists(p))) {
      findings.push({
        id: `dir-${name}`,
        severity: "warn",
        title: `Missing .amaco/${name}/ directory`,
        fixHint: "Run `amaco doctor --fix` to recreate it.",
        fixable: true,
      });
    }
  }

  // Validation commands
  if (loaded.config.commands.validate.length === 0) {
    const suggestions = project.suggestedValidationCommands;
    if (suggestions.length > 0) {
      findings.push({
        id: "validation-empty",
        severity: "warn",
        title: "No validation commands configured",
        detail:
          "Reviews are stronger when Amaco can run your real checks (typecheck, lint, tests).",
        fixHint: `Run \`amaco doctor --fix\` to add suggested commands: ${suggestions
          .map((s) => `\`${s}\``)
          .join(", ")}.`,
        fixable: true,
      });
    } else {
      findings.push({
        id: "validation-empty",
        severity: "warn",
        title: "No validation commands configured",
        detail:
          "Amaco can run without validation commands, but reviews are much stronger when it can run your real checks.",
        fixHint:
          'Add commands manually: `amaco config set commands.validate "[\\"pnpm typecheck\\",\\"pnpm test\\"]"`.',
        fixable: false,
      });
    }
  } else {
    findings.push({
      id: "validation-empty",
      severity: "ok",
      title: `${loaded.config.commands.validate.length} validation command(s) configured`,
      fixable: false,
    });
  }

  // Validation profiles: report named profiles + warn on stale references.
  // Doctor never invents or rewrites profiles; it tells the user what their
  // project.yml says and which suggestions/bundles point at names that no
  // longer exist.
  try {
    const namedProfiles = loaded.config.commands.validationProfiles ?? {};
    const namedNames = Object.keys(namedProfiles).sort();
    if (namedNames.length === 0) {
      findings.push({
        id: "validation-profiles-named",
        severity: "ok",
        title:
          "No named validation profiles configured (default profile only)",
        detail:
          "Add per-suggestion command sets under commands.validationProfiles when you want quick/full splits.",
        fixable: false,
      });
    } else {
      const summary = namedNames
        .map((n) => `${n} (${namedProfiles[n]!.commands.length})`)
        .join(", ");
      const empties = namedNames.filter(
        (n) => (namedProfiles[n]!.commands ?? []).length === 0,
      );
      if (empties.length > 0) {
        findings.push({
          id: "validation-profiles-empty",
          severity: "warn",
          title: `Validation profile(s) with no commands: ${empties.join(", ")}`,
          detail:
            "An empty profile resolves to no_commands_configured at runtime.",
          fixHint:
            "Add at least one command per profile in commands.validationProfiles.<name>.commands.",
          fixable: false,
        });
      }
      findings.push({
        id: "validation-profiles-named",
        severity: "ok",
        title: `${namedNames.length} named validation profile(s): ${summary}`,
        fixable: false,
      });
    }

    const audit = await import("../core/validation-profile-audit-service.js")
      .then((m) =>
        m.auditValidationProfileReferences(projectRoot, loaded.config),
      )
      .catch(() => null);
    if (audit) {
      if (audit.malformedFiles.length > 0) {
        findings.push({
          id: "validation-profiles-malformed",
          severity: "warn",
          title: `${audit.malformedFiles.length} unreadable suggestions/bundles file(s) skipped during audit`,
          detail: audit.malformedFiles.slice(0, 5).join("\n"),
          fixable: false,
        });
      }
      // Did-you-mean hints reuse the live profile list. We compute them in
      // the doctor layer (not the audit service) so the audit stays a pure
      // data scan and this layer can decide what to render.
      const liveProfileNames = Object.keys(
        loaded.config.commands.validationProfiles ?? {},
      );
      const { suggestProfileName } = await import(
        "../core/validation-profile-migration-service.js"
      );
      if (audit.staleSuggestionReferences.length > 0) {
        const head = audit.staleSuggestionReferences.slice(0, 5);
        const lines = head.map((r) => {
          const guess = suggestProfileName(r.profileName, liveProfileNames);
          const suffix = guess
            ? `  did you mean "${guess}"?  (amaco validation profile migrate ${r.profileName} ${guess} --dry-run)`
            : "";
          return `run ${r.runId} · suggestion ${r.id} → "${r.profileName}"${suffix}`;
        });
        findings.push({
          id: "validation-profiles-stale-suggestions",
          severity: "warn",
          title: `${audit.staleSuggestionReferences.length} suggestion(s) reference missing validation profile(s)`,
          detail: lines.join("\n"),
          fixHint:
            "Recreate the named profile in commands.validationProfiles, run `amaco validation profile migrate <from> <to> --dry-run`, or `amaco suggestions profile clear <runId> <suggestionId>`.",
          fixable: false,
        });
      }
      if (audit.staleBundleReferences.length > 0) {
        const head = audit.staleBundleReferences.slice(0, 5);
        const lines = head.map((r) => {
          const guess = suggestProfileName(r.profileName, liveProfileNames);
          const suffix = guess
            ? `  did you mean "${guess}"?  (amaco validation profile migrate ${r.profileName} ${guess} --dry-run)`
            : "";
          return `run ${r.runId} · bundle ${r.id} → "${r.profileName}"${suffix}`;
        });
        findings.push({
          id: "validation-profiles-stale-bundles",
          severity: "warn",
          title: `${audit.staleBundleReferences.length} review pass(es) reference missing validation profile(s)`,
          detail: lines.join("\n"),
          fixHint:
            "Recreate the named profile, run `amaco validation profile migrate <from> <to> --dry-run`, or `amaco bundles profile clear <runId> <bundleId>`.",
          fixable: false,
        });
      }
    }
  } catch {
    // Doctor never crashes because of a profile-audit hiccup.
  }

  // .env warnings
  for (const envFile of ENV_FILES) {
    if (await pathExists(path.join(projectRoot, envFile))) {
      findings.push({
        id: `env-${envFile}`,
        severity: "warn",
        title: `${envFile} present in project`,
        detail: "Amaco never reads its contents into prompts; just be sure agents do not edit it.",
        fixable: false,
      });
    }
  }

  // Auto-push / auto-merge
  if (loaded.config.git.allowAutoPush) {
    findings.push({
      id: "auto-push",
      severity: "fail",
      title: "git.allowAutoPush is true",
      fixHint: "Run `amaco config set git.allowAutoPush false`. Amaco never pushes for you.",
      fixable: false,
    });
  } else {
    findings.push({
      id: "auto-push",
      severity: "ok",
      title: "Auto-push is disabled",
      fixable: false,
    });
  }
  if (loaded.config.git.allowAutoMerge) {
    findings.push({
      id: "auto-merge",
      severity: "fail",
      title: "git.allowAutoMerge is true",
      fixHint: "Run `amaco config set git.allowAutoMerge false`. Amaco never merges for you.",
      fixable: false,
    });
  } else {
    findings.push({
      id: "auto-merge",
      severity: "ok",
      title: "Auto-merge is disabled",
      fixable: false,
    });
  }

  // Approval policy: surface configured stages so users can confirm they
  // match expectations. Schema validation already rejects unknown stages
  // before this point, so by the time we get here every value is canonical.
  const requiredStages = loaded.config.policies.requireApprovalAtStages;
  if (requiredStages.length > 0) {
    findings.push({
      id: "approval-policy",
      severity: "ok",
      title: `Approval required at: ${requiredStages.join(", ")}`,
      detail:
        "Amaco will pause for human approval at these stage boundaries even if no agent emits HUMAN_APPROVAL: REQUIRED.",
      fixable: false,
    });
  } else {
    findings.push({
      id: "approval-policy",
      severity: "ok",
      title: "No stage-level approval policy configured",
      detail:
        "Approvals only happen when an agent emits HUMAN_APPROVAL: REQUIRED. To force approval at specific stages: `amaco config set policies.requireApprovalAtStages \"[\\\"architecting\\\",\\\"verifying\\\"]\"`.",
      fixable: false,
    });
  }

  // Notification gateways: surface configured gateways and any env vars they
  // reference but cannot resolve.
  try {
    const { NotificationStore } = await import(
      "../notifications/notification-store.js"
    );
    const store = new NotificationStore(projectRoot);
    const gateways = await store.readGateways();
    const enabledIds = Object.entries(gateways.gateways)
      .filter(([, cfg]) => cfg.enabled)
      .map(([id]) => id);
    if (enabledIds.length === 0) {
      findings.push({
        id: "notification-gateways",
        severity: "ok",
        title: "No external notification gateways enabled",
        detail:
          "Local in-app and CLI notifications still work. Enable an external gateway with `amaco gateways enable <id>` when you want external delivery.",
        fixable: false,
      });
    } else {
      const { envVarName } = await import(
        "../notifications/gateways/secret-resolver.js"
      );
      const missing: string[] = [];
      for (const id of enabledIds) {
        const cfg = gateways.gateways[id]!;
        for (const v of [cfg.url, cfg.token, cfg.target]) {
          const env = envVarName(v);
          if (env && !process.env[env]) missing.push(`${id} → ${env}`);
        }
      }
      if (missing.length > 0) {
        findings.push({
          id: "notification-gateways",
          severity: "warn",
          title: `Notification gateway env vars are not set: ${missing.join(", ")}`,
          detail:
            "Gateway-secret values stored as env:NAME require the named env var to be set when Amaco runs. Notifications will be skipped until the env var is present.",
          fixHint:
            "Export the env var(s) in your shell, then re-run the gateway test (`amaco gateways test <id>`).",
          fixable: false,
        });
      } else {
        findings.push({
          id: "notification-gateways",
          severity: "ok",
          title: `Notification gateways enabled: ${enabledIds.join(", ")}`,
          fixable: false,
        });
      }
    }
  } catch {
    // best-effort — never let notification health checks break doctor.
  }

  // Approvals health: scan recent runs for pending approval requests.
  try {
    const fs = await import("node:fs/promises");
    const runsDir = projectRunsDir(projectRoot);
    if (await pathExists(runsDir)) {
      const entries = (await fs.readdir(runsDir)).sort();
      const pendingRuns: string[] = [];
      for (const id of entries.slice(-10)) {
        const approvalsFile = path.join(runsDir, id, "approvals.json");
        if (!(await pathExists(approvalsFile))) continue;
        try {
          const raw = await fs.readFile(approvalsFile, "utf8");
          const arr = JSON.parse(raw) as Array<{ status: string }>;
          if (Array.isArray(arr) && arr.some((a) => a?.status === "pending")) {
            pendingRuns.push(id);
          }
        } catch {
          // malformed approvals.json — surface as warn.
          findings.push({
            id: `approvals-malformed-${id}`,
            severity: "warn",
            title: `approvals.json for run ${id} is unreadable`,
            detail: "The file is present but not valid JSON.",
            fixable: false,
          });
        }
      }
      if (pendingRuns.length > 0) {
        findings.push({
          id: "approvals-pending",
          severity: "warn",
          title: `${pendingRuns.length} run(s) awaiting your approval`,
          detail: pendingRuns.join(", "),
          fixHint:
            "Resolve via `amaco approvals list <runId>` and `approve` / `reject`, or open the dashboard with `amaco ui`.",
          fixable: false,
        });
      }
    }
  } catch {
    // best-effort — never fail doctor over approval scanning.
  }

  // Build next-step recommendations.
  const failures = findings.filter((f) => f.severity === "fail");
  const warnings = findings.filter((f) => f.severity === "warn");

  if (failures.length === 0 && warnings.length === 0) {
    nextSteps.push('Run `amaco run "your task"` whenever you are ready.');
  } else {
    if (failures.length > 0) {
      nextSteps.push("Resolve the issues marked ✗ above.");
    }
    if (warnings.length > 0) {
      const fixable = warnings.some((w) => w.fixable);
      if (fixable) {
        nextSteps.push("Run `amaco doctor --fix` to apply safe fixes.");
      }
    }
  }

  return {
    projectRoot,
    inGitRepo: true,
    findings,
    recommendedNextSteps: nextSteps,
  };
}

export type DoctorFixOutcome = {
  applied: string[];
  skipped: string[];
};

export async function applyDoctorFixes(input: {
  projectRoot: string;
}): Promise<DoctorFixOutcome> {
  const { projectRoot } = input;
  const applied: string[] = [];
  const skipped: string[] = [];

  // Ensure subdirs.
  await ensureDir(amacoRoot(projectRoot));
  for (const [name, p] of [
    ["runs", projectRunsDir(projectRoot)],
    ["skills", projectSkillsDir(projectRoot)],
    ["roles", projectRolesDir(projectRoot)],
  ] as const) {
    if (!(await pathExists(p))) {
      await ensureDir(p);
      applied.push(`Created .amaco/${name}/`);
    }
  }

  // Restore missing skills README.
  const skillsReadme = path.join(projectSkillsDir(projectRoot), "README.md");
  if (!(await pathExists(skillsReadme))) {
    await writeText(
      skillsReadme,
      "# Project Skills\n\nDrop reusable instruction bundles here as Markdown files.\n",
    );
    applied.push("Created .amaco/skills/README.md");
  }

  // Restore missing default agent prompts only — never overwrite existing.
  if (await pathExists(projectConfigPath(projectRoot))) {
    let loaded;
    try {
      loaded = await loadConfig(projectRoot);
    } catch {
      loaded = null;
    }
    if (loaded) {
      for (const [roleId, agent] of Object.entries(loaded.config.roles)) {
        if (!(builtinRoleIds as readonly string[]).includes(roleId)) continue;
        const promptPath = path.isAbsolute(agent.prompt)
          ? agent.prompt
          : path.join(projectRoot, agent.prompt);
        if (await pathExists(promptPath)) continue;
        const contents = await readDefaultPrompt(roleId as BuiltinRoleId);
        await writeText(promptPath, contents);
        applied.push(`Restored ${path.relative(projectRoot, promptPath)}`);
      }

      // Auto-configure the recommended detected provider (preset-ready +
      // available; Claude is preferred by registry order) when no providers
      // are configured yet. Every known provider now ships a preset, so this
      // works out of the box for whichever CLI the user has installed.
      const detections = await detectAllProviders();
      const recommended = pickRecommendedProvider(detections);
      const hasAnyProvider =
        Object.keys(loaded.config.providers ?? {}).length > 0;
      if (!hasAnyProvider && recommended) {
        await ensureProvider(
          projectRoot,
          recommended.id,
          buildProviderFromDetection(recommended.id, recommended.command),
        );
        await assignRolesToProvider(projectRoot, recommended.id);
        applied.push(
          `Added '${recommended.id}' provider and assigned all default agents to it`,
        );
      } else if (!hasAnyProvider && !recommended) {
        skipped.push(
          "No providers configured and no local CLI detected. Run `amaco provider setup`.",
        );
      }

      // Add validation commands if empty and we have suggestions.
      if (loaded.config.commands.validate.length === 0) {
        const project = await detectFullProject(projectRoot);
        if (project.suggestedValidationCommands.length > 0) {
          await setValidationCommands(
            projectRoot,
            project.suggestedValidationCommands,
          );
          applied.push(
            `Added validation commands: ${project.suggestedValidationCommands
              .map((c) => `\`${c}\``)
              .join(", ")}`,
          );
        }
      }
    }
  }

  return { applied, skipped };
}

export function pickDetectionRecommendation(
  detections: readonly DetectedProvider[],
): DetectedProvider | null {
  return pickRecommendedProvider(detections);
}
