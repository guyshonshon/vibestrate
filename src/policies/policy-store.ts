import path from "node:path";
import YAML from "yaml";
import { pathExists, readDirSafe, readText } from "../utils/fs.js";
import { isPathInside, policiesDir } from "../utils/paths.js";
import {
  policyRuleFileSchema,
  type ActionPolicy,
  type MalformedPolicyFile,
  type PolicyRule,
  type PolicyStoreSnapshot,
} from "./policy-types.js";

/**
 * Disk-backed read of .vibestrate/policies/*.yml. Pure projection — no caching,
 * no watchers; callers (CLI / server / engine) re-read whenever they want
 * a fresh view.
 *
 * Hard rules:
 *   - Only files directly under .vibestrate/policies/ are read. No recursion,
 *     no symlink-following past the directory boundary.
 *   - Only .yml / .yaml extensions are loaded. Other files are ignored
 *     silently (a README.md sitting next to rule files is fine).
 *   - A malformed file (parse error, schema rejection) is recorded under
 *     `malformedFiles` and skipped — never crashes the loader.
 *   - Duplicate rule ids across files are recorded under `duplicateIds`
 *     and only the *first* occurrence's rule is kept. Doctor surfaces
 *     duplicates so the user resolves them.
 *   - No code is executed. The YAML parser is the only interpreter that
 *     ever touches the file contents.
 */
export async function loadPolicySnapshot(
  projectRoot: string,
): Promise<PolicyStoreSnapshot> {
  const dir = policiesDir(projectRoot);
  if (!(await pathExists(dir))) {
    return {
      rules: [],
      actions: [],
      ruleFiles: [],
      malformedFiles: [],
      duplicateIds: [],
    };
  }
  const entries = await readDirSafe(dir);
  const rules: PolicyRule[] = [];
  const actions: ActionPolicy[] = [];
  const ruleFiles: { file: string; ruleIds: string[]; actionIds: string[] }[] =
    [];
  const malformedFiles: MalformedPolicyFile[] = [];
  const seenIds = new Map<string, string>(); // id → first file that defined it
  const duplicateIds = new Set<string>();

  // Lexicographic order so loads are reproducible and "first occurrence
  // wins" is deterministic.
  entries.sort();

  for (const name of entries) {
    if (!/\.ya?ml$/i.test(name)) continue;
    const file = path.join(dir, name);
    // Defensive: even though readDirSafe only returns direct children, the
    // resolved file must still live inside the policies dir. A symlink
    // that escapes would be caught here.
    if (!isPathInside(dir, file)) {
      malformedFiles.push({ file, reason: "Escapes the policies directory." });
      continue;
    }
    let text: string;
    try {
      text = await readText(file);
    } catch (err) {
      malformedFiles.push({
        file,
        reason: `Could not read: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    if (!text.trim()) {
      // Empty file — record as a file with zero rules. Not malformed.
      ruleFiles.push({ file, ruleIds: [], actionIds: [] });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = YAML.parse(text);
    } catch (err) {
      malformedFiles.push({
        file,
        reason: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    const result = policyRuleFileSchema.safeParse(parsed);
    if (!result.success) {
      malformedFiles.push({
        file,
        reason: `Schema rejection: ${result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      });
      continue;
    }
    const fileIds: string[] = [];
    for (const rule of result.data.rules) {
      // Validate the regex actually compiles. We do this here (not in the
      // Zod schema) because the schema's job is shape; *runtime
      // compilability* is a separate concern surfaced as a file-level
      // malformation.
      if (rule.matchAddedContent) {
        try {
          new RegExp(rule.matchAddedContent.regex, rule.matchAddedContent.flags);
        } catch (err) {
          malformedFiles.push({
            file,
            reason: `Rule "${rule.id}" has uncompilable regex: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
      }
      if (rule.matchTouchedFiles) {
        try {
          globToRegex(rule.matchTouchedFiles.glob);
        } catch (err) {
          malformedFiles.push({
            file,
            reason: `Rule "${rule.id}" has malformed glob: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
      }
      const prev = seenIds.get(rule.id);
      if (prev) {
        duplicateIds.add(rule.id);
        // First occurrence wins; skip this duplicate.
        fileIds.push(rule.id);
        continue;
      }
      seenIds.set(rule.id, file);
      rules.push(rule);
      fileIds.push(rule.id);
    }

    // S2 — action policies share the rule id space (one namespace per project).
    const actionIds: string[] = [];
    for (const action of result.data.actions) {
      if (action.match?.commandRegex) {
        try {
          new RegExp(action.match.commandRegex, action.match.commandFlags);
        } catch (err) {
          malformedFiles.push({
            file,
            reason: `Action "${action.id}" has uncompilable commandRegex: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
      }
      if (action.match?.pathGlob) {
        try {
          globToRegex(action.match.pathGlob);
        } catch (err) {
          malformedFiles.push({
            file,
            reason: `Action "${action.id}" has malformed pathGlob: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
      }
      const prev = seenIds.get(action.id);
      if (prev) {
        duplicateIds.add(action.id);
        actionIds.push(action.id);
        continue;
      }
      seenIds.set(action.id, file);
      actions.push(action);
      actionIds.push(action.id);
    }

    ruleFiles.push({ file, ruleIds: fileIds, actionIds });
  }

  return {
    rules,
    actions,
    ruleFiles,
    malformedFiles,
    duplicateIds: [...duplicateIds].sort(),
  };
}

/**
 * Translate a glob into a regex. Supported: `**` (any incl. /), `*` (any
 * except /), `?` (one char except /). Everything else is literal.
 *
 * Exported so the engine and the load-time validator share the same
 * implementation.
 */
export function globToRegex(glob: string): RegExp {
  let out = "^";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i += 2;
        continue;
      }
      out += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }
    if (/[.+^${}()|[\]\\]/.test(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
    i += 1;
  }
  out += "$";
  return new RegExp(out);
}
