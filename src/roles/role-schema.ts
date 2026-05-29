import { z } from "zod";
import { mcpServerSchema } from "../mcp/mcp-schema.js";

/**
 * Seat tokens (the kinds of participant a Flow step needs, e.g. `implementer`)
 * must be single safe tokens so they round-trip through YAML keys, CLI flags,
 * and URL params.
 */
export const SEAT_TOKEN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/;
export const seatTokenSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(
    SEAT_TOKEN_RE,
    "Seat names must use letters, digits, dashes, or underscores.",
  );

/**
 * A **Role** is one teammate inside a **Crew**: its instructions (prompt),
 * permissions, skills, the **Profile** it runs on, and the list of **Seats** it
 * can fill in a Flow. Roles live under `crews.<crewId>.roles` — there is no
 * top-level roles map anymore.
 */
export const crewRoleConfigSchema = z
  .object({
    /** Human label. Defaults to the role id when omitted. */
    label: z.string().min(1).max(120).optional(),
    /** Seats this role can take (the Flow step seats it satisfies). */
    seats: z.array(seatTokenSchema).min(1, "A role must take at least one seat."),
    /** Profile id this role runs on. Must exist in `profiles`. */
    profile: z.string().min(1),
    /** Path to the role's instruction prompt markdown. */
    prompt: z.string().min(1),
    /** Permission profile id (read_only / code_write / …). */
    permissions: z.string().min(1),
    skills: z.array(z.string()).default([]),
    // Optional MCP servers the role declares directly. Merged with
    // servers contributed by its skills at run time (`src/mcp`).
    mcpServers: z.record(z.string().min(1), mcpServerSchema).default({}),
  })
  .strict();

export type CrewRoleConfig = z.infer<typeof crewRoleConfigSchema>;

export const crewRolesConfigSchema = z.record(z.string(), crewRoleConfigSchema);
export type CrewRolesConfigMap = z.infer<typeof crewRolesConfigSchema>;

export const builtinRoleIds = [
  "planner",
  "architect",
  "executor",
  "fixer",
  "reviewer",
  "verifier",
] as const;

export type BuiltinRoleId = (typeof builtinRoleIds)[number];
