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

export const policiesConfigSchema = z.object({
  forbidMainBranchWrites: z.boolean().default(true),
  forbidSecretsAccess: z.boolean().default(true),
  forbidAutoPush: z.boolean().default(true),
  forbidAutoMerge: z.boolean().default(true),
  preserveArtifacts: z.boolean().default(true),
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
  }),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
