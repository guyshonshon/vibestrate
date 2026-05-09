import { z } from "zod";
import { claudeCodeSettingsSchema } from "./claude-code-settings.js";

export const cliProviderSchema = z.object({
  type: z.literal("cli"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  input: z.enum(["stdin", "arg"]).default("stdin"),
  env: z.record(z.string(), z.string()).optional(),
});

export type CliProviderConfig = z.infer<typeof cliProviderSchema>;

export const claudeCodeProviderSchema = z.object({
  type: z.literal("claude-code"),
  command: z.string().min(1).default("claude"),
  args: z.array(z.string()).default(["-p"]),
  input: z.enum(["stdin", "arg"]).default("stdin"),
  env: z.record(z.string(), z.string()).optional(),
  settings: claudeCodeSettingsSchema.optional(),
});

export type ClaudeCodeProviderSchemaConfig = z.infer<
  typeof claudeCodeProviderSchema
>;

export const providerConfigSchema = z.discriminatedUnion("type", [
  cliProviderSchema,
  claudeCodeProviderSchema,
]);
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const providersConfigSchema = z.record(z.string(), providerConfigSchema);
export type ProvidersConfigMap = z.infer<typeof providersConfigSchema>;
