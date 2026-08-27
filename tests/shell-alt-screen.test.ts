import { describe, it, expect } from "vitest";
import {
  enterAltScreen,
  ALT_SCREEN_CODES,
  type AltScreenIo,
} from "../src/shell/ink/alt-screen.js";

/**
 * Full-screen mode must always hand the terminal back.
 *
 * The alternate buffer hides the user's scrollback while it is active. A shell
 * that exits without restoring has eaten it - which is strictly worse than the
 * compact inline layout this mode exists to improve on. So the interesting
 * tests are the exits, not the entry.
 */
function fakeIo(isTTY = true): AltScreenIo & {
  written: string[];
  handlers: Map<string, Set<() => void>>;
} {
  const written: string[] = [];
  const handlers = new Map<string, Set<() => void>>();
  return {
    written,
    handlers,
    isTTY,
    write: (t) => written.push(t),
    on: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler);
    },
  };
}

describe("alternate-buffer mode", () => {
  it("enters and restores, in that order", () => {
    const io = fakeIo();
    const h = enterAltScreen(io);
    expect(io.written).toEqual([ALT_SCREEN_CODES.ENTER]);
    h.leave();
    expect(io.written).toEqual([ALT_SCREEN_CODES.ENTER, ALT_SCREEN_CODES.LEAVE]);
  });

  it("restores exactly once, however many times it is asked", () => {
    // The runtime calls `leave` in a `finally`, and a signal handler may call it
    // too. A second restore writes the escape into the RESTORED buffer, where
    // the user sees it as stray characters.
    const io = fakeIo();
    const h = enterAltScreen(io);
    h.leave();
    h.leave();
    h.leave();
    expect(io.written.filter((w) => w === ALT_SCREEN_CODES.LEAVE)).toHaveLength(1);
  });

  it("restores when the process is killed, not only when it returns", () => {
    for (const signal of ["SIGINT", "SIGTERM", "exit"] as const) {
      const io = fakeIo();
      enterAltScreen(io);
      expect(io.handlers.get(signal)?.size, `${signal} was never armed`).toBe(1);
      for (const h of io.handlers.get(signal)!) h();
      expect(io.written, `${signal} did not restore`).toContain(ALT_SCREEN_CODES.LEAVE);
    }
  });

  it("unhooks its handlers on restore, so it cannot leak them", () => {
    const io = fakeIo();
    const h = enterAltScreen(io);
    h.leave();
    for (const event of ["exit", "SIGINT", "SIGTERM"]) {
      expect(io.handlers.get(event)?.size ?? 0, `${event} handler leaked`).toBe(0);
    }
  });

  it("does nothing at all on a non-TTY", () => {
    // Writing escape codes into a pipe puts control characters into whatever is
    // reading, which is how a captured log becomes unreadable.
    const io = fakeIo(false);
    const h = enterAltScreen(io);
    expect(h.active).toBe(false);
    h.leave();
    expect(io.written).toEqual([]);
    expect(io.handlers.size).toBe(0);
  });

  it("uses DECSET 1049, which saves and restores the screen and cursor", () => {
    // 1049 rather than 47/1047: only 1049 saves the cursor too, so quitting
    // puts the prompt back where it was instead of wherever the app left it.
    expect(ALT_SCREEN_CODES.ENTER).toContain("?1049h");
    expect(ALT_SCREEN_CODES.LEAVE).toContain("?1049l");
  });
});
