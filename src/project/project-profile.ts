import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathExists, readText, ensureDir } from "../utils/fs.js";
import { projectProfilePath, vibestrateRoot } from "../utils/paths.js";
import { withFileMutex } from "../utils/file-mutex.js";
import { scanTextForSecrets } from "../core/diff-service.js";
import { resolveFlowParams } from "../flows/runtime/prompt-params.js";
import type { FlowParam } from "../flows/schemas/flow-schema.js";

// ── Durable project profile (Profiling / durable param memory) ───────────────
//
// A project-global store of typed param *answers* that survive across runs, so
// a user fills "their project's data" once and every run reuses it. The mental
// model: a flow declares the *shape* (typed `params`); this profile holds the
// durable *values*; param resolution seeds them in (see prompt-params seeding +
// orchestrator).
//
// Two load-bearing safety rules, both fixed in the adversarial design review:
//   1. Keys are **flow-id-namespaced by default** (`<flowId>.<param>`) so two
//      flows that both declare `name` never silently cross-contaminate. A param
//      may opt into a **project-global** bare key with `shared: true`.
//   2. A declared `secret: true` param stores an `env:NAME` reference, never the
//      literal - that is the real guarantee against secrets in the JSON, and it
//      requires going through the typed (`--flow` / API) path. As a backstop,
//      every non-secret write is scanned for high-precision vendor token SHAPES
//      (`scanTextForSecrets`) and refused if one is found. That scan is a
//      best-effort tripwire for the common "pasted a vendor key" mistake, NOT a
//      guarantee: an unshaped credential (a bare password, a basic-auth string)
//      can pass it. So a raw secret is reliably kept out only for declared secret
//      params; bare-key writes are non-secret-only by contract. `.vibestrate/` is
//      gitignored too, but that is defense in depth, not the primary guard.
//
// Writes are serialized by the same cross-process `withFileMutex` the ledger
// uses, and land via temp+rename so a crash mid-write can't truncate the file.

export const PROFILE_SCHEMA_VERSION = 1;

/** How a stored value got there - surfaced so the user knows what to trust. */
export const profileSetBySchema = z.enum(["user", "generated", "default"]);
export type ProfileSetBy = z.infer<typeof profileSetBySchema>;

export const profileEntrySchema = z
  .object({
    /** The stored answer as a raw string (coerced against the param type at
     *  resolution time, exactly like a `--param` value). For a secret entry
     *  this is an `env:NAME` reference, never the literal secret. */
    value: z.string(),
    setBy: profileSetBySchema,
    /** ISO timestamp of the write. */
    at: z.string(),
    /** True -> `value` is an `env:NAME` ref for a secret param. */
    secret: z.boolean().default(false),
  })
  .strict();
export type ProfileEntry = z.infer<typeof profileEntrySchema>;

export const projectProfileSchema = z
  .object({
    schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
    /** storage key -> entry. Key is `<flowId>.<param>` (namespaced) or a bare
     *  param name (shared). */
    values: z.record(z.string(), profileEntrySchema).default({}),
  })
  .strict();
export type ProjectProfile = z.infer<typeof projectProfileSchema>;

export function emptyProfile(): ProjectProfile {
  return { schemaVersion: PROFILE_SCHEMA_VERSION, values: {} };
}

// ── Key shapes ───────────────────────────────────────────────────────────────
// A bare (shared) key is a param name: `^[a-z][a-zA-Z0-9_]*$` (matches
// flowParamNameSchema). A namespaced key is `<flowId>.<param>` where flowId is
// `^[a-z][a-z0-9-]*$`. Neither alphabet contains `.`, so the two never collide.
const SHARED_KEY_RE = /^[a-z][a-zA-Z0-9_]*$/;
const NAMESPACED_KEY_RE = /^[a-z][a-z0-9-]*\.[a-z][a-zA-Z0-9_]*$/;
/** An `env:NAME` secret reference (NAME is an upper-snake env var). */
const ENV_REF_RE = /^env:([A-Z][A-Z0-9_]*)$/;
/** A bare env var NAME (what the user types for a secret param). */
const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

/** A valid profile storage key (shared bare name OR `<flowId>.<param>`). */
export function isProfileKey(key: string): boolean {
  return SHARED_KEY_RE.test(key) || NAMESPACED_KEY_RE.test(key);
}

/** The storage key for a flow param: bare (shared) or `<flowId>.<param>`. */
export function profileKeyFor(
  flowId: string,
  paramName: string,
  shared: boolean,
): string {
  return shared ? paramName : `${flowId}.${paramName}`;
}

/** The `VIBESTRATE_PARAM_<NAME>` env var that seeds a param in CI. `<NAME>` is
 *  the param name upper-snake-cased so `colorTokens` and `color_tokens` both map
 *  to `COLOR_TOKENS` (deterministic; a pathological flow declaring both collides
 *  - acceptable, documented). */
export function paramEnvVarName(paramName: string): string {
  const snake = paramName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase();
  return `VIBESTRATE_PARAM_${snake}`;
}

/** The env var name a secret `env:NAME` ref points at, or null. */
export function secretEnvVarName(value: string): string | null {
  const m = ENV_REF_RE.exec(value.trim());
  return m ? m[1]! : null;
}

// ── A typed write request the CLI / API both build ──────────────────────────

export type ProfileSetRequest = {
  key: string;
  /** For a secret param: the env var NAME (stored as `env:NAME`). Otherwise the
   *  raw string value. */
  value: string;
  setBy: ProfileSetBy;
  secret: boolean;
};

export class ProfileWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileWriteError";
  }
}

/** Validate + normalize one set request into the entry value to store. Pure;
 *  throws ProfileWriteError on a bad key, a secret-shaped non-secret value, or a
 *  malformed env var name. Returns the string to persist. */
export function normalizeProfileValue(req: ProfileSetRequest): string {
  if (!isProfileKey(req.key)) {
    throw new ProfileWriteError(
      `Invalid profile key "${req.key}". Use a bare param name (shared) or "<flowId>.<param>".`,
    );
  }
  if (req.secret) {
    // Secret params collect an env var NAME, stored as `env:NAME` - a raw secret
    // never lands in the JSON. Accept an already-formed `env:NAME` too.
    const name = secretEnvVarName(req.value) ?? req.value.trim();
    if (!ENV_NAME_RE.test(name)) {
      throw new ProfileWriteError(
        `A secret param stores an environment variable NAME (e.g. OPENAI_API_KEY), not the value. "${req.value}" is not a valid env var name.`,
      );
    }
    return `env:${name}`;
  }
  // Non-secret values are refused if they match a high-precision vendor token
  // SHAPE - a best-effort tripwire for the "pasted an API key" mistake (the user
  // almost certainly meant to declare the param `secret`). Not a guarantee: an
  // unshaped credential can pass. The real secret guarantee is the env:NAME path.
  const matches = scanTextForSecrets(req.value);
  if (matches.length > 0) {
    throw new ProfileWriteError(
      `Refusing to store "${req.key}": the value looks like a secret (${matches[0]!.pattern}). Declare the flow param \`secret: true\` and store an env var NAME instead.`,
    );
  }
  return req.value;
}

/** Turn `key=value` assignments into validated set requests, shared by the CLI
 *  and the HTTP route so they can't drift. When `flowId` is given, keys are the
 *  flow's declared params (type-checked, secret-aware, namespaced); otherwise
 *  keys are raw profile keys (a bare name is project-global). Pure given `env`
 *  (defaults to `process.env`) - returns soft `warnings` (e.g. an env var not yet
 *  set, a bare key) and hard `errors` (unknown param, bad type, bad key) for the
 *  caller to surface. Does NOT throw on a bad assignment - it collects errors. */
export function buildProfileSetRequests(input: {
  flowId: string | null;
  defs: Record<string, FlowParam> | null;
  assignments: { key: string; value: string }[];
  setBy?: ProfileSetBy;
  env?: Record<string, string | undefined>;
}): { requests: ProfileSetRequest[]; warnings: string[]; errors: string[] } {
  const env = input.env ?? process.env;
  const setBy = input.setBy ?? "user";
  const requests: ProfileSetRequest[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const { key, value } of input.assignments) {
    if (input.flowId) {
      const def = input.defs?.[key];
      if (!def) {
        errors.push(
          `Flow "${input.flowId}" has no param "${key}". Declared: ${Object.keys(input.defs ?? {}).join(", ") || "(none)"}.`,
        );
        continue;
      }
      if (def.secret) {
        const envName = secretEnvVarName(value) ?? value.trim();
        if (!ENV_NAME_RE.test(envName)) {
          errors.push(
            `Secret param "${key}" stores an env var NAME (e.g. OPENAI_API_KEY), not the value.`,
          );
          continue;
        }
        if (env[envName] === undefined) {
          warnings.push(
            `env var ${envName} is not set - the secret "${key}" will resolve once it is.`,
          );
        }
      } else {
        const check = resolveFlowParams({ [key]: def }, { [key]: value });
        if (check.errors.length > 0) {
          errors.push(...check.errors);
          continue;
        }
      }
      requests.push({
        key: profileKeyFor(input.flowId, key, def.shared),
        value,
        setBy,
        secret: def.secret,
      });
    } else {
      if (!isProfileKey(key)) {
        errors.push(
          `"${key}" is not a valid profile key. Use --flow with a param name, a bare name (project-global), or "<flowId>.<param>".`,
        );
        continue;
      }
      if (!key.includes(".")) {
        warnings.push(
          `"${key}" stored as a project-global key. Most params are flow-scoped by default - pass a flow id if you meant a specific flow's param.`,
        );
      }
      // The no-flow path is NON-SECRET ONLY (we have no schema to know a key is
      // secret). The scan-on-write tripwire still refuses obvious vendor shapes;
      // a secret param must be set via the flow path so it stores an env:NAME ref.
      requests.push({ key, value, setBy, secret: false });
    }
  }
  return { requests, warnings, errors };
}

/** Append-or-replace store for the durable project profile. */
export class ProfileStore {
  constructor(private readonly projectRoot: string) {}

  get filePath(): string {
    return projectProfilePath(this.projectRoot);
  }

  /** Read the profile, or an empty one if absent. A torn/old-shape file throws
   *  (fail loud) rather than silently dropping a user's stored answers. */
  async read(): Promise<ProjectProfile> {
    if (!(await pathExists(this.filePath))) return emptyProfile();
    const text = await readText(this.filePath);
    return projectProfileSchema.parse(JSON.parse(text));
  }

  /** Set (create or replace) entries. Mutex-guarded read-modify-write; each
   *  value is normalized/guarded; the file is replaced atomically (temp+rename).
   *  `now` is injected so the store stays free of `Date.now()` and testable. */
  async set(requests: ProfileSetRequest[], now: string): Promise<ProjectProfile> {
    // Validate everything BEFORE taking the lock so a bad request fails fast and
    // never half-writes.
    const normalized = requests.map((r) => ({
      key: r.key,
      entry: {
        value: normalizeProfileValue(r),
        setBy: r.setBy,
        at: now,
        secret: r.secret,
      } satisfies ProfileEntry,
    }));
    await ensureDir(vibestrateRoot(this.projectRoot));
    return withFileMutex(`${this.filePath}.lock`, async () => {
      const current = await this.read();
      for (const { key, entry } of normalized) current.values[key] = entry;
      await this.writeAtomic(current);
      return current;
    });
  }

  /** Remove entries by key (user-initiated; never automatic). Returns the keys
   *  that existed and were removed. */
  async unset(keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    return withFileMutex(`${this.filePath}.lock`, async () => {
      const current = await this.read();
      const removed: string[] = [];
      for (const k of keys) {
        if (k in current.values) {
          delete current.values[k];
          removed.push(k);
        }
      }
      if (removed.length > 0) await this.writeAtomic(current);
      return removed;
    });
  }

  private async writeAtomic(profile: ProjectProfile): Promise<void> {
    const body = JSON.stringify(projectProfileSchema.parse(profile), null, 2);
    const tmp = `${this.filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, body + "\n", "utf8");
    try {
      await fs.rename(tmp, this.filePath);
    } catch (err) {
      await fs.unlink(tmp).catch(() => undefined);
      throw err;
    }
  }
}

// ── Resolution-side helpers (pure) ───────────────────────────────────────────

/** A flow param's effective profile entry, resolved through namespacing. */
export type ResolvedProfileParam = {
  key: string;
  /** The stored value. For a secret this is the `env:NAME` ref. */
  value: string;
  setBy: ProfileSetBy;
  secret: boolean;
};

/** For a flow's declared params, the stored profile entry of each (looked up by
 *  the namespaced/shared key). Param-name keyed for form prefill + seeding. Pure. */
export function resolveProfileForFlow(
  profile: ProjectProfile,
  flowId: string,
  defs: Record<string, FlowParam> | null | undefined,
): Record<string, ResolvedProfileParam> {
  const out: Record<string, ResolvedProfileParam> = {};
  for (const [name, def] of Object.entries(defs ?? {})) {
    const key = profileKeyFor(flowId, name, def.shared);
    const entry = profile.values[key];
    if (!entry) continue;
    out[name] = {
      key,
      value: entry.value,
      setBy: entry.setBy,
      secret: entry.secret,
    };
  }
  return out;
}

/**
 * Seed param values from the profile (and `VIBESTRATE_PARAM_*` env) into the
 * caller's explicit values, WITHOUT overwriting anything the caller supplied.
 * The resulting precedence, once `resolveFlowParams` applies the flow default to
 * still-absent keys, is:
 *
 *   explicit (`--param` / `body.params`)  >  env `VIBESTRATE_PARAM_*`
 *      >  project profile  >  flow default  >  prompt / fail-fast
 *
 * Pure given `env` (defaults to `process.env`). Two correctness rules from the
 * adversarial review:
 *   - An explicit EMPTY value (`--param x=`) is treated as NOT provided, so the
 *     profile / env / default can still fill it (matches how `resolveFlowParams`
 *     treats an empty raw). Empty == absent throughout.
 *   - A stored SECRET (`env:NAME`) only counts as "provided" when that env var
 *     actually resolves at run time. An unset env var falls through to
 *     missing-required -> fail-fast, never silently starting a run with a
 *     non-functional secret. (The stored value is never the raw secret.)
 */
export function seedParamsFromProfile(
  defs: Record<string, FlowParam> | null | undefined,
  flowId: string,
  provided: Record<string, string>,
  profile: ProjectProfile,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const seeded: Record<string, string> = { ...provided };
  for (const [name, def] of Object.entries(defs ?? {})) {
    // Explicit non-empty value wins; an explicit empty is "not provided".
    const explicit = seeded[name];
    if (explicit !== undefined && explicit !== "") continue;
    const envVal = env[paramEnvVarName(name)];
    if (envVal !== undefined && envVal !== "") {
      seeded[name] = envVal;
      continue;
    }
    const entry = profile.values[profileKeyFor(flowId, name, def.shared)];
    if (!entry) continue;
    if (def.secret) {
      const envName = secretEnvVarName(entry.value);
      if (!envName || env[envName] === undefined || env[envName] === "") continue;
    }
    seeded[name] = entry.value;
  }
  // Drop any explicit-empty we couldn't fill, so resolveFlowParams applies the
  // flow default (an empty raw otherwise shadows the default too) or fails fast.
  for (const name of Object.keys(defs ?? {})) {
    if (seeded[name] === "") delete seeded[name];
  }
  return seeded;
}
