import { z } from "zod";

export const cliProviderSchema = z.object({
  type: z.literal("cli"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  input: z.enum(["stdin", "arg"]).default("stdin"),
  env: z.record(z.string(), z.string()).optional(),
});

export type CliProviderConfig = z.infer<typeof cliProviderSchema>;

export const providerConfigSchema = cliProviderSchema;
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const providersConfigSchema = z.record(z.string(), providerConfigSchema);
export type ProvidersConfigMap = z.infer<typeof providersConfigSchema>;
