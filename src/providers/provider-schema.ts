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

// ── Non-CLI providers (Phase 4) ─────────────────────────────────────────────
// Two HTTP-backed provider types. Both speak the same request machinery
// (src/providers/http-api-provider.ts); they differ in *where* they send and
// whether a key is required:
//   - http-api       → an external cloud API (Anthropic / OpenAI). https only,
//                      never loopback; the API key is an env-ref ONLY (never a
//                      literal in YAML, never logged). Destination is external.
//   - localhost-proxy → a model server on this machine (Ollama / LM Studio /
//                      vLLM). Loopback host only ⇒ no egress.
// `local-first` is sovereignty, not egress: a cloud-API provider is the user's
// own key calling their chosen destination — there is no Vibestrate backend.

/** API key references must be env-vars (`env:NAME`) — never a literal secret. */
export const ENV_REF_RE = /^env:[A-Z][A-Z0-9_]*$/;
const apiKeyRefSchema = z
  .string()
  .regex(
    ENV_REF_RE,
    "API key must be an env reference like env:ANTHROPIC_API_KEY — never a literal key in config.",
  );

export const httpApiProviderSchema = z.object({
  type: z.literal("http-api"),
  /** Wire protocol — picks the request/response shape. */
  api: z.enum(["anthropic", "openai"]),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: apiKeyRefSchema,
  maxTokens: z.number().int().positive().max(200_000).default(4096),
  /** Optional non-secret static headers (e.g. a beta flag). */
  headers: z.record(z.string(), z.string()).optional(),
});
export type HttpApiProviderConfig = z.infer<typeof httpApiProviderSchema>;

export const localhostProxyProviderSchema = z.object({
  type: z.literal("localhost-proxy"),
  api: z.enum(["openai", "ollama"]),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  /** Most local servers need no key; some accept a dummy one via env-ref. */
  apiKey: apiKeyRefSchema.optional(),
  maxTokens: z.number().int().positive().max(200_000).default(4096),
});
export type LocalhostProxyProviderConfig = z.infer<
  typeof localhostProxyProviderSchema
>;

/** True for localhost / 127.0.0.0/8 / ::1 hosts (no egress). */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    h === "localhost" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  );
}

const baseProviderUnion = z.discriminatedUnion("type", [
  cliProviderSchema,
  claudeCodeProviderSchema,
  httpApiProviderSchema,
  localhostProxyProviderSchema,
]);

export const providerConfigSchema = baseProviderUnion.superRefine((c, ctx) => {
  if (c.type === "http-api" || c.type === "localhost-proxy") {
    let url: URL;
    try {
      url = new URL(c.baseUrl);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["baseUrl"], message: "Invalid URL." });
      return;
    }
    const loopback = isLoopbackHost(url.hostname);
    if (c.type === "http-api") {
      if (url.protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["baseUrl"],
          message: "http-api baseUrl must be https.",
        });
      }
      if (loopback) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["baseUrl"],
          message: "Use type: localhost-proxy for a localhost endpoint (no key, no egress).",
        });
      }
    } else if (!loopback) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseUrl"],
        message: "localhost-proxy baseUrl must point at localhost / 127.0.0.1 / [::1] (no egress).",
      });
    }
  }
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const providersConfigSchema = z.record(z.string(), providerConfigSchema);
export type ProvidersConfigMap = z.infer<typeof providersConfigSchema>;

/** A human label for a provider's invocation target — the CLI command, or the
 *  api/model for HTTP-backed providers. Safe to log (no secrets). */
export function providerCommandLabel(config: ProviderConfig): string {
  if (config.type === "cli" || config.type === "claude-code") {
    return config.command;
  }
  return `${config.api} (${config.model})`;
}

/** True when the provider's destination is an external network service. */
export function isExternalProvider(config: ProviderConfig): boolean {
  return config.type === "http-api";
}
