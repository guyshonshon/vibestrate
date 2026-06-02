// Pure command-completion engine for the shell prompt. Given the CLI command
// tree (walked from the commander program), a set of live value sources
// (profiles, crews, flows, runs, tasks, providers from the open project), and
// the text the user has typed after "vibe ", it returns the candidate
// completions for the token at the cursor:
//   - a word completes subcommands (and id-typed positional args),
//   - a dash completes flags,
//   - after a value-taking flag (or a flag=) it completes that flag's values.
// Kept free of React / ink / node so it runs under the node-only Vitest
// environment and can be unit-tested directly. Prefix-matched, never fuzzy, so
// completions are predictable.

import type { Command, Option } from "commander";

/** Semantic value categories we can complete. Static enums are resolved from
 *  STATIC_VALUES; the rest come from the live CompletionContext. */
export type ValueKind =
  | "effort"
  | "priority"
  | "flow-context"
  | "checklist"
  | "profile"
  | "crew"
  | "flow"
  | "run"
  | "task"
  | "provider";

const STATIC_VALUES: Partial<Record<ValueKind, string[]>> = {
  effort: ["low", "medium", "high"],
  priority: ["low", "medium", "high"],
  "flow-context": ["balanced", "compact", "artifact-heavy"],
  checklist: ["continuous", "step"],
};

/** Live id lists from the open project, keyed by value kind. */
export type CompletionContext = Partial<Record<ValueKind, string[]>>;

export type CompletionFlag = {
  value: string;
  description?: string;
  /** True when the flag takes an argument (so the next token is its value). */
  takesValue: boolean;
  /** What kind of value it takes, when known (drives value completion). */
  valueKind?: ValueKind;
};

export type CommandArg = {
  name: string;
};

export type CommandNode = {
  name: string;
  description?: string;
  subcommands: CommandNode[];
  flags: CompletionFlag[];
  arguments: CommandArg[];
};

export type CompletionItem = {
  value: string;
  kind: "command" | "flag" | "value";
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
  arguments: [],
};

// ── value-kind inference ────────────────────────────────────────────────────

/** Strict: only id-shaped names map to a kind. Used for positional args (so a
 *  free-text arg like run's `[task...]` is never completed) and for flag value
 *  placeholders (e.g. `--resume-from <runId>`). */
function inferIdKind(name: string): ValueKind | undefined {
  const n = name.toLowerCase();
  if (n === "runid") return "run";
  if (n === "taskid") return "task";
  if (n === "flowid") return "flow";
  if (n === "providerid") return "provider";
  if (n === "crewid") return "crew";
  if (n.endsWith("profile") || n === "profilename") return "profile";
  return undefined;
}

/** Looser: a flag's value kind, from its `<placeholder>` (strong) then its long
 *  name (for enums + generic `<id>` flags like --crew / --flow / --profile). */
function inferFlagKind(name: string, placeholder: string): ValueKind | undefined {
  const fromPlaceholder = inferIdKind(placeholder);
  if (fromPlaceholder) return fromPlaceholder;
  const n = name.toLowerCase();
  if (n === "effort") return "effort";
  if (n === "priority") return "priority";
  if (n === "flow-context") return "flow-context";
  if (n === "checklist") return "checklist";
  if (n === "crew") return "crew";
  if (n === "flow") return "flow";
  if (n === "task") return "task";
  if (n === "profile" || n === "fallback-profile") return "profile";
  return undefined;
}

/** Map a generic `<id>` / `<newId>` positional to a kind from the command path
 *  (e.g. `tasks show <id>` -> task, `flows show <id>` -> flow). */
function domainKind(path: string[]): ValueKind | undefined {
  if (path.includes("tasks")) return "task";
  if (path.includes("flows")) return "flow";
  if (path.includes("profiles")) return "profile";
  if (path.includes("provider")) return "provider";
  if (path.includes("crews") || path.includes("crew")) return "crew";
  return undefined;
}

/** A positional arg's value kind: explicit id-typed names win; a bare `id` /
 *  `newId` falls back to the command's domain; everything else (title, body,
 *  text, goal, path, ...) is free text and gets no completion. */
function positionalKind(argName: string, path: string[]): ValueKind | undefined {
  const explicit = inferIdKind(argName);
  if (explicit) return explicit;
  const n = argName.toLowerCase();
  if (n === "id" || n === "newid") return domainKind(path);
  return undefined;
}

function flagPlaceholder(flags: string): string {
  const m = flags.match(/[<[]([^>\]]+)[>\]]/);
  return m ? m[1]! : "";
}

function longestFlag(option: Option): string {
  return option.long ?? option.short ?? option.flags;
}

// ── spec construction ───────────────────────────────────────────────────────

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
    flags: program.options.map((o) => {
      const takesValue = o.required === true || o.optional === true;
      return {
        value: longestFlag(o),
        description: o.description || undefined,
        takesValue,
        valueKind: takesValue
          ? inferFlagKind(o.long?.replace(/^--/, "") ?? "", flagPlaceholder(o.flags))
          : undefined,
      };
    }),
    arguments: program.registeredArguments.map((a) => ({ name: a.name() })),
  };
  if (!node.flags.some((f) => f.value === "--help")) {
    node.flags.push({
      value: "--help",
      description: "show help for this command",
      takesValue: false,
    });
  }
  return node;
}

// ── completion ──────────────────────────────────────────────────────────────

function tokenize(input: string): string[] {
  return input.split(/\s+/).filter((t) => t.length > 0);
}

function valuesForKind(kind: ValueKind, context: CompletionContext): string[] {
  return STATIC_VALUES[kind] ?? context[kind] ?? [];
}

function valuesForFlag(flag: CompletionFlag, context: CompletionContext): string[] {
  return flag.valueKind ? valuesForKind(flag.valueKind, context) : [];
}

type Resolved = {
  node: CommandNode;
  /** Command names descended from root (excludes "vibe"), e.g. ["tasks","show"]. */
  path: string[];
  /** Positional (non-flag, non-flag-value) tokens consumed at `node`. */
  positionals: number;
  /** Set when the last completed token was a value-taking flag awaiting a value. */
  pendingFlag: CompletionFlag | null;
};

function resolve(spec: CommandNode, completed: string[]): Resolved {
  let node = spec;
  const path: string[] = [];
  let positionals = 0;
  let pendingFlag: CompletionFlag | null = null;
  for (const tok of completed) {
    if (pendingFlag) {
      // This token is the awaited flag value; consume it.
      pendingFlag = null;
      continue;
    }
    if (tok.startsWith("-")) {
      if (tok.includes("=")) continue; // self-contained --flag=value
      const fl = node.flags.find((f) => f.value === tok);
      if (fl && fl.takesValue) pendingFlag = fl;
      continue;
    }
    const sub =
      positionals === 0 ? node.subcommands.find((s) => s.name === tok) : undefined;
    if (sub) {
      node = sub;
      path.push(sub.name);
      positionals = 0;
    } else {
      positionals += 1;
    }
  }
  return { node, path, positionals, pendingFlag };
}

/**
 * Compute the completions for the token at the end of `input`, resolved against
 * `spec` with live ids from `context`. `input` is everything after "vibe ".
 */
export function completeInput(
  input: string,
  spec: CommandNode,
  context: CompletionContext = {},
): CompletionResult {
  const endsWithSpace = /\s$/.test(input);
  const parts = tokenize(input);
  const active = endsWithSpace ? "" : parts[parts.length - 1] ?? "";
  const completed = endsWithSpace ? parts : parts.slice(0, -1);

  const { node, path, positionals, pendingFlag } = resolve(spec, completed);

  // 1. The value for a just-typed value-taking flag (space form): `--effort hi`.
  if (pendingFlag && !active.startsWith("-")) {
    const items = valuesForFlag(pendingFlag, context)
      .filter((v) => v.startsWith(active))
      .map((v) => ({ value: v, kind: "value" as const }));
    return { items, query: active };
  }

  // 2. A flag token, possibly with an inline `=value`.
  if (active.startsWith("-")) {
    const eq = active.indexOf("=");
    if (eq >= 0) {
      const flagPart = active.slice(0, eq);
      const valPart = active.slice(eq + 1);
      const fl = node.flags.find((f) => f.value === flagPart);
      if (fl && fl.takesValue) {
        const items = valuesForFlag(fl, context)
          .filter((v) => v.startsWith(valPart))
          .map((v) => ({ value: `${flagPart}=${v}`, kind: "value" as const }));
        return { items, query: active };
      }
      return { items: [], query: active };
    }
    const items = node.flags
      .filter((f) => f.value.startsWith(active))
      .map((f) => ({ value: f.value, kind: "flag" as const, description: f.description }));
    return { items, query: active };
  }

  // 3. A word: subcommands plus any id-typed positional at this position.
  const subs = node.subcommands
    .filter((s) => s.name.startsWith(active))
    .map((s) => ({
      value: s.name,
      kind: "command" as const,
      description: s.description,
    }));
  const arg = node.arguments[positionals];
  const argKind = arg ? positionalKind(arg.name, path) : undefined;
  const posItems: CompletionItem[] = argKind
    ? valuesForKind(argKind, context)
        .filter((v) => v.startsWith(active))
        .map((v) => ({ value: v, kind: "value" as const }))
    : [];
  return { items: [...subs, ...posItems], query: active };
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
