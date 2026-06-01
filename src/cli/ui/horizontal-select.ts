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
 * A horizontal, chip-style single-select prompt - the answer options sit on
 * one line and you move between them with ← / → (or h / l), Enter to pick.
 * Built on `@inquirer/core` so it shares the same readline/raw-mode/Ctrl-C
 * handling as the other prompts. Used by the `vibe run` Flow/Crew picker.
 */
export type HorizontalChoice<Value> = {
  value: Value;
  /** The chip label. */
  name: string;
  /** Optional one-line hint shown under the chips for the active choice. */
  description?: string;
};

export type HorizontalSelectConfig<Value> = {
  message: string;
  choices: ReadonlyArray<HorizontalChoice<Value>>;
  /** Index or matching value to start on. Defaults to the first choice. */
  default?: Value;
  theme?: Partial<Theme>;
};

/**
 * Pure navigation step - exported for tests. Wraps around both ends.
 * `delta` is +1 (right) or -1 (left).
 */
export function moveIndex(current: number, length: number, delta: number): number {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}

/** Render the chip strip - active chip inverse-highlighted, others dimmed. */
function renderChips(names: readonly string[], active: number): string {
  return names
    .map((name, i) =>
      i === active ? color.inverse(` ${name} `) : color.dim(` ${name} `),
    )
    .join(color.dim("·"));
}

// The prompt is built at a concrete (`unknown`) value type so its inferred
// type never has to name `@inquirer/type` in the emitted .d.ts (TS2742). The
// exported `horizontalSelect` is a thin generic wrapper with an explicit
// `Promise<Value>` signature.
const basePrompt = createPrompt<unknown, HorizontalSelectConfig<unknown>>(
  (config, done): string | [string, string | undefined] => {
    const { choices } = config;
    const theme = makeTheme(config.theme);
    const [status, setStatus] = useState<Status>("idle");
    const [active, setActive] = useState<number>(() => {
      if (config.default === undefined) return 0;
      const idx = choices.findIndex((c) => c.value === config.default);
      return idx >= 0 ? idx : 0;
    });

    useKeypress((key) => {
      if (status !== "idle") return;
      if (isEnterKey(key)) {
        setStatus("done");
        done(choices[active]!.value);
      } else if (key.name === "right" || key.name === "l" || key.name === "tab") {
        setActive(moveIndex(active, choices.length, 1));
      } else if (key.name === "left" || key.name === "h") {
        setActive(moveIndex(active, choices.length, -1));
      }
    });

    const prefix = usePrefix({ status, theme });
    const message = theme.style.message(config.message, status);

    if (status === "done") {
      return `${prefix} ${message} ${theme.style.answer(choices[active]!.name)}`;
    }

    const chips = renderChips(
      choices.map((c) => c.name),
      active,
    );
    const help = color.dim("← → to move · Enter to select");
    const desc = choices[active]?.description
      ? `\n${color.dim(choices[active]!.description!)}`
      : "";
    return [`${prefix} ${message}`, `${chips}  ${help}${desc}`];
  },
);

export function horizontalSelect<Value>(
  config: HorizontalSelectConfig<Value>,
): Promise<Value> {
  return basePrompt(config as HorizontalSelectConfig<unknown>) as Promise<Value>;
}
