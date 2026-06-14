import { color } from "./format.js";

// ── Minimal stderr spinner for long-running CLI calls ────────────────────────
//
// Long provider/LLM calls (consult, integrate analyze) used to run with NO
// output - the terminal just sat frozen until the answer appeared, reading as
// "broken/hung". This gives immediate, honest feedback. Design choices that
// matter:
//   - Writes to STDERR, so stdout stays clean for `--json` and pipes.
//   - Animates ONLY on a TTY; otherwise prints a single static line so
//     non-interactive logs still record that the work started (no \r spam).
//   - Does NOT hide the cursor - hiding it would require signal handling to
//     restore on Ctrl+C; skipping it means a kill mid-spin can never leave the
//     user's terminal with an invisible cursor (worst case is a stray line the
//     next prompt overwrites).
//   - Shows elapsed seconds, so a slow call reads as "working", not "stuck".

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export type Spinner = { stop: () => void };

/** Start a spinner with `label`. Always returns a handle whose `stop()` is safe
 *  to call once or many times. Call `stop()` BEFORE writing the result so the
 *  spinner line never interleaves with output. */
export function startSpinner(label: string): Spinner {
  const stream = process.stderr;
  let stopped = false;

  // Non-TTY (piped, CI, redirected): one static line, no animation, no escapes.
  if (stream.isTTY !== true) {
    stream.write(`${label}...\n`);
    return { stop: () => {} };
  }

  const start = Date.now();
  let i = 0;
  const render = (): void => {
    const secs = Math.floor((Date.now() - start) / 1000);
    const frame = FRAMES[i = (i + 1) % FRAMES.length];
    // \r to the line start, write, then \x1b[K to clear any trailing remnants.
    stream.write(`\r${color.cyan(frame!)} ${label}${secs >= 1 ? color.dim(` ${secs}s`) : ""}\x1b[K`);
  };
  render();
  const timer = setInterval(render, 80);
  // Don't let the spinner's interval keep the process alive on its own.
  if (typeof timer.unref === "function") timer.unref();

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      stream.write("\r\x1b[K"); // wipe the spinner line; leave the cursor as-is
    },
  };
}
