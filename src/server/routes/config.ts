import path from "node:path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../security.js";
import { configExists, loadConfig } from "../../project/config-loader.js";
import { setConfigValue, showConfig } from "../../setup/config-update-service.js";
import { buildConfigView } from "../../setup/config-view.js";
import { configLeafKeys } from "../../project/config-introspection.js";
import { ConfigError } from "../../utils/errors.js";
import { projectConfigPath } from "../../utils/paths.js";
import { buildPersonaCatalog } from "../../orchestrator/personas.js";
import { listSupervisorArchetypes } from "../../orchestrator/supervisor-archetypes.js";
import {
  adoptArchetype,
  setDefaultPersona,
  removePersona,
} from "../../orchestrator/persona-service.js";

export type ConfigRoutesDeps = {
  projectRoot: string;
};

// Supervisor write-surface request bodies (server-owned definitions: the client
// only ever sends an id, never a persona object). All `.strict()` so an unexpected
// field is a 400.
const adoptArchetypeBody = z
  // Name-shaped: defense-in-depth so junk / prototype-name ids are 400 at the
  // door (the Object.hasOwn guard in adoptArchetype is the load-bearing check).
  .object({ archetypeId: z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/) })
  .strict();
const setDefaultPersonaBody = z
  .object({ personaId: z.string().min(1).max(60) })
  .strict();

/** Read a dotted path out of a loaded config object (no schema needed). */
function valueAtPath(root: unknown, dottedPath: string): unknown {
  let cur: unknown = root;
  for (const seg of dottedPath.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Shell/executable-valued config keys. Writing these over HTTP would be the
 * write-half of a config-tamper -> host code-execution chain (a later run spawns
 * whatever `commands.validate` / `editor.command` points at). The project's
 * posture is explicit that "the server never executes a shell command string
 * supplied over HTTP", so these stay CLI-authored (`vibe config set`) and the
 * dashboard renders them read-only. A narrow, security-justified exception -
 * every non-executable knob remains fully UI-editable.
 */
export const EXEC_VALUED_KEYS = new Set<string>([
  "commands.validate",
  "editor.command",
  "editor.args",
]);

/**
 * Is `key` editable through this generic endpoint? Only an EXACT static scalar
 * leaf `fullKey` from the schema qualifies. Deliberately excluded:
 *   - record-container leaves and any path under them (providers / crews / roles
 *     / personas / permissions.profiles): their id-keyed maps are edited on
 *     dedicated validated surfaces, and allowing an arbitrary `providers.<x>.
 *     command` here would open a config-tamper -> RCE write path. The UI links
 *     these out, so it never posts them.
 *   - shell/executable-valued leaves (EXEC_VALUED_KEYS): CLI-authored only.
 * Any other key is rejected before it can reach `setConfigValue` (which
 * auto-creates intermediate maps and would otherwise write junk keys).
 */
function isSettableKey(key: string): boolean {
  if (EXEC_VALUED_KEYS.has(key)) return false;
  for (const leaf of configLeafKeys()) {
    if (leaf.type.startsWith("record<")) continue;
    if (leaf.fullKey === key) return true;
  }
  return false;
}

const setConfigBody = z
  .object({
    // Bounded so a pathological key/value can't bloat project.yml or drive deep
    // `setIn` recursion (mirrors the policies route's caps).
    key: z.string().min(1).max(200),
    value: z.string().max(10_000),
  })
  .strict();

/**
 * Read-only "Config view" endpoint - the dashboard mirror of `vibe config
 * view`. Returns the grouped, readable projection of project.yml (not the raw
 * dump) so the web panel can show what each section controls and where it's
 * editable. Validation issues are surfaced honestly rather than hidden: an
 * invalid config returns `valid: false` + the error and an empty view.
 */
export async function registerConfigRoutes(
  app: FastifyInstance,
  deps: ConfigRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/config/view", async () => {
    const configPath = path.relative(projectRoot, projectConfigPath(projectRoot));
    const empty = { project: { name: "", type: "" }, sections: [] };

    if (!(await configExists(projectRoot))) {
      return {
        configPath,
        valid: false,
        error: "No Vibestrate config found. Run `vibe init` first.",
        view: empty,
      };
    }

    const r = await showConfig(projectRoot);
    if (!r.parsed) {
      return { configPath, valid: false, error: r.error, view: empty };
    }
    return {
      configPath,
      valid: r.error === null,
      error: r.error,
      view: buildConfigView(r.parsed),
    };
  });

  // Schema-derived, editable field list - the source the dashboard's Config
  // editor renders. Every settable leaf key with its type/enum/default/description
  // (straight off the Zod schema, same source `vibe config set` uses) PLUS its
  // CURRENT value read from the loaded config. Record-container leaves
  // (providers/crews/...) are flagged so the UI links out to their dedicated
  // editor instead of raw-editing an id-keyed map.
  app.get("/api/config/fields", async () => {
    const configPath = path.relative(projectRoot, projectConfigPath(projectRoot));
    if (!(await configExists(projectRoot))) {
      throw new HttpError(409, "No Vibestrate config found. Run `vibe init` first.");
    }
    const loaded = await loadConfig(projectRoot);
    const fields = configLeafKeys().map((leaf) => {
      const isRecordContainer = leaf.type.startsWith("record<");
      // Record containers have no single settable value; skip reading one.
      const current = isRecordContainer
        ? undefined
        : valueAtPath(loaded.config, leaf.fullKey);
      return {
        fullKey: leaf.fullKey,
        type: leaf.type,
        enum: leaf.enum ?? null,
        default: leaf.default ?? null,
        description: leaf.description ?? null,
        required: leaf.required,
        isRecordContainer,
        // Shell/executable-valued: read-only here, CLI-authored for safety.
        execGuarded: EXEC_VALUED_KEYS.has(leaf.fullKey),
        current: current === undefined ? (leaf.default ?? null) : current,
      };
    });
    return { configPath, fields };
  });

  // Editable config WRITE - the same setter `vibe config set` / `vibe n` uses.
  // Narrow + schema-guarded:
  //   - the key MUST be a member of the schema-derived allowlist (a leaf fullKey,
  //     or a dotted path under a record-container leaf). An arbitrary key is a
  //     400, never passed through to the auto-creating YAML setter.
  //   - setConfigValue coerces + Zod-validates the value against the schema and
  //     writes project.yml (path-guarded to projectConfigPath). A rejected value
  //     surfaces as a 400 with the ConfigError message - not swallowed.
  app.post("/api/config/set", async (req) => {
    const parsed = setConfigBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      );
    }
    const { key, value } = parsed.data;
    if (!isSettableKey(key)) {
      throw new HttpError(
        400,
        `"${key}" is not a settable config key. Only schema-defined keys can be edited here.`,
      );
    }
    try {
      await setConfigValue(projectRoot, key, value);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new HttpError(400, err.message);
      }
      throw err;
    }
    // Re-read so the UI confirms the persisted value (the coerced/normalized form).
    const loaded = await loadConfig(projectRoot);
    return { value: valueAtPath(loaded.config, key) ?? null };
  });

  // Supervisor personas (orchestrator-personas.md): the resolved catalog
  // (built-ins + project) + the active default, for the run composer's selector
  // and any read-only persona surface. Read-only.
  app.get("/api/personas", async () => {
    const loaded = await loadConfig(projectRoot).catch(() => null);
    return buildPersonaCatalog(loaded?.config ?? null);
  });

  // ── Supervisor archetype gallery + write-surface ──────────────────────────
  // The read-only Supervisors page becomes an authoring surface. All writes go
  // through the shared persona-service (the same functions `vibe supervisor`
  // uses), which route through the schema-validated config layer. The client
  // only ever sends an id - the persona definitions are server-owned
  // (SUPERVISOR_ARCHETYPES), never accepted as a raw object over HTTP.

  // The curated archetype catalog, each flagged `adopted` against the project's
  // current personas. Read-only.
  app.get("/api/supervisors/archetypes", async () => {
    const loaded = await loadConfig(projectRoot).catch(() => null);
    const ids = new Set(Object.keys(loaded?.config.personas ?? {}));
    return { archetypes: listSupervisorArchetypes(ids) };
  });

  // Adopt an archetype by id -> writes personas.<id> with the SERVER-OWNED
  // definition. Unknown id -> 400 (ConfigError). No persona object is accepted.
  app.post("/api/supervisors/adopt", async (req) => {
    const parsed = adoptArchetypeBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      );
    }
    try {
      return await adoptArchetype(projectRoot, parsed.data.archetypeId);
    } catch (err) {
      if (err instanceof ConfigError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  // Set the project's default supervisor. The id must resolve to a built-in or an
  // existing config persona; anything else -> 400.
  app.post("/api/supervisors/default", async (req) => {
    const parsed = setDefaultPersonaBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      );
    }
    try {
      return await setDefaultPersona(projectRoot, parsed.data.personaId);
    } catch (err) {
      if (err instanceof ConfigError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  // Remove a project (non-built-in, non-active-default) persona. Built-in /
  // active-default / unknown -> 400.
  app.delete("/api/supervisors/personas/:id", async (req) => {
    const { id } = req.params as { id: string };
    try {
      return await removePersona(projectRoot, id);
    } catch (err) {
      if (err instanceof ConfigError) throw new HttpError(400, err.message);
      throw err;
    }
  });
}
