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

export const commandsConfigSchema = z.object({
  validate: z.array(z.string()).default([]),
});

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
