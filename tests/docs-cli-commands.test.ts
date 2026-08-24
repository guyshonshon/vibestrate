import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every `vibe …` in the handwritten docs has to be a command the CLI actually
 * has - the full path, not just the first word.
 *
 * The marketing repo's `check:cli` already guards against invented commands,
 * but only against the TOP level (`data.commands.map(c => c.name)`), and it
 * scans the marketing repo's own copy rather than these pages. So
 * `vibe crew set-profile` passed it twice: `crew` is real, and the invented
 * subcommand was never looked at. Two independent readers caught that by hand
 * on the same day, which is the signal that it wants a check rather than
 * another pair of eyes.
 *
 * This walks the generated command tree, so a subcommand, a flag or an argument
 * count that does not exist fails here instead of in someone's terminal.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(repoRoot, "docs", "content");

type Cmd = {
  name: string;
  arguments?: { name: string; required: boolean; variadic: boolean }[];
  options?: { flags: string }[];
  subcommands?: Cmd[];
};

const cli = JSON.parse(
  readFileSync(join(repoRoot, "docs", "generated", "cli-commands.json"), "utf8"),
) as { commands: Cmd[] };

/** Flags every command accepts, so a global is never reported as invented. */
const GLOBAL_FLAGS = new Set(["--help", "-h", "--version", "-V", "--json", "--yes", "-y"]);

function flagNames(cmd: Cmd): Set<string> {
  const out = new Set(GLOBAL_FLAGS);
  for (const opt of cmd.options ?? []) {
    // "-p, --port <n>" -> "-p", "--port"; "--no-select" stays whole.
    for (const piece of opt.flags.split(/[,\s]+/)) {
      if (piece.startsWith("-")) out.add(piece);
    }
  }
  return out;
}

/** Walk as deep into the subcommand tree as the tokens allow. */
function resolveCommand(tokens: string[]): { cmd: Cmd | null; depth: number } {
  let level = cli.commands;
  let cmd: Cmd | null = null;
  let depth = 0;
  for (const token of tokens) {
    const next = level.find((c) => c.name === token);
    if (!next) break;
    cmd = next;
    depth += 1;
    level = next.subcommands ?? [];
  }
  return { cmd, depth };
}

function pages(dir = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(contentDir, dir))) {
    const rel = dir ? `${dir}/${entry}` : entry;
    if (statSync(join(contentDir, rel)).isDirectory()) out.push(...pages(rel));
    else if (entry.endsWith(".md")) out.push(rel);
  }
  return out;
}

/**
 * A command whose absence the docs deliberately teach. `vibe merge` and
 * `vibe diff` are the two everyone reaches for and neither has ever existed,
 * so both guides say so by name. Naming a command in order to say it is not
 * real is the one legitimate reason to write one that does not resolve.
 */
const DOCUMENTED_AS_ABSENT = new Set(["merge", "diff"]);

/** A plausible command word. Kills prose that happens to follow the binary
 *  name inside a fence ("the vibe command-line program", "vibe (no args)"). */
const COMMAND_WORD = /^[a-z][a-z0-9-]*$/;
const PLACEHOLDER = /^(…|\.\.\.|ARG|<.*>)$/;

/**
 * Every `vibe …` invocation in a page, as a token list.
 *
 * Only shell-tagged fences and inline code: a `text` fence is terminal output
 * and a `yaml` one is config, and both mention the binary in ways that are not
 * invocations. Quoted spans collapse to a placeholder so a task description is
 * never read as a subcommand, and `a/b` shorthand expands to both branches so
 * `vibe integrate preview/apply` is checked rather than skipped.
 */
function invocations(markdown: string): { tokens: string[]; raw: string }[] {
  const found: { tokens: string[]; raw: string }[] = [];
  const spans: string[] = [];

  for (const fence of markdown.matchAll(/```(bash|sh|shell|console)\n([\s\S]*?)```/g)) {
    for (const line of (fence[2] ?? "").split("\n")) spans.push(line);
  }
  for (const inline of markdown.matchAll(/`([^`\n]+)`/g)) spans.push(inline[1] ?? "");

  for (const span of spans) {
    if (span.includes("command not found")) continue;
    const line = span.split("#")[0] ?? "";
    const cleaned = line
      .replace(/"[^"]*"/g, "ARG")
      .replace(/'[^']*'/g, "ARG")
      .replace(/<[^>]*>/g, "ARG");
    for (const m of cleaned.matchAll(/\bvibe\b([^|;&]*)/g)) {
      const rawTokens = (m[1] ?? "").trim().split(/\s+/).filter(Boolean);
      if (rawTokens.length === 0) continue; // a bare `vibe` opens the shell
      // Expand one level of `a/b` shorthand into separate invocations.
      const slash = rawTokens.findIndex((t) => !t.startsWith("-") && t.includes("/"));
      const variants =
        slash === -1
          ? [rawTokens]
          : rawTokens[slash]!.split("/").map((alt) => [
              ...rawTokens.slice(0, slash),
              alt,
              ...rawTokens.slice(slash + 1),
            ]);
      for (const tokens of variants) found.push({ tokens, raw: line.trim() });
    }
  }
  return found;
}

/**
 * The dashboard teaches commands too. `src/ui/lib/cli-hints.ts` maps every
 * route to its CLI equivalents and renders them in the hint card, and nothing
 * checked them: it shipped `vibe status <runId>` (status takes no argument), a
 * bare `vibe approvals list` (the run id is required), and a whole Proposals
 * entry pointing at `vibe approvals` for a page that renders roadmap
 * proposals. A hint that does not run is worse than no hint - the reader has
 * no reason to doubt it.
 */
function hintCommands(): { cmd: string; tokens: string[] }[] {
  const src = readFileSync(join(repoRoot, "src", "ui", "lib", "cli-hints.ts"), "utf8");
  const out: { cmd: string; tokens: string[] }[] = [];
  for (const m of src.matchAll(/\{\s*cmd:\s*(["'`])([\s\S]*?)\1\s*[,}]/g)) {
    const raw = (m[2] ?? "").trim();
    if (!raw.startsWith("vibe")) continue;
    // `${route.runId}` and `<runId>` are both "an argument goes here".
    const cleaned = raw
      .replace(/\$\{[^}]*\}/g, "ARG")
      .replace(/"[^"]*"/g, "ARG")
      .replace(/'[^']*'/g, "ARG")
      .replace(/<[^>]*>/g, "ARG");
    const rawTokens = cleaned.split(/\s+/).slice(1).filter(Boolean);
    if (rawTokens.length === 0) continue;
    // `confirm|reject <id>` is a display shorthand this file uses for a pair
    // of sibling subcommands. Check both rather than reading it as one word.
    const alt = rawTokens.findIndex((t) => t.includes("|"));
    const variants =
      alt === -1
        ? [rawTokens]
        : rawTokens[alt]!.split("|").map((one) => [
            ...rawTokens.slice(0, alt),
            one,
            ...rawTokens.slice(alt + 1),
          ]);
    for (const tokens of variants) out.push({ cmd: raw, tokens });
  }
  return out;
}

describe("the dashboard's CLI hints name real commands", () => {
  const hints = hintCommands();

  it("finds the hint map at all", () => {
    // A regex that stops matching would turn this whole file green by finding
    // nothing, which is the failure mode a count guards against.
    expect(hints.length).toBeGreaterThan(60);
  });

  it("resolves every hinted command, and passes the arguments it requires", () => {
    const bad: string[] = [];
    for (const { cmd, tokens } of hints) {
      const first = tokens[0] ?? "";
      if (!COMMAND_WORD.test(first)) continue;
      const { cmd: resolved, depth } = resolveCommand(tokens);
      if (!resolved) {
        bad.push(`\`${cmd}\` is not a command`);
        continue;
      }
      const rest = tokens.slice(depth).filter((t) => !t.startsWith("-"));
      const required = (resolved.arguments ?? []).filter((a) => a.required);
      if (rest.length > required.length && (resolved.subcommands ?? []).length > 0) {
        bad.push(`\`${cmd}\` passes ${rest.length} argument(s) to a command that takes ${required.length}`);
      }
      if (rest.length < required.length) {
        bad.push(`\`${cmd}\` omits the required <${required[rest.length]!.name}>`);
      }
      const allowed = flagNames(resolved);
      for (const token of tokens.slice(depth)) {
        if (token.startsWith("--") && !allowed.has(token.split("=")[0] ?? token)) {
          bad.push(`\`${cmd}\`: ${resolved.name} has no ${token}`);
        }
      }
    }
    expect(bad.join("\n"), "commands the dashboard teaches that the CLI rejects").toBe("");
  });
});

describe("docs name commands the CLI actually has", () => {
  const slugs = pages();

  it("resolves every `vibe <command>` to a real command path", () => {
    const bad: string[] = [];
    for (const slug of slugs) {
      const text = readFileSync(join(contentDir, slug), "utf8");
      for (const { tokens, raw } of invocations(text)) {
        const first = tokens[0] ?? "";
        if (!COMMAND_WORD.test(first)) continue;
        if (DOCUMENTED_AS_ABSENT.has(first)) continue;
        const { cmd, depth } = resolveCommand(tokens);
        if (!cmd) {
          bad.push(`${slug}: \`vibe ${first}\` is not a command  (${raw})`);
          continue;
        }
        // A word that looks like a subcommand but is not: the walk stopped
        // early and the next token is neither a flag nor an argument value.
        const next = tokens[depth];
        const takesArgs = (cmd.arguments ?? []).length > 0;
        if (
          next &&
          COMMAND_WORD.test(next) &&
          !PLACEHOLDER.test(next) &&
          !takesArgs &&
          (cmd.subcommands ?? []).length > 0
        ) {
          bad.push(`${slug}: \`vibe ${tokens.slice(0, depth + 1).join(" ")}\` is not a subcommand  (${raw})`);
        }
      }
    }
    expect(bad.join("\n"), "commands in docs/content that the CLI does not have").toBe("");
  });

  it("only uses flags the command declares", () => {
    const bad: string[] = [];
    for (const slug of slugs) {
      const text = readFileSync(join(contentDir, slug), "utf8");
      for (const { tokens, raw } of invocations(text)) {
        const { cmd, depth } = resolveCommand(tokens);
        if (!cmd) continue;
        const allowed = flagNames(cmd);
        for (const token of tokens.slice(depth)) {
          if (!token.startsWith("--")) continue;
          // `--context-file/--context-url` is prose shorthand for two flags.
          for (const flag of token.split("=")[0]!.split("/")) {
            if (!flag.startsWith("--") || allowed.has(flag)) continue;
            bad.push(`${slug}: \`vibe ${tokens.slice(0, depth).join(" ")}\` has no ${flag}  (${raw})`);
          }
        }
      }
    }
    expect(bad.join("\n"), "flags in docs/content the command does not declare").toBe("");
  });
});
