import { z } from "zod";
import { crewsConfigSchema } from "../crews/crew-schema.js";
import { profilesConfigSchema } from "../profiles/profile-schema.js";
import { permissionProfilesSchema } from "../permissions/permission-schema.js";
import { providersConfigSchema } from "../providers/provider-schema.js";
import { workflowConfigSchema } from "../workflow/workflow-schema.js";
import { executionConfigSchema } from "../execution/execution-backend-schema.js";

export const projectMetaSchema = z.object({
  name: z.string().min(1),
  type: z.string().default("generic"),
});

export const gitConfigSchema = z.object({
  mainBranch: z.string().default("main").describe("Name of the main/trunk branch (default main)."),
  branchPrefix: z.string().default("vibestrate/").describe("Prefix for run branches (default vibestrate/)."),
  worktreeDir: z.string().default("../.vibestrate-worktrees").describe("Where per-run git worktrees are created."),
  requireCleanMain: z.boolean().default(false).describe("Require a clean main working tree before a run (default off)."),
  allowAutoMerge: z.boolean().default(false).describe("Permit automatic merges to main (default off)."),
  allowAutoPush: z.boolean().default(false).describe("Permit automatic pushes to the remote (default off)."),
  /** Link the project's gitignored env dirs (node_modules, .venv, venv) into
   *  each new worktree so validation commands actually run there
   *  (lockfile-guarded for JS). "off" restores bare worktrees. */
  linkEnvironment: z.enum(["auto", "off"]).default("auto").describe("Link env dirs (node_modules/.venv) into worktrees (default auto)."),
  /** OPT-IN rewind-snapshot retention (ISSUE-001 #1). Each run writes durable
   *  `refs/vibestrate/snapshots/...` so it can be rewound to review/fix/verify;
   *  without pruning, `.git` grows over time. Vibestrate NEVER prunes on its own:
   *  the default 0 = never prune. Set this to a positive N to enable a
   *  user-owned automation - at run start, snapshots beyond the N most-recent
   *  runs are pruned (refs only; branches/worktrees/artifacts untouched, recent
   *  runs stay resumable). This is "set an automation purging," your choice -
   *  not the tool deleting data behind your back. */
  snapshotRetentionRuns: z.number().int().min(0).default(0).describe("Prune rewind snapshots beyond N recent runs; 0 = never prune (default 0)."),
});

/**
 * Profile names must be a single token of letters/digits/dash/underscore so
 * they round-trip safely through CLI flags, URL params, and YAML keys. We
 * reject empty strings and reserved names (the literal "default", "all", and
 * "none") to avoid confusion with the implicit default profile coming from
 * commands.validate.
 */
export const VALIDATION_PROFILE_NAME_RE = /^[a-zA-Z0-9_-]{1,40}$/;
const RESERVED_PROFILE_NAMES = new Set(["default", "all", "none"]);

const profileNameSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(
    VALIDATION_PROFILE_NAME_RE,
    "Profile names must use letters, digits, dashes, or underscores.",
  )
  .refine(
    (v) => !RESERVED_PROFILE_NAMES.has(v),
    'Profile names cannot be "default", "all", or "none".',
  );

const validationProfileEntrySchema = z.object({
  description: z.string().max(200).optional(),
  commands: z
    .array(z.string().min(1))
    .min(1, "A validation profile must list at least one command."),
});

export const commandsConfigSchema = z.object({
  validate: z.array(z.string()).default([]).describe("Validation commands run on a run's diff (e.g. typecheck, test)."),
  /**
   * Proportional validation scoping (proportional-orchestration.md, slice 1).
   * When true (default), a run whose entire diff is provably-inert (only
   * docs/text/asset files - see validation-scope.ts) skips the configured
   * `validate` commands, since running the project's code checks (tests,
   * typecheck) on a `.md`/`.txt`/image change is pure waste. Fail-safe: any
   * non-inert or unknown file (code, .json, .yaml, .sql, no-extension, ...)
   * makes the whole run validate as configured. Set false to always validate.
   */
  scopeValidationByChange: z.boolean().default(true).describe("Skip validation when the diff is docs/asset-only (default on)."),
  /**
   * Optional named validation profiles. The implicit *default* profile is the
   * `validate` array above - it always exists and stays the fallback whenever
   * a caller doesn't pick a named profile. If validationProfiles is absent or
   * empty, every existing flow keeps working exactly as before.
   *
   * Keys are validated against VALIDATION_PROFILE_NAME_RE; reserved names
   * ("default" / "all" / "none") are rejected to avoid clashes with the
   * implicit default. Profiles must list at least one command.
   */
  validationProfiles: z
    .record(profileNameSchema, validationProfileEntrySchema)
    .optional()
    .default({}),
});

export type ValidationProfileEntry = z.infer<typeof validationProfileEntrySchema>;

export const schedulerConfigSchema = z.object({
  maxConcurrentRuns: z.number().int().min(1).max(16).default(1).describe("Max runs in flight at once (default 1)."),
  maxConcurrentWriteRoles: z.number().int().min(1).max(32).default(1).describe("Max write-capable roles running concurrently (default 1)."),
  conflictPolicy: z.enum(["warn", "block"]).default("warn").describe("On a potential write conflict: warn or block (default warn)."),
  // `fair` rotates origins (the `source` tag on each queue entry) so
  // one source can't monopolize the in-flight slots while another has
  // work waiting. Falls back to FIFO within a source.
  queuePolicy: z.enum(["fifo", "priority", "fair"]).default("fifo").describe("Queue ordering: fifo, priority, or fair (default fifo)."),
  // Per-source in-flight cap. Any source not listed here falls back to
  // `defaultSourceConcurrency` if set, otherwise is unbounded (the
  // global `maxConcurrentRuns` still applies on top).
  sourceQuotas: z.record(z.string(), z.number().int().min(1)).default({}),
  defaultSourceConcurrency: z.number().int().min(1).optional().describe("Default per-source in-flight cap for sources not in sourceQuotas."),
});
export type SchedulerConfig = z.infer<typeof schedulerConfigSchema>;

/**
 * Optional local editor handoff. Disabled by default. The dashboard launches
 * `command` with `args` via fixed argv (no shell). `{file}/{line}/{column}`
 * placeholders inside any arg are substituted with values supplied by the
 * user, after the path has passed the central path guard.
 */
export const editorConfigSchema = z.object({
  enabled: z.boolean().default(false).describe("Enable launching a local editor from the dashboard (default off)."),
  command: z.string().min(1).default("code").describe("Editor binary to launch (default code)."),
  args: z.array(z.string()).default(["--goto", "{file}:{line}:{column}"]).describe("Editor args; {file}/{line}/{column} are substituted."),
});
export type EditorConfig = z.infer<typeof editorConfigSchema>;

// Commit attribution. When Vibestrate authors/assists a commit (per-item pickup
// commits, integrator merges, future orchestrator-driven commits) it adds a
// `Co-Authored-By` credit trailer. On by default, opt-out via `coAuthor: false`;
// the identity is overridable. No emojis (repo rule); trailers are line-oriented.
export const commitsConfigSchema = z.object({
  coAuthor: z.boolean().default(true).describe("Add a Co-Authored-By trailer to authored commits (default on)."),
  coAuthorName: z.string().min(1).max(120).default("Vibestrate").describe("Name used in the co-author trailer (default Vibestrate)."),
  coAuthorEmail: z.string().min(1).max(254).default("noreply@vibestrate.com").describe("Email used in the co-author trailer."),
});
export type CommitsConfig = z.infer<typeof commitsConfigSchema>;

// T13 slice 3 (design/merge-advisor.md D6): suggestion-only thresholds.
// Crossing one flips the merge advisor's recommendation to
// stage-on-integration-branch - it NEVER blocks an action. The hard merge
// policies (forbidAutoMerge / forbidAutoPush / requireHumanMerge) live
// elsewhere and are untouched by this section.
export const mergeAdvisorThresholdsSchema = z.object({
  /** Suggest staging above this many changed files (vs the merge-base). */
  filesTouched: z.number().int().min(1).max(100000).default(25).describe("Suggest staging above this many changed files (default 25)."),
  /** Suggest staging when the diff touches any protected path. */
  protectedPaths: z.boolean().default(true).describe("Suggest staging when the diff touches a protected path (default on)."),
  /** Suggest staging when the run branch is this many commits behind main. */
  behindMain: z.number().int().min(1).max(1000000).default(50).describe("Suggest staging when this many commits behind main (default 50)."),
});
export const mergeConfigSchema = z.object({
  advisor: z
    .object({
      suggestIntegrationBranchWhen: mergeAdvisorThresholdsSchema.default({
        filesTouched: 25,
        protectedPaths: true,
        behindMain: 50,
      }),
    })
    .default({}),
});
export type MergeConfig = z.infer<typeof mergeConfigSchema>;

// Stage names a project may flag for forced human approval. These map to the
// transition boundaries the orchestrator already exposes.
export const policyApprovalStageSchema = z.enum([
  "planning",
  "architecting",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
]);
export type PolicyApprovalStage = z.infer<typeof policyApprovalStageSchema>;

// Permission modes (T14 P4): the model-agnostic policy Vibestrate applies to a
// run's writes. read-only = no writes (clamp + claude plan flag + the P3
// container as the hard wall); ask = each turn diff requires human approval;
// accept-edits = writes auto-apply, but the run holds for human review before it
// can be merged (it does not auto-complete); auto = fully hands-off (today's
// default). Per-run override via --permission-mode. Note: ask's per-change
// approval runs on the direct-write diff gate; combined with strictApplyOnly
// (which routes changes through the apply gateway) it refuses changes rather than
// prompting - use one or the other for now.
export const permissionModeSchema = z.enum(["read-only", "ask", "accept-edits", "auto"]);
export type PermissionMode = z.infer<typeof permissionModeSchema>;

export const policiesConfigSchema = z.object({
  defaultPermissionMode: permissionModeSchema.default("auto").describe("Baseline permission mode for runs that don't set one (default auto)."),
  forbidMainBranchWrites: z.boolean().default(true).describe("Block direct writes to the main branch (default on)."),
  forbidSecretsAccess: z.boolean().default(true).describe("Block reading secret-like files into prompts/artifacts (default on)."),
  forbidAutoPush: z.boolean().default(true).describe("Block automatic pushes to the remote (default on)."),
  forbidAutoMerge: z.boolean().default(true).describe("Block automatic merges to main (default on)."),
  preserveArtifacts: z.boolean().default(true).describe("Keep run artifacts instead of cleaning them up (default on)."),
  // Stages where Vibestrate MUST pause for human approval before continuing,
  // regardless of whether the agent emitted HUMAN_APPROVAL: REQUIRED.
  // Default empty: do not force approvals.
  requireApprovalAtStages: z.array(policyApprovalStageSchema).default([]).describe("Stages that always pause for human approval (default none)."),
  // Enables the dashboard's local terminal panel. Default OFF: enrolling
  // requires the user to flip this explicitly in project.yml. Even when
  // enabled, every session is user-launched, scoped to a known run
  // worktree, and started in a constrained env. Browser keystrokes go to
  // an already-created PTY over a WS channel; the server never executes
  // a shell command string supplied over HTTP.
  allowInteractiveTerminal: z.boolean().default(false).describe("Enable the dashboard's local terminal panel (default off)."),
  // S4 - strict apply-only mode. When true, write-capable roles run read-only
  // (no direct disk writes); they propose a unified diff, which Vibestrate
  // applies through the Action Broker gateway (secret/path safety + file.patch
  // policy + audited git apply). High-assurance: every change crosses the gate.
  strictApplyOnly: z.boolean().default(false).describe("Roles run read-only; changes applied via the diff gate (default off)."),
  // S6 follow-up - harden read-only claude seats. When true, a read-only
  // claude-code seat (planner/architect/reviewer/verifier, investigation runs)
  // is run with `--permission-mode plan` so the CLI itself enforces no-write
  // (the agent won't even attempt edits), instead of relying on claude's
  // headless default (writes prompt -> no approver -> denied). claude-only;
  // other providers ignore it. Default OFF: today's behavior is preserved, and
  // plan mode can add "awaiting approval" framing to an action-shaped prompt -
  // opt in for the stronger, explicit guarantee. The worktree + diff gate apply
  // either way. (codex read-only seats get OS confinement via
  // `execution.isolation: sandboxed` instead - this is the claude-side lever.)
  hardenReadOnlySeats: z.boolean().default(false).describe("Run read-only claude seats in plan mode to enforce no-write (default off)."),
  // How long an UNATTENDED run waits at an approval gate before it stops honestly
  // (the gate `expires` -> the run goes `blocked`) instead of hanging forever and
  // wedging a scheduler worker. Attended runs always wait indefinitely (a human is
  // there to answer). This NEVER approves anything - it only bounds the wait when
  // no human is watching. Default 0 = block promptly (after one poll); set higher
  // (ms) to give a delayed watcher a window. Applies only when a run is unattended.
  unattendedApprovalTimeoutMs: z.number().int().nonnegative().default(0).describe("Ms an unattended run waits at a gate before blocking; 0 = block promptly (default 0)."),
  // A2 - protected paths (proportional-orchestration.md). Globs whose changed
  // files always demand the full check descent: never inert for validation
  // scoping, and (future slices) always reviewed. ADDITIVE: these extend the
  // built-in set in orchestrator/protected-paths.ts; they cannot remove it.
  protectedPaths: z.array(z.string().min(1).max(300)).max(200).default([]).describe("Extra globs that always demand full validation/review (default none)."),
  // Explicit opt-out from the BUILT-IN protected set only (e.g. a repo whose
  // "auth/" directory is sample fixtures). User-added protectedPaths are not
  // affected - remove the entry instead. Fail-safe stays the default: an empty
  // list opts out of nothing.
  unprotectedPaths: z.array(z.string().min(1).max(300)).max(200).default([]).describe("Globs opting out of the built-in protected set (default none)."),
});

// Daily spend governance. When `spendCapDailyUsd` is set, the orchestrator
// checks today's estimated spend (across all runs) before each agent turn and,
// at the cap, applies `capAction`. `warnThresholdPct` fires a one-time warning
// notification on the way up.
export const budgetConfigSchema = z
  .object({
    spendCapDailyUsd: z.number().nonnegative().nullable().default(null).describe("Daily USD spend cap across all runs; null = off (default off)."),
    capAction: z
      .enum(["stop", "downgrade-model", "reduce-effort"])
      .default("stop")
      .describe("Action at the spend cap: stop, downgrade-model, or reduce-effort (default stop)."),
    warnThresholdPct: z.number().min(0).max(1).default(0.8).describe("Fraction of the cap that triggers a one-time warning (default 0.8)."),
    /**
     * Cheaper **Profile** id to switch every seated step to on
     * `downgrade-model`. When unset (or the profile is missing), the cap
     * action falls back to `stop`. Budget downgrade is best-effort in the
     * new model - see the orchestrator's enforceSpendCap.
     */
    fallbackProfile: z.string().min(1).optional().describe("Cheaper profile to switch to on downgrade-model; unset falls back to stop."),
    // ── Count/time ceilings (unattended-resilience U1) ──────────────────────
    // Hard caps that bind WITHOUT measured cost - the reliable backstop for
    // unattended runs, since USD cost is often unmeasured for local CLI
    // providers. Checked before every agent turn at the spend-cap checkpoint.
    // All null = off (no behavior change). An agent turn is one model turn
    // (validation/approval-gate steps don't count). See
    // design/unattended-resilience.md.
    /** Max agent turns in a single run. */
    maxTurnsPerRun: z.number().int().positive().nullable().default(null).describe("Max agent turns in a single run; null = off (default off)."),
    /** Max wall-clock minutes for a single run (start to now; catches hangs). */
    maxWallClockMinPerRun: z.number().positive().nullable().default(null).describe("Max wall-clock minutes for a single run; null = off (default off)."),
    /** Max agent turns across ALL runs today (binds even when USD is unmeasured). */
    maxTurnsPerDay: z.number().int().positive().nullable().default(null).describe("Max agent turns across all runs today; null = off (default off)."),
    /** Max wall-clock minutes across all runs today. */
    maxWallClockMinPerDay: z.number().positive().nullable().default(null).describe("Max wall-clock minutes across all runs today; null = off (default off)."),
    /** What to do when a ceiling is hit. `stop` blocks the run honestly;
     *  `pause` waits for a human to approve (continue) or reject (stop) - for
     *  ATTENDED runs (an unattended run would just sit; default stays `stop`).
     *  A run launched with `--unattended` forces `stop` regardless. */
    onLimit: z.enum(["stop", "pause"]).default("stop").describe("When a ceiling is hit: stop or pause (attended); unattended forces stop (default stop)."),
  })
  .default({ spendCapDailyUsd: null, capAction: "stop", warnThresholdPct: 0.8 });

export type BudgetConfig = z.infer<typeof budgetConfigSchema>;

// Provider resilience (unattended-resilience U2). Recoverable provider failures
// - rate limits (429/quota) and transient blips (5xx, "server temporarily
// unavailable", overloaded, timeouts) - are auto-retried with backoff before the
// turn's outcome is final, so an overnight run rides them out instead of dying.
// On by default (pure robustness); hard failures (bad flag, auth, empty output)
// are NOT retried here. `patterns` are extra user regexes merged with built-ins
// (CLI providers phrase errors differently). See design/unattended-resilience.md.
const resilienceClassSchema = z
  .object({
    maxRetries: z.number().int().min(0).max(10).describe("Max retry attempts for this failure class."),
    baseDelayMs: z.number().int().positive().describe("Initial backoff delay in ms before the first retry."),
    maxDelayMs: z.number().int().positive().describe("Cap on the backoff delay in ms."),
    patterns: z.array(z.string().min(1).max(400)).max(40).default([]).describe("Extra error regexes merged with the built-ins (default none)."),
    // After retries are exhausted, try the turn once on this alternate Profile
    // (a different model that may not be limited/down). null/unset = no fallback.
    fallbackProfile: z.string().min(1).nullable().default(null).describe("Alternate profile to try once after retries are exhausted; null = none."),
  })
  .strict();

export const resilienceConfigSchema = z
  .object({
    enabled: z.boolean().default(true).describe("Auto-retry recoverable provider failures with backoff (default on)."),
    /** When retries (+ fallback) are exhausted for a recoverable failure:
     *  `fail` lets the run fail honestly; `pause` waits for a human to approve a
     *  fresh round of retries or reject (give up) - ATTENDED only. Default
     *  `fail`; `--unattended` forces `fail`. */
    onExhausted: z.enum(["fail", "pause"]).default("fail").describe("When retries are exhausted: fail or pause (attended only) (default fail)."),
    /** Auto-derive a fallback Profile when a recoverable failure exhausts its
     *  retries and no explicit fallbackProfile is configured. Trust-scoped:
     *  `crew` (default) only reseats onto a profile ALREADY SEATED in this
     *  run's flow - no provider that wasn't part of the run ever sees its
     *  context; `any` extends to every configured profile (explicit opt-in to
     *  wider routing); `off` disables. The swap is never silent (a
     *  provider.fallback event records it) and never changes the turn's write
     *  permissions (allowWrite is resolved per-turn, not per-profile). */
    autoFallback: z.enum(["off", "crew", "any"]).default("crew").describe("Auto-derive a fallback profile on exhaustion: off, crew, or any (default crew)."),
    rateLimit: resilienceClassSchema
      .extend({ respectRetryAfter: z.boolean().default(true).describe("Honor the provider's Retry-After hint on rate limits (default on).") })
      .default({ maxRetries: 5, baseDelayMs: 2000, maxDelayMs: 120000, respectRetryAfter: true, patterns: [] }),
    transient: resilienceClassSchema.default({
      maxRetries: 4,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      patterns: [],
    }),
    // Subscription usage limits / quotas (U6): a time-windowed per-model quota
    // that *resets* (often hours out), distinct from a per-minute rate limit. On
    // `wait`, sleep for the reset window (the parsed hint, capped at `maxWaitMin`)
    // then retry - "run until the window refills"; `fallback` switches model;
    // `stop` ends honestly (default - waiting hours is opt-in). Waiting is an
    // automatic timed sleep (not a human pause), so it's unattended-safe.
    usageLimit: z
      .object({
        action: z.enum(["stop", "wait", "fallback"]).default("stop").describe("On a usage-limit/quota hit: stop, wait for reset, or fallback (default stop)."),
        /** Cap on how long to wait for a reset (minutes). */
        maxWaitMin: z.number().int().positive().max(1440).default(60).describe("Cap on how long to wait for a quota reset, in minutes (default 60)."),
        /** How many reset-waits to attempt before escalating. */
        maxWaits: z.number().int().min(0).max(50).default(2).describe("How many reset-waits to attempt before escalating (default 2)."),
        /** Alternate Profile for `fallback` (or after waits exhausted). */
        fallbackProfile: z.string().min(1).nullable().default(null).describe("Alternate profile for fallback or after waits are exhausted; null = none."),
        patterns: z.array(z.string().min(1).max(400)).max(40).default([]).describe("Extra usage-limit error regexes merged with the built-ins (default none)."),
      })
      .strict()
      .default({}),
  })
  .strict()
  .default({});
export type ResilienceConfig = z.infer<typeof resilienceConfigSchema>;

// Provider-session lifetime (U7). vibestrate already rebuilds bounded per-turn
// context from artifacts, so context doesn't grow with run length - but a
// *reused* provider session (claude --resume) can still balloon over a marathon.
// `maxReuseTurns` caps consecutive reuses before re-opening a fresh session
// (re-seeded from artifacts - "compaction by re-grounding", lossless). 0 =
// unlimited (today's behavior). Only affects providers that support session
// reuse. See design/unattended-resilience.md.
export const sessionConfigSchema = z
  .object({
    maxReuseTurns: z.number().int().min(0).max(1000).default(0).describe("Max consecutive provider-session reuses before reopening; 0 = unlimited (default 0)."),
  })
  .strict()
  .default({});
export type SessionConfig = z.infer<typeof sessionConfigSchema>;

// ─── Supervisor personas (orchestrator-personas.md) ──────────────────────────
// A persona is the orchestrator's *judgment posture* - an ADVISORY preset that
// biases supervision. It is NOT a crew/flow/profile. It never softens a
// code-enforced gate and never raises confidence past deterministic evidence
// (those rules live in the runtime, not here). One persona ships in code
// ("staff-engineer") so a project with no `personas:` block still resolves.
export const BUILTIN_PERSONA_IDS = ["staff-engineer", "security"] as const;

const personaNameSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(
    VALIDATION_PROFILE_NAME_RE,
    "Persona names must use letters, digits, dashes, or underscores.",
  )
  .refine(
    (v) => !RESERVED_PROFILE_NAMES.has(v),
    'Persona names cannot be "default", "all", or "none".',
  );

export const personaConfigSchema = z
  .object({
    label: z.string().min(1).max(80).describe("Human-readable persona label shown in the UI."),
    description: z.string().max(280).optional().describe("Short description of this persona's judgment posture."),
    /** Path to the supervisor instruction block (diffable, reviewed like code). */
    instructions: z.string().min(1).max(300).optional().describe("Path to the supervisor instruction block file."),
    /**
     * Task-text signals that mark a task risky enough to warrant heavier review.
     * Lowercased substring match (a deterministic mechanism; the POLICY - which
     * signals - is data here, not hardcoded in core). Used only to UPGRADE the
     * flow (more review), never to downgrade, so a false match only adds cost.
     */
    riskSignals: z.array(z.string().min(1).max(60)).default([]).describe("Task-text signals (lowercased substrings) that mark a task risky (default none)."),
    /**
     * Flow(s) this persona favors for risky tasks. The first available one is the
     * upgrade target when a riskSignal matches and the chosen flow is lighter.
     */
    prefersFlows: z.array(z.string().min(1).max(80)).default([]).describe("Flows this persona favors for risky tasks; first available wins (default none)."),
    /** The reviewer's profile (provider-neutral); null = strongest available. */
    reviewerProfile: z.string().min(1).nullable().default(null).describe("Reviewer profile for this persona; null = strongest available."),
    /**
     * Descriptive lens-set shown in the UI (what this persona inspects). Not yet
     * enforced as a panel-review filter this slice - that is a follow-up.
     */
    reviewLenses: z.array(z.string().min(1).max(40)).default([]).describe("Descriptive review lenses shown in the UI (default none)."),
  })
  .strict();
export type PersonaConfig = z.infer<typeof personaConfigSchema>;

export const projectConfigBaseSchema = z.object({
  project: projectMetaSchema,
  git: gitConfigSchema.default({
    mainBranch: "main",
    branchPrefix: "vibestrate/",
    worktreeDir: "../.vibestrate-worktrees",
    requireCleanMain: false,
    allowAutoMerge: false,
    allowAutoPush: false,
  }),
  workflow: workflowConfigSchema.default({
    id: "default-plan-build-review",
    maxReviewLoops: 2,
    requireHumanMerge: true,
  }),
  execution: executionConfigSchema.default({ backend: "local-worktree" }),
  // ─── Providers / Profiles / Crews ────────────────────────────────────
  // providers = raw local tools.
  // profiles  = reusable runtime setups (provider + model/power).
  // crews     = local Role rosters; each Role runs on a Profile and fills Seats.
  providers: providersConfigSchema,
  profiles: profilesConfigSchema.default({}),
  crews: crewsConfigSchema.default({}),
  /** Crew used when a run doesn't pick one. Must exist in `crews`. */
  defaultCrew: z.string().min(1).default("default").describe("Crew used when a run doesn't pick one; must exist in crews (default \"default\")."),
  /**
   * The session/default Flow applied to runs that don't pass `--flow`. When set,
   * it is always applied and shown (`Flow: <name> · default`). When null, the
   * orchestrator selects a Flow per task (see select-workflow). A flow id; must
   * resolve to a built-in or project flow.
   */
  defaultFlow: z.string().min(1).nullable().default(null).describe("Default flow for runs without --flow; null = auto-select per task (default null)."),
  /**
   * Supervisor personas (orchestrator-personas.md). Project-defined personas; the
   * built-in "staff-engineer" always resolves even when this is empty.
   */
  personas: z.record(personaNameSchema, personaConfigSchema).default({}),
  /**
   * The orchestrator's default judgment posture. Resolves to a built-in
   * (BUILTIN_PERSONA_IDS) OR a key in `personas`. Unlike defaultCrew it does NOT
   * require a config entry - the built-in default works out of the box.
   */
  defaultPersona: z.string().min(1).default("staff-engineer").describe("Default judgment posture; built-in or a key in personas (default staff-engineer)."),
  /**
   * A1 flow sizing (orchestrator/flow-sizing.ts): route obviously-trivial
   * tasks to the diff-floored `express` flow. Applies ONLY when no --flow,
   * no --select, and no defaultFlow. `deterministic` = structural classifier,
   * zero model calls (default); `assisted` adds one cheap gray-zone assist
   * call; `off` reproduces the pre-sizing behavior exactly.
   */
  flowSizing: z.enum(["off", "deterministic", "assisted"]).default("deterministic").describe("Route trivial tasks to a lighter flow: off, deterministic, or assisted (default deterministic)."),
  adaptiveShape: z.enum(["off", "auto"]).default("auto").describe("Route plan-worthy greenfield/system briefs into the read-only Shape chain before executing: off or auto (default auto)."),
  budget: budgetConfigSchema,
  resilience: resilienceConfigSchema,
  session: sessionConfigSchema,
  commands: commandsConfigSchema.default({ validate: [] }),
  permissions: z
    .object({
      profiles: permissionProfilesSchema.default({}),
    })
    .default({ profiles: {} }),
  policies: policiesConfigSchema.default({
    forbidMainBranchWrites: true,
    forbidSecretsAccess: true,
    forbidAutoPush: true,
    forbidAutoMerge: true,
    preserveArtifacts: true,
    requireApprovalAtStages: [],
    allowInteractiveTerminal: false,
  }),
  scheduler: schedulerConfigSchema.default({
    maxConcurrentRuns: 1,
    maxConcurrentWriteRoles: 1,
    conflictPolicy: "warn",
    queuePolicy: "fifo",
    sourceQuotas: {},
  }),
  editor: editorConfigSchema.default({
    enabled: false,
    command: "code",
    args: ["--goto", "{file}:{line}:{column}"],
  }),
  commits: commitsConfigSchema.default({
    coAuthor: true,
    coAuthorName: "Vibestrate",
    coAuthorEmail: "noreply@vibestrate.com",
  }),
  merge: mergeConfigSchema.default({}),
});

/**
 * Cross-record integrity:
 *  - every profile.provider exists in providers,
 *  - every crew role.profile exists in profiles,
 *  - every crew has at least one role,
 *  - defaultCrew exists in crews.
 * (fills tokens are validated by the seat token schema; per-record shape by the
 * sub-schemas above.)
 */
export const projectConfigSchema = projectConfigBaseSchema.superRefine(
  (cfg, ctx) => {
    for (const [profileId, profile] of Object.entries(cfg.profiles)) {
      if (!cfg.providers[profile.provider]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["profiles", profileId, "provider"],
          message: `Profile "${profileId}" references unknown provider "${profile.provider}".`,
        });
      }
    }

    const crewIds = Object.keys(cfg.crews);
    if (crewIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["crews"],
        message: "At least one crew must be defined.",
      });
    }
    for (const [crewId, crew] of Object.entries(cfg.crews)) {
      const roleIds = Object.keys(crew.roles);
      if (roleIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["crews", crewId, "roles"],
          message: `Crew "${crewId}" must define at least one role.`,
        });
      }
      for (const [roleId, role] of Object.entries(crew.roles)) {
        if (!cfg.profiles[role.profile]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["crews", crewId, "roles", roleId, "profile"],
            message: `Crew "${crewId}" role "${roleId}" references unknown profile "${role.profile}".`,
          });
        }
      }
    }

    if (crewIds.length > 0 && !cfg.crews[cfg.defaultCrew]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultCrew"],
        message: `defaultCrew "${cfg.defaultCrew}" is not defined in crews.`,
      });
    }

    // Personas: defaultPersona must resolve to a built-in OR a config entry
    // (NOT defaultCrew's "must be in config" rule - the built-in works out of
    // the box, so requiring a config entry would break every existing project).
    const personaIds = new Set([
      ...BUILTIN_PERSONA_IDS,
      ...Object.keys(cfg.personas),
    ]);
    if (!personaIds.has(cfg.defaultPersona)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultPersona"],
        message: `defaultPersona "${cfg.defaultPersona}" is not a built-in (${BUILTIN_PERSONA_IDS.join(", ")}) or a key in personas.`,
      });
    }
    for (const [personaId, persona] of Object.entries(cfg.personas)) {
      if (persona.reviewerProfile && !cfg.profiles[persona.reviewerProfile]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["personas", personaId, "reviewerProfile"],
          message: `Persona "${personaId}" references unknown reviewerProfile "${persona.reviewerProfile}".`,
        });
      }
    }
  },
);

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
