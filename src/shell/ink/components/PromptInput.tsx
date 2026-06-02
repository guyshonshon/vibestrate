import React, { useEffect, useRef, useState } from "react";
import { Text, useInput } from "ink";

type Props = {
  value: string;
  placeholder?: string;
  focus?: boolean;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
};

/**
 * Controlled single-line text input for the shell prompt - a drop-in for
 * ink-text-input that adds terminal-style cursor navigation:
 *   - Ctrl+Right / Ctrl+E / End  -> jump to end of line
 *   - Ctrl+Left  / Ctrl+A / Home -> jump to start of line
 *   - Option/Alt+Right (or Alt+f) -> next word
 *   - Option/Alt+Left  (or Alt+b) -> previous word
 *   - Left / Right                -> one character
 * Up/Down, Tab, Esc, and Ctrl+C are left for the App's key handler (history,
 * completion, scroll, blur). When the value is replaced from the outside
 * (history recall, completion accept), the cursor jumps to the end.
 */

/** Word boundary to the right of `pos`: skip non-word chars, then word chars. */
export function nextWordOffset(value: string, pos: number): number {
  let i = pos;
  while (i < value.length && !/\w/.test(value[i]!)) i++;
  while (i < value.length && /\w/.test(value[i]!)) i++;
  return i;
}

/** Word boundary to the left of `pos`: skip non-word chars, then word chars. */
export function prevWordOffset(value: string, pos: number): number {
  let i = pos;
  while (i > 0 && !/\w/.test(value[i - 1]!)) i--;
  while (i > 0 && /\w/.test(value[i - 1]!)) i--;
  return i;
}

export function PromptInput({
  value,
  placeholder = "",
  focus = true,
  onChange,
  onSubmit,
}: Props) {
  const [cursor, setCursor] = useState(value.length);
  // The last value we emitted via onChange - lets us tell our own edits apart
  // from external replacements (history / completion), which reset the cursor.
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setCursor(value.length);
    } else if (cursor > value.length) {
      setCursor(value.length);
    }
  }, [value, cursor]);

  useInput(
    (input, key) => {
      // Leave these for the App-level handler.
      if (
        key.upArrow ||
        key.downArrow ||
        key.tab ||
        key.escape ||
        (key.ctrl && input === "c")
      ) {
        return;
      }

      if (key.return) {
        onSubmit?.(value);
        return;
      }

      const wordMod = key.meta; // Option/Alt
      const lineMod = key.ctrl;

      // ── Cursor navigation (no value change) ──────────────────────────────
      if (key.rightArrow) {
        setCursor(
          lineMod
            ? value.length
            : wordMod
              ? nextWordOffset(value, cursor)
              : Math.min(value.length, cursor + 1),
        );
        return;
      }
      if (key.leftArrow) {
        setCursor(
          lineMod ? 0 : wordMod ? prevWordOffset(value, cursor) : Math.max(0, cursor - 1),
        );
        return;
      }
      // Emacs-style + Home/End for terminals that send them.
      if (lineMod && (input === "e")) return void setCursor(value.length);
      if (lineMod && (input === "a")) return void setCursor(0);
      // Alt+f / Alt+b word motion (terminals that send ESC f / ESC b).
      if (wordMod && input === "f") return void setCursor(nextWordOffset(value, cursor));
      if (wordMod && input === "b") return void setCursor(prevWordOffset(value, cursor));

      // ── Edits ────────────────────────────────────────────────────────────
      if (key.backspace || key.delete) {
        if (cursor > 0) {
          const next = value.slice(0, cursor - 1) + value.slice(cursor);
          lastEmitted.current = next;
          setCursor(cursor - 1);
          onChange(next);
        }
        return;
      }
      // Ignore other control/meta chords so they don't insert stray bytes.
      if (key.ctrl || key.meta || input.length === 0) return;

      const next = value.slice(0, cursor) + input + value.slice(cursor);
      lastEmitted.current = next;
      setCursor(cursor + input.length);
      onChange(next);
    },
    { isActive: focus },
  );

  // Render with a fake inverse-block cursor (the ink-text-input trick), built
  // from Ink <Text> segments so we don't pull in chalk directly.
  if (!focus) {
    return value.length > 0 ? (
      <Text>{value}</Text>
    ) : (
      <Text dimColor>{placeholder}</Text>
    );
  }
  if (value.length === 0) {
    return placeholder.length > 0 ? (
      <Text>
        <Text inverse>{placeholder[0]}</Text>
        <Text dimColor>{placeholder.slice(1)}</Text>
      </Text>
    ) : (
      <Text inverse> </Text>
    );
  }
  const atEnd = cursor >= value.length;
  return (
    <Text>
      {value.slice(0, cursor)}
      <Text inverse>{atEnd ? " " : value[cursor]}</Text>
      {atEnd ? "" : value.slice(cursor + 1)}
    </Text>
  );
}
