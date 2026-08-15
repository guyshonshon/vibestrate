// The pair of paths every role write presents to the policy matcher.
//
// A Crew editor Save is two HTTP requests - the role's config fields and the
// role's instruction file - and the Skills page reaches one of those same
// fields down a third path. The matcher tests a rule's `pathGlob` against
// `subject.path` AND every entry of `subject.files` (`collectPaths`,
// policies/action-policy-engine.ts), so unless all three writers present the
// SAME pair of strings, a rule naming one file refuses one half of a Save and
// lands the other. The half that lands is the dangerous one: a `permissions`
// flip grants the role's provider the repo, and a skill is instruction text
// replayed into every turn the role takes. Worse than not gating at all,
// because the refusal reports that the write was stopped.
//
// One helper, so the three writers cannot drift into spelling the same file two
// ways. Byte equality is the whole property: a `pathGlob` that matches one
// spelling and misses the other reopens the split.

import path from "node:path";
import { projectConfigPath, projectRolesDir } from "../utils/paths.js";
import { loadConfig } from "../project/config-loader.js";
import { buildProjectRoots, resolveSafePath } from "../core/path-guard.js";

export type RoleWritePaths = {
  /** `project.yml`. Where a field or skill patch lands. */
  configPath: string;
  /** The role's instruction file, absolute. */
  roleFilePath: string;
  /** Both of the above, in the order every writer presents them. */
  files: string[];
};

/**
 * Where the config says this role's instruction file lives, or null when it
 * cannot say.
 *
 * Read through `loadConfig`, which parses the YAML to plain values, and NOT
 * through the surgical-edit document. `doc.getIn(["crews", …, "prompt"])`
 * returns an Alias node rather than a string for a role whose prompt is spelled
 * `prompt: *sharedPrompt`, and a merge key hides it the same way - so a
 * document read cannot see a role file that is perfectly legal YAML, while the
 * write itself lands, because it validates `doc.toJS()`, where the alias is
 * resolved. That gap let an aliased role's permission flip through a rule
 * scoped to the roles directory while the same rule refused a plain-string
 * role.
 */
async function configuredRolePrompt(
  projectRoot: string,
  crewId: string,
  roleId: string,
): Promise<string | null> {
  let prompt: string | undefined;
  try {
    const { config } = await loadConfig(projectRoot);
    prompt = config.crews[crewId]?.roles[roleId]?.prompt;
  } catch {
    // An absent, unparseable or schema-invalid config cannot name the file.
    // The caller substitutes the conventional location rather than narrowing.
    return null;
  }
  if (typeof prompt !== "string" || prompt.trim() === "") return null;
  // Handed to the guard exactly as the config spells it, NOT trimmed: the
  // role-prompt route passes the raw value, and a helper that tidied it first
  // would resolve a padded path to a different absolute string than the file
  // the prompt writer actually writes.
  return prompt;
}

/**
 * Resolve a configured `prompt` to the same absolute string the role-prompt
 * route hands its writer, by running it through the same path guard. Imitating
 * the guard's normalization instead would be a second implementation of it, and
 * the two only have to disagree once (a leading slash, a `./`, a backslash) for
 * a `pathGlob` to match one writer's subject and miss the other's.
 *
 * Null when the guard rejects the path, which means the config points outside
 * the project. The caller substitutes the conventional location.
 */
async function guardedAbsolute(
  projectRoot: string,
  spelled: string,
): Promise<string | null> {
  try {
    const resolved = await resolveSafePath(
      spelled,
      buildProjectRoots({ projectRoot }),
    );
    return resolved.absolutePath;
  } catch {
    return null;
  }
}

/**
 * The config path and the role file path one role write spans.
 *
 * The role file is NEVER dropped from the subject. Narrowing to the config
 * alone is the same bypass as the alias above wearing different clothes: a
 * config that is schema-invalid before the patch and valid after it (an empty
 * `seats` list that the same patch refills, alongside a `permissions` flip)
 * writes successfully with the roles directory unnamed, so a rule scoped there
 * never matches. When the
 * config cannot say where the role file is, the conventional location stands
 * in - `<roles dir>/<roleId>.json`, which is what `vibe init` and every crew
 * preset write. Naming a file that may not exist can only add a refusal, never
 * remove one, and `subject.path` still names the file the bytes land in, so the
 * audit trail keeps saying what actually changed.
 */
export async function roleWritePaths(input: {
  projectRoot: string;
  crewId: string;
  roleId: string;
}): Promise<RoleWritePaths> {
  const { projectRoot, crewId, roleId } = input;
  const configPath = projectConfigPath(projectRoot);
  const spelled = await configuredRolePrompt(projectRoot, crewId, roleId);
  const roleFilePath =
    (spelled === null ? null : await guardedAbsolute(projectRoot, spelled)) ??
    path.join(projectRolesDir(projectRoot), `${roleId}.json`);
  return { configPath, roleFilePath, files: [configPath, roleFilePath] };
}
