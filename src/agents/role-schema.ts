import path from "node:path";
import { z } from "zod";
import { ConfigError } from "../utils/errors.js";
import { mcpServerSchema } from "../providers/mcp/mcp-schema.js";

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
 * can fill in a Flow. Roles live under `crews.<crewId>.roles` - there is no
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
    /**
     * Path to the role's JSON role file (`roleFileSchema`), relative to the
     * project root or absolute. The suffix is not enforced here so that a stale
     * `.md` pointer survives config validation and is reported by the loader,
     * which can name the file and say what to change.
     */
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

export const ROLE_FILE_SCHEMA_VERSION = 1;

/**
 * Role files are written and read by Vibestrate, so they are JSON: Markdown is
 * reserved for what a human authors (VIBESTRATE.md, the shipped docs). One file
 * holds one role's identity and the instruction text handed to the agent.
 *
 * The crew-scoped wiring (seats, profile, permissions, skills, mcpServers)
 * deliberately stays in `project.yml`: the same role file is pointed at by
 * several crews that differ only in which profile they run it on, so folding
 * those keys in here would give a role two sources of truth.
 */
export const roleFileSchema = z
  .object({
    /** Rejecting an unknown version is what makes a future shape change loud. */
    schemaVersion: z.literal(ROLE_FILE_SCHEMA_VERSION),
    /** Role this file defines. Must match the file's basename. */
    id: seatTokenSchema,
    /** The instruction text, verbatim. Consumers treat it as opaque prose. */
    prompt: z.string().min(1),
  })
  .strict();

export type RoleFile = z.infer<typeof roleFileSchema>;

/**
 * The single funnel for turning role-file bytes into a validated role. Every
 * failure names the file, because the caller usually only has a config value
 * to go on.
 */
export function parseRoleFile(text: string, sourcePath: string): RoleFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new ConfigError(
      `Role file ${sourcePath} is not valid JSON. A role file looks like {"schemaVersion": ${ROLE_FILE_SCHEMA_VERSION}, "id": "planner", "prompt": "..."}.`,
      err,
    );
  }
  const parsed = roleFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Invalid role file at ${sourcePath}:\n${issues}`);
  }
  const basename = path.basename(sourcePath, ".json");
  if (parsed.data.id !== basename) {
    throw new ConfigError(
      `Role file ${sourcePath} declares id "${parsed.data.id}" but is named "${basename}.json". A role file is named after the role it defines - rename the file or fix the id.`,
    );
  }
  return parsed.data;
}

export const builtinRoleIds = [
  "planner",
  "architect",
  "executor",
  "fixer",
  "reviewer",
  "verifier",
] as const;

export type BuiltinRoleId = (typeof builtinRoleIds)[number];
