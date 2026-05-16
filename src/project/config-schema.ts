import { z } from "zod";
import { agentsConfigSchema } from "../agents/agent-schema.js";
import { permissionProfilesSchema } from "../permissions/permission-schema.js";
import { providersConfigSchema } from "../providers/provider-schema.js";
import { workflowConfigSchema } from "../workflow/workflow-schema.js";
import { executionConfigSchema } from "../execution/execution-backend-schema.js";

export const projectMetaSchema = z.object({
  name: z.string().min(1),
  type: z.string().default("generic"),
});

export const gitConfigSchema = z.object({
  mainBranch: z.string().default("main"),
  branchPrefix: z.string().default("amaco/"),
  worktreeDir: z.string().default("../.amaco-worktrees"),
  requireCleanMain: z.boolean().default(false),
  allowAutoMerge: z.boolean().default(false),
  allowAutoPush: z.boolean().default(false),
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
  validate: z.array(z.string()).default([]),
  /**
   * Optional named validation profiles. The implicit *default* profile is the
   * `validate` array above — it always exists and stays the fallback whenever
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
  maxConcurrentRuns: z.number().int().min(1).max(16).default(1),
  maxConcurrentWriteAgents: z.number().int().min(1).max(32).default(1),
  conflictPolicy: z.enum(["warn", "block"]).default("warn"),
  queuePolicy: z.enum(["fifo", "priority"]).default("fifo"),
});
export type SchedulerConfig = z.infer<typeof schedulerConfigSchema>;

/**
 * Optional local editor handoff. Disabled by default. The dashboard launches
 * `command` with `args` via fixed argv (no shell). `{file}/{line}/{column}`
 * placeholders inside any arg are substituted with values supplied by the
 * user, after the path has passed the central path guard.
 */
export const editorConfigSchema = z.object({
  enabled: z.boolean().default(false),
  command: z.string().min(1).default("code"),
  args: z.array(z.string()).default(["--goto", "{file}:{line}:{column}"]),
});
export type EditorConfig = z.infer<typeof editorConfigSchema>;

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

export const policiesConfigSchema = z.object({
  forbidMainBranchWrites: z.boolean().default(true),
  forbidSecretsAccess: z.boolean().default(true),
  forbidAutoPush: z.boolean().default(true),
  forbidAutoMerge: z.boolean().default(true),
  preserveArtifacts: z.boolean().default(true),
  // Stages where Amaco MUST pause for human approval before continuing,
  // regardless of whether the agent emitted HUMAN_APPROVAL: REQUIRED.
  // Default empty: do not force approvals.
  requireApprovalAtStages: z.array(policyApprovalStageSchema).default([]),
  // Enables the dashboard's local terminal panel. Default OFF: enrolling
  // requires the user to flip this explicitly in project.yml. Even when
  // enabled, every session is user-launched, scoped to a known run
  // worktree, and started in a constrained env. Browser keystrokes go to
  // an already-created PTY over a WS channel; the server never executes
  // a shell command string supplied over HTTP.
  allowInteractiveTerminal: z.boolean().default(false),
});

export const projectConfigSchema = z.object({
  project: projectMetaSchema,
  git: gitConfigSchema.default({
    mainBranch: "main",
    branchPrefix: "amaco/",
    worktreeDir: "../.amaco-worktrees",
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
  providers: providersConfigSchema,
  // ─── Shared effort → provider mapping ────────────────────────────────
  // Optional. When set, a task's `effort: low|medium|high` resolves to
  // the corresponding provider id; the orchestrator then forces every
  // agent in that run to use it (overriding agent.provider). When the
  // map is missing or doesn't have the requested key, the run logs an
  // honest "effort X requested but no mapping" event and falls back to
  // the agent's configured provider.
  effortMap: z
    .object({
      low: z.string().min(1).optional(),
      medium: z.string().min(1).optional(),
      high: z.string().min(1).optional(),
    })
    .partial()
    .default({}),
  agents: agentsConfigSchema,
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
    maxConcurrentWriteAgents: 1,
    conflictPolicy: "warn",
    queuePolicy: "fifo",
  }),
  editor: editorConfigSchema.default({
    enabled: false,
    command: "code",
    args: ["--goto", "{file}:{line}:{column}"],
  }),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
