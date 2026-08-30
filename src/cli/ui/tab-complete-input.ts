import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  isEnterKey,
  makeTheme,
  type Status,
  type Theme,
} from "@inquirer/core";
import { color } from "./format.js";

/**
 * A text input with bash-style TAB completion over a known candidate list.
 * Built on `@inquirer/core` so it shares the same readline/raw-mode/Ctrl-C
 * handling as the other prompts, the same way `horizontal-select.ts` does.
 *
 * Why in-process rather than a shell completion script: this completes values
 * that CONTAIN SPACES (TODO titles) and values a shell cannot enumerate without
 * shelling back into the CLI. It also needs no `.zshrc` line, works identically
 * on Windows, and cannot drift out of sync with the commands it completes.
 *
 * The trade, stated plainly: this fires when an argument is OMITTED. Pressing
 * TAB at the shell prompt itself does nothing - the shell knows nothing about
 * this program.
 */
export type CompletionCandidate = {
  /** The value completed and returned. */
  value: string;
  /** Shown next to the value in the match list. Never completed against. */
  hint?: string;
};

export type TabCompleteConfig = {
  message: string;
  candidates: ReadonlyArray<CompletionCandidate>;
  /** Accept a value that matches no candidate. Default false: fail closed, so a
   *  typo becomes a re-prompt rather than a confusing downstream "not found". */
  allowFreeText?: boolean;
  theme?: Partial<Theme>;
};

/** Longest common prefix of a non-empty list. "" for an empty list. */
export function longestCommonPrefix(values: readonly string[]): string {
  if (values.length === 0) return "";
  let prefix = values[0]!;
  for (const value of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < value.length && prefix[i] === value[i]) i += 1;
    prefix = prefix.slice(0, i);
    if (prefix === "") break;
  }
  return prefix;
}

export function matchesFor(
  stem: string,
  candidates: readonly CompletionCandidate[],
): string[] {
  const lower = stem.toLowerCase();
  return candidates
    .map((c) => c.value)
    .filter((v) => v.toLowerCase().startsWith(lower));
}

export type CompletionState = {
  /** What the user actually typed, before any cycling replaced the line. */
  stem: string;
  /** How many times TAB has been pressed since the stem last changed. */
  tabCount: number;
};

export type CompletionStep = {
  text: string;
  matches: string[];
  next: CompletionState;
  /** True when TAB is cycling rather than extending the prefix. */
  cycling: boolean;
};

/**
 * One TAB press. Pure, so the completion behaviour is testable without a TTY.
 *
 * bash semantics:
 *   - no match          -> nothing changes
 *   - one match         -> complete to it
 *   - shared prefix     -> extend to the longest common prefix
 *   - nothing to extend -> cycle through the matches
 */
export function completeStep(
  state: CompletionState,
  candidates: readonly CompletionCandidate[],
): CompletionStep {
  const matches = matchesFor(state.stem, candidates);
  if (matches.length === 0) {
    return { text: state.stem, matches, next: { ...state, tabCount: 0 }, cycling: false };
  }
  if (matches.length === 1) {
    return {
      text: matches[0]!,
      matches,
      next: { stem: matches[0]!, tabCount: 0 },
      cycling: false,
    };
  }
  const prefix = longestCommonPrefix(matches);
  if (prefix.length > state.stem.length) {
    return {
      text: prefix,
      matches,
      next: { stem: prefix, tabCount: 0 },
      cycling: false,
    };
  }
  // Nothing left to extend - walk the matches instead. The stem is preserved so
  // cycling always re-derives the same match set.
  const pick = matches[state.tabCount % matches.length]!;
  return {
    text: pick,
    matches,
    next: { stem: state.stem, tabCount: state.tabCount + 1 },
    cycling: true,
  };
}

const MAX_SHOWN = 8;

function renderMatches(
  matches: readonly string[],
  candidates: readonly CompletionCandidate[],
): string {
  if (matches.length === 0) return color.dim("  no match");
  const hints = new Map(candidates.map((c) => [c.value, c.hint]));
  const shown = matches.slice(0, MAX_SHOWN).map((value) => {
    const hint = hints.get(value);
    return `  ${value}${hint ? color.dim(`  ${hint}`) : ""}`;
  });
  if (matches.length > MAX_SHOWN) {
    shown.push(color.dim(`  ... ${matches.length - MAX_SHOWN} more`));
  }
  return shown.join("\n");
}

const basePrompt = createPrompt<string, TabCompleteConfig>((config, done) => {
  const theme = makeTheme(config.theme);
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState<string>("");
  const [state, setState] = useState<CompletionState>({ stem: "", tabCount: 0 });
  const [showMatches, setShowMatches] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useKeypress((key, rl) => {
    if (status !== "idle") return;

    if (key.name === "tab") {
      // Keep the visible line and the prompt's own buffer in step: readline
      // would otherwise insert a literal tab character.
      const step = completeStep(state, config.candidates);
      rl.clearLine(0);
      rl.write(step.text);
      setText(step.text);
      setState(step.next);
      setShowMatches(true);
      setError(null);
      return;
    }

    if (isEnterKey(key)) {
      const value = text.trim();
      if (!value) {
        setError("Enter a value, or press TAB to see the options.");
        return;
      }
      if (
        !config.allowFreeText &&
        !config.candidates.some((c) => c.value === value)
      ) {
        setError(`"${value}" is not one of the options. TAB completes them.`);
        return;
      }
      setStatus("done");
      done(value);
      return;
    }

    // Any other key is real typing (including backspace): the stem follows the
    // line, which resets cycling so the next TAB re-derives matches from what
    // is actually on the line rather than from a stale prefix.
    setText(rl.line);
    setState({ stem: rl.line, tabCount: 0 });
    setError(null);
  });

  const prefix = usePrefix({ status, theme });
  const message = theme.style.message(config.message, status);

  if (status === "done") {
    return `${prefix} ${message} ${theme.style.answer(text)}`;
  }

  const help = color.dim("TAB to complete · Enter to confirm");
  const list = showMatches
    ? `\n${renderMatches(matchesFor(state.stem, config.candidates), config.candidates)}`
    : "";
  const err = error ? `\n${color.dim(error)}` : "";
  return [`${prefix} ${message} ${text}`, `${help}${list}${err}`];
});

export function tabCompleteInput(config: TabCompleteConfig): Promise<string> {
  return basePrompt(config);
}
