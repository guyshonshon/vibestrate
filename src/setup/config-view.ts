// A grouped, readable projection of the resolved project config. This is the
// single source of truth behind every "Config view" surface: the CLI
// (`vibe config view`), the in-shell Config page, and the web dashboard
// `/api/config/view` panel. It deliberately holds zero runtime dependencies
// beyond the config *type* (erased at compile time) so it can be exercised
// under the node-only Vitest environment and imported from anywhere.
//
// The point of this view (vs. the raw `vibe config show` YAML dump) is to
// answer two questions per group: "what is this set to?" and "where do I
// change it?" - so each section carries an `editable` pointer at the surface
// (a page route) and / or the CLI path that edits it.

import type { ProjectConfig } from "../project/config-schema.js";
import { providerCommandLabel } from "../providers/provider-schema.js";

export type ConfigRowTone = "default" | "on" | "off" | "warn";

export type ConfigRow = {
  label: string;
  value: string;
  /** Optional one-line note shown after / under the value. */
  hint?: string;
  /** Display tone (booleans render on/off; risky-when-on renders warn). */
  tone?: ConfigRowTone;
};

export type ConfigSectionEditable = {
  /** Short human label of where this is changed (e.g. "Profiles page"). */
  surface: string | null;
  /** Web hash-route id for a dedicated live editor, or null. */
  route: string | null;
  /** CLI invocations that edit this section (may be empty). */
  cli: string[];
  /** True when a dedicated UI editor (web/shell) edits this live; false when
   *  the only path is hand-editing project.yml / `vibe config set`. */
  live: boolean;
};

export type ConfigSection = {
  id: string;
  title: string;
  /** One line: what this group controls. */
  summary: string;
  editable: ConfigSectionEditable;
  rows: ConfigRow[];
};

export type ConfigView = {
  project: { name: string; type: string };
  sections: ConfigSection[];
};

function onOff(v: boolean, riskyWhenOn = false): ConfigRow["tone"] {
  if (v) return riskyWhenOn ? "warn" : "on";
  return "off";
}

function boolRow(
  label: string,
  v: boolean,
  opts: { riskyWhenOn?: boolean; hint?: string } = {},
): ConfigRow {
  return {
    label,
    value: v ? "on" : "off",
    tone: onOff(v, opts.riskyWhenOn),
    ...(opts.hint ? { hint: opts.hint } : {}),
  };
}

/** Build the grouped, readable view from a validated project config. Pure. */
export function buildConfigView(config: ProjectConfig): ConfigView {
  const sections: ConfigSection[] = [];

  // ── Providers ────────────────────────────────────────────────────────────
  const providerIds = Object.keys(config.providers);
  sections.push({
    id: "providers",
    title: "Providers",
    summary: "The local CLIs / model endpoints Vibestrate drives.",
    editable: {
      surface: "Providers page",
      route: "providers",
      cli: ["vibe provider list", "vibe provider setup <id>"],
      live: true,
    },
    rows:
      providerIds.length === 0
        ? [{ label: "(none)", value: "no providers configured", tone: "warn" }]
        : providerIds.map((id) => {
            const p = config.providers[id]!;
            return { label: id, value: `${p.type} · ${providerCommandLabel(p)}` };
          }),
  });

  // ── Profiles ─────────────────────────────────────────────────────────────
  const profileIds = Object.keys(config.profiles);
  sections.push({
    id: "profiles",
    title: "Profiles",
    summary: "Reusable runtime presets (provider + model + effort) crew roles run on.",
    editable: {
      surface: "Profiles page",
      route: "profiles",
      cli: ["vibe profile list", "vibe profile add <id> --provider <p>"],
      live: true,
    },
    rows:
      profileIds.length === 0
        ? [{ label: "(none)", value: "no profiles defined", tone: "warn" }]
        : profileIds.map((id) => {
            const p = config.profiles[id]!;
            const bits = [
              p.provider,
              p.model ?? "(provider default)",
              p.power ? `effort ${p.power}` : null,
            ].filter(Boolean);
            return { label: id, value: bits.join(" · ") };
          }),
  });

  // ── Crews ────────────────────────────────────────────────────────────────
  const crewIds = Object.keys(config.crews);
  sections.push({
    id: "crews",
    title: "Crews",
    summary: "Local rosters of roles; each role runs on a profile and fills seats.",
    editable: {
      surface: "Crew page",
      route: "crew",
      cli: [],
      live: true,
    },
    rows: [
      {
        label: "default crew",
        value: config.defaultCrew,
        tone: config.crews[config.defaultCrew] ? "default" : "warn",
        ...(config.crews[config.defaultCrew]
          ? {}
          : { hint: "not defined in crews" }),
      },
      ...crewIds.map((id) => {
        const crew = config.crews[id]!;
        const roleCount = Object.keys(crew.roles).length;
        return {
          label: id,
          value: `${roleCount} role${roleCount === 1 ? "" : "s"}`,
        } satisfies ConfigRow;
      }),
    ],
  });

  // ── Git ──────────────────────────────────────────────────────────────────
  sections.push({
    id: "git",
    title: "Git",
    summary: "Branch naming, worktree location, and clean-tree requirements.",
    editable: {
      surface: "project.yml / vibe config set",
      route: null,
      cli: ["vibe config set git.mainBranch <branch>"],
      live: false,
    },
    rows: [
      { label: "main branch", value: config.git.mainBranch },
      { label: "branch prefix", value: config.git.branchPrefix },
      { label: "worktree dir", value: config.git.worktreeDir },
      boolRow("require clean main", config.git.requireCleanMain),
      boolRow("allow auto-merge", config.git.allowAutoMerge, {
        riskyWhenOn: true,
        hint: "policies.forbidAutoMerge also gates this",
      }),
      boolRow("allow auto-push", config.git.allowAutoPush, {
        riskyWhenOn: true,
        hint: "policies.forbidAutoPush also gates this",
      }),
    ],
  });

  // ── Commits ──────────────────────────────────────────────────────────────
  sections.push({
    id: "commits",
    title: "Commits",
    summary:
      "Attribution Vibestrate stamps on commits it authors/assists (pick-up items, integrator merges).",
    editable: {
      surface: "project.yml / vibe config set",
      route: null,
      cli: ["vibe config set commits.coAuthor false"],
      live: false,
    },
    rows: [
      boolRow("co-author credit", config.commits.coAuthor, {
        hint: config.commits.coAuthor
          ? `Co-authored-by: ${config.commits.coAuthorName} <${config.commits.coAuthorEmail}>`
          : "no credit trailer added",
      }),
    ],
  });

  // ── Merge advisor (T13, design/merge-advisor.md) ─────────────────────────
  sections.push({
    id: "merge-advisor",
    title: "Merge advisor",
    summary:
      "Suggestion-only thresholds: crossing one makes the advisor recommend staging on an integration branch instead of finishing straight to main. Never blocks an action.",
    editable: {
      surface: "project.yml / vibe config set",
      route: "merge",
      cli: [
        "vibe config set merge.advisor.suggestIntegrationBranchWhen.filesTouched <n>",
      ],
      live: false,
    },
    rows: [
      {
        label: "stage above files touched",
        value: String(
          config.merge.advisor.suggestIntegrationBranchWhen.filesTouched,
        ),
      },
      boolRow(
        "stage on protected paths",
        config.merge.advisor.suggestIntegrationBranchWhen.protectedPaths,
      ),
      {
        label: "stage when behind main by",
        value: String(
          config.merge.advisor.suggestIntegrationBranchWhen.behindMain,
        ),
      },
    ],
  });

  // ── Workflow ─────────────────────────────────────────────────────────────
  sections.push({
    id: "workflow",
    title: "Workflow",
    summary: "The default run recipe and its review / merge gating.",
    editable: {
      surface: "Flows page (recipes) · project.yml",
      route: "flows",
      cli: ["vibe config set workflow.maxReviewLoops <n>"],
      live: false,
    },
    rows: [
      { label: "flow id", value: config.workflow.id },
      {
        label: "max review loops",
        value:
          config.workflow.maxReviewLoops == null
            ? "per-flow (no global cap)"
            : String(config.workflow.maxReviewLoops),
      },
      boolRow("require human merge", config.workflow.requireHumanMerge),
      {
        label: "flow sizing",
        value: config.flowSizing,
        hint: "trivial tasks route to the diff-floored express flow; flowSizing: off disables",
      },
    ],
  });

  // ── Execution ────────────────────────────────────────────────────────────
  sections.push({
    id: "execution",
    title: "Execution",
    summary: "Where runs execute (isolated git worktrees by default).",
    editable: {
      surface: "project.yml / vibe config set",
      route: null,
      cli: ["vibe config set execution.backend <backend>"],
      live: false,
    },
    rows: [{ label: "backend", value: config.execution.backend }],
  });

  // ── Validation commands ──────────────────────────────────────────────────
  const validate = config.commands.validate;
  const validationProfiles = Object.keys(config.commands.validationProfiles ?? {});
  sections.push({
    id: "commands",
    title: "Validation",
    summary: "The commands a run uses to validate changes (tests, typecheck, build).",
    editable: {
      surface: "Settings page",
      route: "settings",
      cli: ['vibe config set commands.validate \'["pnpm test"]\''],
      live: true,
    },
    rows: [
      {
        label: "default",
        value: validate.length ? validate.join(" && ") : "(none set)",
        tone: validate.length ? "default" : "warn",
      },
      {
        label: "named profiles",
        value: validationProfiles.length ? validationProfiles.join(", ") : "(none)",
      },
    ],
  });

  // ── Budget ───────────────────────────────────────────────────────────────
  sections.push({
    id: "budget",
    title: "Budget",
    summary: "Daily spend governance applied before each agent turn.",
    editable: {
      surface: "Settings page",
      route: "settings",
      cli: ["vibe config set budget.spendCapDailyUsd <usd>"],
      live: true,
    },
    rows: [
      {
        label: "daily cap",
        value:
          config.budget.spendCapDailyUsd === null
            ? "(none)"
            : `$${config.budget.spendCapDailyUsd}`,
      },
      { label: "at cap", value: config.budget.capAction },
      {
        label: "warn at",
        value: `${Math.round(config.budget.warnThresholdPct * 100)}%`,
      },
      {
        label: "fallback profile",
        value: config.budget.fallbackProfile ?? "(none)",
      },
    ],
  });

  // ── Policies ─────────────────────────────────────────────────────────────
  sections.push({
    id: "policies",
    title: "Policies",
    summary: "The safety invariants Vibestrate enforces on every run.",
    editable: {
      surface: "Settings page",
      route: "settings",
      cli: [],
      live: true,
    },
    rows: [
      boolRow("forbid main-branch writes", config.policies.forbidMainBranchWrites),
      boolRow("forbid secrets access", config.policies.forbidSecretsAccess),
      boolRow("forbid auto-push", config.policies.forbidAutoPush),
      boolRow("forbid auto-merge", config.policies.forbidAutoMerge),
      boolRow("preserve artifacts", config.policies.preserveArtifacts),
      boolRow("strict apply-only", config.policies.strictApplyOnly),
      boolRow("harden read-only seats", config.policies.hardenReadOnlySeats),
      boolRow("interactive terminal", config.policies.allowInteractiveTerminal, {
        riskyWhenOn: true,
      }),
      {
        label: "force approval at",
        value: config.policies.requireApprovalAtStages.length
          ? config.policies.requireApprovalAtStages.join(", ")
          : "(none)",
      },
      {
        label: "protected paths",
        value: config.policies.protectedPaths.length
          ? `built-ins + ${config.policies.protectedPaths.length} project glob(s)`
          : "built-ins (auth/payments/migrations/CI/lockfiles/.vibestrate)",
        hint: "policies.protectedPaths (additive); opt out of built-ins via policies.unprotectedPaths",
      },
    ],
  });

  // ── Permissions ──────────────────────────────────────────────────────────
  const permissionProfiles = Object.keys(config.permissions.profiles);
  sections.push({
    id: "permissions",
    title: "Permissions",
    summary: "Named permission profiles roles run under (read-only, code-write, …).",
    editable: {
      surface: "Crew page (role permissions) · project.yml",
      route: "crew",
      cli: [],
      live: false,
    },
    rows: [
      {
        label: "profiles",
        value: permissionProfiles.length
          ? permissionProfiles.join(", ")
          : "(built-in defaults)",
      },
    ],
  });

  // ── Scheduler ────────────────────────────────────────────────────────────
  const quotas = Object.entries(config.scheduler.sourceQuotas);
  sections.push({
    id: "scheduler",
    title: "Scheduler",
    summary: "Concurrency, conflict, and fairness controls for the queue.",
    editable: {
      surface: "project.yml / vibe config set",
      route: null,
      cli: ["vibe config set scheduler.maxConcurrentRuns <n>"],
      live: false,
    },
    rows: [
      { label: "max concurrent runs", value: String(config.scheduler.maxConcurrentRuns) },
      {
        label: "max write roles",
        value: String(config.scheduler.maxConcurrentWriteRoles),
      },
      { label: "conflict policy", value: config.scheduler.conflictPolicy },
      { label: "queue policy", value: config.scheduler.queuePolicy },
      {
        label: "default source limit",
        value:
          config.scheduler.defaultSourceConcurrency === undefined
            ? "(unbounded)"
            : String(config.scheduler.defaultSourceConcurrency),
      },
      {
        label: "source quotas",
        value: quotas.length
          ? quotas.map(([s, n]) => `${s}=${n}`).join(", ")
          : "(none)",
      },
    ],
  });

  // ── Editor ───────────────────────────────────────────────────────────────
  sections.push({
    id: "editor",
    title: "Editor handoff",
    summary: "Optional local editor the dashboard can open files in.",
    editable: {
      surface: "Settings page",
      route: "settings",
      cli: ["vibe config set editor.enabled true"],
      live: true,
    },
    rows: [
      boolRow("enabled", config.editor.enabled),
      { label: "command", value: config.editor.command },
      { label: "args", value: config.editor.args.join(" ") },
    ],
  });

  return {
    project: { name: config.project.name, type: config.project.type },
    sections,
  };
}
