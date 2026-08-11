// ── The project ruleset ─────────────────────────────────────────────────────
//
// Project Instructions, composed from `.vibestrate/rules.md` plus any `*.md`
// files in `.vibestrate/rules/`. The single file stays the simple default; the
// directory is for a ruleset that has outgrown one page.
//
// Composition: rules.md first, then the directory's files sorted by name, each
// under a heading naming its source. Order is deterministic so the same project
// produces the same prompt twice, and the headings mean a rule can be traced to
// the file that carries it - when a run behaves oddly, "which rule did that"
// should be answerable without grepping.
//
// This is the most expensive text in the product. It goes into EVERY role turn
// of every run and into every assist call, so bytes here are paid more often
// than bytes anywhere else. That is why the directory is bounded rather than
// globbed: a folder makes it frictionless to accumulate rules, and nothing about
// a slow, costly run would tell you the ruleset is why.
//
// Safety matches the operating manual (project-manual.ts), which was already
// doing this properly while rules.md was read raw:
//   - path-guarded, so a symlink in `rules/` cannot read outside the project
//   - secret-shaped content redacted, since this text lands in prompts
//   - secret-like filenames refused outright
//   - size-bounded, and truncation is LOUD - a silently shortened ruleset is
//     the kind of failure that takes days to notice
//
// Never throws. A missing, unreadable or refused file degrades to "not part of
// the ruleset"; the run still starts.

import fs from "node:fs/promises";
import path from "node:path";
import { resolveSafePath, buildProjectRoots, PathGuardError } from "../core/path-guard.js";
import { isSecretLikePath, redactSecretsInText } from "../core/diff-service.js";
import { readText } from "../utils/fs.js";
import { projectRulesPath, projectRulesDirPath, RULES_FILENAME } from "../utils/paths.js";

/** Per-file ceiling. Generous for prose, low enough that one pasted log cannot
 *  become a permanent tax on every turn. */
const RULE_FILE_MAX_BYTES = 32 * 1024;

/** Whole-ruleset ceiling, across rules.md and the directory together. */
const RULESET_MAX_BYTES = 96 * 1024;

/** How many files the directory may contribute. A ruleset that needs more than
 *  this is a manual (VIBESTRATE.md) or a policy set, not per-turn guidance. */
const MAX_RULE_FILES = 24;

export type RuleSource = {
  /** Path relative to the project root, e.g. `.vibestrate/rules/testing.md`. */
  relativePath: string;
  bytes: number;
  redactionCount: number;
  /** True when this file alone exceeded the per-file ceiling. */
  truncated: boolean;
};

export type ProjectRuleset = {
  /** The composed text, ready for a prompt. */
  text: string;
  /** What went into it, in composition order. Empty when only the built-in
   *  default applies. */
  sources: RuleSource[];
  /** Files found but left out, with why - surfaced by doctor so a refusal is
   *  never silent. */
  skipped: { relativePath: string; reason: string }[];
  /** True when the composed text hit the whole-ruleset ceiling. */
  truncated: boolean;
};

function clamp(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, truncated: false };
  return { text: `${text.slice(0, maxBytes)}\n\n[...truncated - this ruleset is over its size budget]`, truncated: true };
}

/** Read one rule file safely. Returns null when it should not be part of the
 *  ruleset (absent, unreadable, outside the project, secret-like name). */
async function readRuleFile(
  projectRoot: string,
  relativePath: string,
): Promise<{ body: string; source: RuleSource } | { skipped: string } | null> {
  try {
    const resolved = await resolveSafePath(
      relativePath,
      buildProjectRoots({ projectRoot }),
    );
    if (resolved.isSecretLike || isSecretLikePath(resolved.relativePath)) {
      return { skipped: "the filename looks secret-bearing" };
    }
    const raw = await readText(resolved.absolutePath).catch(() => null);
    if (raw === null) return null;
    const { redacted, count } = redactSecretsInText(raw);
    const { text, truncated } = clamp(redacted, RULE_FILE_MAX_BYTES);
    return {
      body: text,
      source: {
        relativePath,
        bytes: Buffer.byteLength(text, "utf8"),
        redactionCount: count,
        truncated,
      },
    };
  } catch (err) {
    void (err instanceof PathGuardError);
    return { skipped: "refused by the path guard" };
  }
}

/**
 * Compose the project's ruleset.
 *
 * `fallback` is used only when the project contributes nothing at all - it is
 * the built-in default text, and it is returned unheaded because there is no
 * source file to name.
 */
export async function loadProjectRuleset(
  projectRoot: string,
  fallback: string,
): Promise<ProjectRuleset> {
  const parts: string[] = [];
  const sources: RuleSource[] = [];
  const skipped: { relativePath: string; reason: string }[] = [];

  const consider = async (relativePath: string, heading: boolean) => {
    const read = await readRuleFile(projectRoot, relativePath);
    if (read === null) return;
    if ("skipped" in read) {
      skipped.push({ relativePath, reason: read.skipped });
      return;
    }
    if (read.body.trim() === "") return;
    parts.push(heading ? `## ${relativePath}\n\n${read.body.trim()}` : read.body.trim());
    sources.push(read.source);
  };

  await consider(path.posix.join(".vibestrate", RULES_FILENAME), false);

  // The directory is optional and flat: a rule that needs a subdirectory to
  // organize it has stopped being per-turn guidance.
  const dir = projectRulesDirPath(projectRoot);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "en"));
  for (const name of files.slice(0, MAX_RULE_FILES)) {
    await consider(path.posix.join(".vibestrate", "rules", name), true);
  }
  for (const name of files.slice(MAX_RULE_FILES)) {
    skipped.push({
      relativePath: path.posix.join(".vibestrate", "rules", name),
      reason: `over the ${MAX_RULE_FILES}-file ceiling for the rules directory`,
    });
  }

  if (parts.length === 0) {
    return { text: fallback, sources: [], skipped, truncated: false };
  }
  const { text, truncated } = clamp(parts.join("\n\n"), RULESET_MAX_BYTES);
  return { text, sources, skipped, truncated };
}

/** One line per real problem, for `vibe doctor`. Empty when the ruleset is
 *  clean. Truncation and refusals are reported because both change what the
 *  agents actually see, and neither is visible from the run itself. */
export function rulesetWarnings(ruleset: ProjectRuleset): string[] {
  const out: string[] = [];
  if (ruleset.truncated) {
    out.push(
      `The composed ruleset is over ${Math.round(RULESET_MAX_BYTES / 1024)}KB and was truncated - some Project Instructions are NOT reaching the agents. Trim ${ruleset.sources.length} rule file(s), or move durable project context into VIBESTRATE.md.`,
    );
  }
  for (const s of ruleset.sources.filter((s) => s.truncated)) {
    out.push(
      `${s.relativePath} is over ${Math.round(RULE_FILE_MAX_BYTES / 1024)}KB on its own and was truncated.`,
    );
  }
  for (const s of ruleset.skipped) {
    out.push(`${s.relativePath} is not part of the ruleset: ${s.reason}.`);
  }
  const redacted = ruleset.sources.reduce((n, s) => n + s.redactionCount, 0);
  if (redacted > 0) {
    out.push(
      `${redacted} secret-shaped value(s) were redacted out of the ruleset before it reached any prompt. Rules files should not carry credentials.`,
    );
  }
  return out;
}
