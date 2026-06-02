// Pure command-completion engine for the shell prompt. Given the CLI command
// tree (walked from the commander program) and the text the user has typed
// after "vibe ", it returns the candidate completions for the token at the
// cursor - subcommands when typing a word, flags when typing a dash. Kept free
// of React / ink / node so it runs under the node-only Vitest environment and
// can be unit-tested directly.
//
// Convention (deliberately predictable, not fuzzy): the active token is
// prefix-matched. An empty / word token completes *subcommands*; a token that
// starts with "-" completes *flags*. So flags only surface once you type a
// dash - the list never dumps every flag while you're typing a task.

import type { Command, Option } from "commander";

export type CompletionFlag = { value: string; description?: string };

export type CommandNode = {
  name: string;
  description?: string;
  subcommands: CommandNode[];
  flags: CompletionFlag[];
};

export type CompletionItem = {
  value: string;
  kind: "command" | "flag";
  description?: string;
};

export type CompletionResult = {
  items: CompletionItem[];
  /** The partial token being completed (what an accept replaces). */
  query: string;
};

/** The empty root used when no real spec is available (e.g. tests). */
export const EMPTY_SPEC: CommandNode = {
  name: "vibe",
  subcommands: [],
  flags: [],
};

function longestFlag(option: Option): string {
  // Prefer the --long form; fall back to the short flag, then the raw spec.
  return option.long ?? option.short ?? option.flags;
}

/**
 * Walk a commander Command into a serializable completion tree. Side-effect
 * free; safe to call once at shell launch.
 */
export function specFromProgram(program: Command): CommandNode {
  const node: CommandNode = {
    name: program.name(),
    description: program.description() || undefined,
    subcommands: program.commands
      // Skip commander's implicit `help` command - completing it is just noise.
      .filter((c) => c.name() !== "help")
      .map((c) => specFromProgram(c)),
    flags: program.options.map((o) => ({
      value: longestFlag(o),
      description: o.description || undefined,
    })),
  };
  // Every command supports --help; surface it if the program didn't list it.
  if (!node.flags.some((f) => f.value === "--help")) {
    node.flags.push({ value: "--help", description: "show help for this command" });
  }
  return node;
}

/** Split user input into argv-ish tokens, ignoring quoting (we only complete
 *  commands/flags, never quoted values). */
function tokenize(input: string): string[] {
  return input.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Compute the completions for the token at the end of `input`, resolved
 * against `spec`. `input` is everything the user typed after "vibe ".
 */
export function completeInput(input: string, spec: CommandNode): CompletionResult {
  const endsWithSpace = /\s$/.test(input);
  const parts = tokenize(input);
  const active = endsWithSpace ? "" : parts[parts.length - 1] ?? "";
  const completed = endsWithSpace ? parts : parts.slice(0, -1);

  // Descend the tree following completed *subcommand* tokens. Flags and
  // positional values that don't match a subcommand don't change the node
  // (its flags still apply).
  let node = spec;
  for (const tok of completed) {
    if (tok.startsWith("-")) continue;
    const next = node.subcommands.find((s) => s.name === tok);
    if (next) node = next;
  }

  let items: CompletionItem[];
  if (active.startsWith("-")) {
    items = node.flags
      .filter((f) => f.value.startsWith(active))
      .map((f) => ({ value: f.value, kind: "flag", description: f.description }));
  } else {
    items = node.subcommands
      .filter((s) => s.name.startsWith(active))
      .map((s) => ({
        value: s.name,
        kind: "command",
        description: s.description,
      }));
  }
  return { items, query: active };
}

/**
 * Apply a chosen completion: replace the active token (length `query`) at the
 * end of `input` with `value`, leaving a trailing space so the next token can
 * be typed / completed immediately.
 */
export function applyCompletion(
  input: string,
  query: string,
  value: string,
): string {
  const base = query.length > 0 ? input.slice(0, input.length - query.length) : input;
  return `${base}${value} `;
}
