// Full-screen (alternate-buffer) mode for the interactive shell.
//
// Ink renders INLINE: the app draws where the cursor is and leaves whatever was
// above it alone. That is the right default - your scrollback survives, and
// quitting leaves the last frame where you can still read it - but on a large
// window it means a compact app with dead terminal underneath.
//
// The alternate buffer (`smcup`/`rmcup`, DECSET 1049) is the fix and is NOT the
// default, deliberately. It has to redraw correctly on resize in the terminal
// the person is actually using, and the one place that was tried - VSCode's
// integrated terminal - misbehaved. Shipping it on by default would trade a
// cosmetic complaint for a broken shell in an editor a lot of people live in.
//
// So it is opt-in, in one place, and it always restores: the escape codes are
// paired here rather than sprinkled at call sites, and the exit path runs on
// normal return, on a throw, and on a signal. A shell that leaves the terminal
// in the alternate buffer has eaten the user's scrollback, which is worse than
// any layout it was trying to fix.

/** DECSET 1049: switch to the alternate buffer, saving cursor + screen. */
const ENTER = "[?1049h";
/** DECRST 1049: restore the original buffer, cursor and contents. */
const LEAVE = "[?1049l";

export type AltScreenHandle = {
  /** Restore the original buffer. Safe to call more than once. */
  leave: () => void;
  /** Whether the alternate buffer was actually entered. */
  readonly active: boolean;
};

export type AltScreenIo = {
  write: (text: string) => void;
  isTTY: boolean;
  on: (event: "exit" | "SIGINT" | "SIGTERM", handler: () => void) => void;
  off: (event: "exit" | "SIGINT" | "SIGTERM", handler: () => void) => void;
};

/**
 * Enter the alternate buffer, returning a handle that restores it.
 *
 * A no-op on a non-TTY: writing the escape codes into a pipe puts literal
 * control characters into whatever is reading, which is how a captured log ends
 * up unreadable.
 *
 * The restore is also armed on `exit`, `SIGINT` and `SIGTERM`, because the
 * failure that matters is not the tidy one. A shell killed mid-frame must still
 * hand the terminal back.
 */
export function enterAltScreen(io: AltScreenIo): AltScreenHandle {
  if (!io.isTTY) {
    return { leave: () => {}, active: false };
  }
  let left = false;
  const leave = (): void => {
    if (left) return;
    left = true;
    io.write(LEAVE);
    io.off("exit", leave);
    io.off("SIGINT", leave);
    io.off("SIGTERM", leave);
  };
  io.write(ENTER);
  io.on("exit", leave);
  io.on("SIGINT", leave);
  io.on("SIGTERM", leave);
  return {
    leave,
    get active() {
      return !left;
    },
  };
}

/** The process as an `AltScreenIo`. Separated so the pairing above is testable. */
export function processAltScreenIo(): AltScreenIo {
  return {
    write: (text) => process.stdout.write(text),
    isTTY: Boolean(process.stdout.isTTY),
    on: (event, handler) => {
      process.on(event, handler);
    },
    off: (event, handler) => {
      process.off(event, handler);
    },
  };
}

export const ALT_SCREEN_CODES = { ENTER, LEAVE } as const;
