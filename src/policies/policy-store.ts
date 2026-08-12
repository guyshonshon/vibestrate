import path from "node:path";
import fs from "node:fs/promises";
import YAML from "yaml";
import { readText } from "../utils/fs.js";
import { isPathInside, policiesDir } from "../utils/paths.js";
import {
  policyRuleFileSchema,
  type ActionPolicy,
  type MalformedPolicyFile,
  type PolicyRule,
  type PolicyStoreSnapshot,
} from "./policy-types.js";

/**
 * Disk-backed read of .vibestrate/policies/*.yml. Pure projection - no caching,
 * no watchers; callers (CLI / server / engine) re-read whenever they want
 * a fresh view.
 *
 * Hard rules:
 *   - Only files directly under .vibestrate/policies/ are read. No recursion,
 *     no symlink-following past the directory boundary.
 *   - Only .yml / .yaml extensions are loaded. Other files are ignored
 *     silently (a README.md sitting next to rule files is fine).
 *   - A malformed file (parse error, schema rejection) is recorded under
 *     `malformedFiles` and skipped - never crashes the loader.
 *   - Duplicate rule ids across files are recorded under `duplicateIds`
 *     and only the *first* occurrence's rule is kept. Doctor surfaces
 *     duplicates so the user resolves them.
 *   - No code is executed. The YAML parser is the only interpreter that
 *     ever touches the file contents.
 */
/**
 * Describe a policy set that did not fully load, or null when it is clean.
 *
 * This is a SILENT loss of protection, which is why it gets its own concept: a
 * malformed file contributes no rules, and a duplicate id keeps only the first
 * definition - so the stricter rule someone just added can vanish while
 * `vibe policies list` still looks populated. Nothing downstream can notice,
 * because the broker only ever sees the rules that DID load; a rule that never
 * loaded leaves no trace in the action log or the assurance verdict.
 *
 * One function, several callers that must not drift: the run preflight, the
 * provider funnel, and the broker's evaluator loader.
 *
 * Two shapes, because they land in very different places. `long` is the
 * indented listing a CLI refusal can afford. `short` is one line, for a broker
 * `reason` - those get wrapped by nine different call-site prefixes
 * ("blocked by policy (deny): ..."), which is the exact shape a rule the USER
 * wrote produces. Without naming the condition and the fix in that one line,
 * someone would go hunting for a deny rule they never authored.
 */
export function describeBrokenPolicySet(
  snapshot: Pick<PolicyStoreSnapshot, "malformedFiles" | "duplicateIds">,
): { short: string; long: string } | null {
  const { malformedFiles, duplicateIds } = snapshot;
  if (malformedFiles.length === 0 && duplicateIds.length === 0) return null;

  const problems = malformedFiles.map(
    (m) => `  ${path.basename(m.file)}: ${m.reason}`,
  );
  if (duplicateIds.length > 0) {
    problems.push(
      `  duplicate id(s) defined more than once (only the first is loaded): ${duplicateIds.join(", ")}`,
    );
  }
  const counts: string[] = [];
  if (malformedFiles.length > 0) {
    counts.push(
      `${malformedFiles.length} unreadable file(s): ${malformedFiles.map((m) => path.basename(m.file)).join(", ")}`,
    );
  }
  if (duplicateIds.length > 0) {
    counts.push(`duplicate id(s): ${duplicateIds.join(", ")}`);
  }
  return {
    short:
      `this project's policy set in .vibestrate/policies/ did not fully load ` +
      `(${counts.join("; ")}), so rules you believe are active may not be. ` +
      "This is a configuration problem, not a rule you wrote - run `vibe policies doctor`.",
    long:
      `The policy set in .vibestrate/policies/ did not fully load, so rules you think are active may not be.\n` +
      `${problems.join("\n")}\n` +
      "Fix them (details: `vibe policies doctor`), then try again.",
  };
}

export async function loadPolicySnapshot(
  projectRoot: string,
): Promise<PolicyStoreSnapshot> {
  const dir = policiesDir(projectRoot);
  const empty: PolicyStoreSnapshot = {
    rules: [],
    actions: [],
    ruleFiles: [],
    malformedFiles: [],
    duplicateIds: [],
  };
  // Read the directory FIRST and distinguish "not there" from "cannot read it".
  // This used to be pathExists + readDirSafe, which both fail open: `access`
  // with F_OK succeeds on a `chmod 000` directory, and readDirSafe swallows the
  // EACCES and returns []. The result was byte-identical to "no policies
  // configured" - every rule silently evaporated, which is precisely the
  // failure this whole gate exists to prevent, and likelier than malformed YAML
  // under a container or CI mount. A per-FILE read error was already recorded
  // as malformed; the directory just wasn't.
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return empty; // genuinely no policies - the normal case
    return {
      ...empty,
      malformedFiles: [
        {
          file: dir,
          reason: `Could not read the policies directory: ${err instanceof Error ? err.message : String(err)}. No policy is being enforced until this is readable.`,
        },
      ],
    };
  }
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
      // Empty file - record as a file with zero rules. Not malformed.
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

    // Action policies share the rule id space (one namespace per project).
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
        // `**/` matches any number of leading path segments INCLUDING zero, so
        // `**/*.pem` also matches a repo-root `c.pem` (gitignore/minimatch
        // semantics). Without this, root-level secrets escape `**/*.key`-style
        // rules - a real policy bypass.
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 3;
          continue;
        }
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
