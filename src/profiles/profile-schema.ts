import { z } from "zod";

/**
 * A **Profile** is how strong and expensive a Role should run. It chooses the
 * Provider plus its runtime knobs: model, power/effort, token budget, timeout.
 *
 * Power/effort is **provider-specific** on purpose. Different providers expose
 * different reasoning/effort controls and some expose none, so `power` is a free
 * string here (validated against the provider's known levels at the UI layer,
 * hidden entirely when the provider has none). We never force one global
 * low/medium/high enum onto every provider.
 */
export const profileConfigSchema = z
  .object({
    /** Raw provider id this profile runs on. Must exist in `providers`. */
    provider: z.string().min(1),
    /** Human label shown in the dashboard. Defaults to the profile id. */
    label: z.string().min(1).max(120).optional(),
    /** Provider model id (e.g. `sonnet`, `opus`). null = provider default. */
    model: z.string().min(1).nullable().default(null),
    /**
     * Provider-specific power/effort level (e.g. `balanced`, `deep`). Free
     * string — the valid set comes from provider metadata, not a global enum.
     * null = the provider exposes no effort control (UI hides the field).
     */
    power: z.string().min(1).nullable().default(null),
    /**
     * Coarse spend appetite. Conventionally `low`/`medium`/`high` but kept a
     * free string so providers with their own budget vocabulary fit too.
     */
    budget: z.string().min(1).nullable().default(null),
    /** Hard cap on output tokens for a turn, when the provider supports it. */
    maxTokens: z.number().int().positive().nullable().default(null),
    /** Per-turn wall-clock timeout in milliseconds. null = provider default. */
    timeoutMs: z.number().int().positive().nullable().default(null),
    /** Escape hatch for raw provider-specific options. */
    providerOptions: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type ProfileConfig = z.infer<typeof profileConfigSchema>;

export const profilesConfigSchema = z.record(z.string(), profileConfigSchema);
export type ProfilesConfigMap = z.infer<typeof profilesConfigSchema>;
