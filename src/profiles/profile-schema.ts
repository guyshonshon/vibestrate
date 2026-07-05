import { z } from "zod";

/**
 * A **Profile** is how strong and expensive a Role should run. It chooses the
 * Provider plus its runtime knobs: model, power/effort, max-tokens, timeout.
 *
 * Power/effort is **provider-specific** on purpose. Different providers expose
 * different reasoning/effort controls and some expose none, so `power` is a free
 * string here (validated against the provider's known levels at the UI layer,
 * hidden entirely when the provider has none). We never force one global
 * low/medium/high enum onto every provider.
 *
 * (There is no per-profile spend knob: an output-token cap is `maxTokens` and
 * actual spend control is the project-level daily cap, `config.budget`. A
 * removed `budget` string is tolerated below for back-compat - it never had a
 * runtime effect.)
 */
const profileBaseSchema = z
  .object({
    /** Raw provider id this profile runs on. Must exist in `providers`. */
    provider: z.string().min(1),
    /** Human label shown in the dashboard. Defaults to the profile id. */
    label: z.string().min(1).max(120).optional(),
    /** Provider model id (e.g. `sonnet`, `opus`). null = provider default. */
    model: z.string().min(1).nullable().default(null),
    /**
     * Provider-specific power/effort level (e.g. `balanced`, `deep`). Free
     * string - the valid set comes from provider metadata, not a global enum.
     * null = the provider exposes no effort control (UI hides the field).
     */
    power: z.string().min(1).nullable().default(null),
    /** Hard cap on output tokens for a turn, when the provider supports it. */
    maxTokens: z.number().int().positive().nullable().default(null),
    /** Per-turn wall-clock timeout in milliseconds. null = provider default. */
    timeoutMs: z.number().int().positive().nullable().default(null),
    /**
     * Provider tool names this role may NOT use (maps to the `claude-code`
     * provider's `--disallowedTools`). The main use is `["Task"]` on a strict
     * flow's write seats, so nested sub-agents can't orchestrate outside the
     * flow DAG - keeping the supervisor's scheduling legible. Best-effort, not a
     * hard boundary: it blocks the default sub-agent path (the `Task` tool), not
     * `--agents` or MCP tools that fan out under other names. Read/explore
     * sub-agents on a read-only seat are already write-safe via
     * `--permission-mode plan`; this knob is about orchestration legibility, not
     * a write guard. null/empty = today's behavior (nothing disallowed).
     */
    disallowedTools: z.array(z.string().min(1)).nullable().default(null),
    /** Escape hatch for raw provider-specific options. */
    providerOptions: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

/**
 * Strip a legacy per-profile `budget` key before the strict parse. Older
 * configs (and the old `vibe init` template) wrote `budget: medium` onto every
 * profile, but it was never read at runtime. Dropping it silently keeps those
 * configs loading instead of failing the whole project on an unknown key.
 */
export const profileConfigSchema = z.preprocess((val) => {
  if (val && typeof val === "object" && !Array.isArray(val) && "budget" in val) {
    const { budget: _legacyBudget, ...rest } = val as Record<string, unknown>;
    return rest;
  }
  return val;
}, profileBaseSchema);

export type ProfileConfig = z.infer<typeof profileConfigSchema>;

export const profilesConfigSchema = z.record(z.string(), profileConfigSchema);
export type ProfilesConfigMap = z.infer<typeof profilesConfigSchema>;
