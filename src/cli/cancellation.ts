/**
 * Ctrl+C during an interactive prompt is a decision, not a failure.
 *
 * Every wizard here is built on `@inquirer/prompts`, which rejects with an
 * `ExitPromptError` when the user interrupts one - and `vibe setup` explicitly
 * invites that ("Press Ctrl+C to cancel anytime"). Unhandled, it reached the
 * CLI's top-level catch and printed
 *
 *     vibe: User force closed the prompt with SIGINT
 *
 * with exit 1: the product told someone to press a key and then reported their
 * doing so as an error.
 *
 * Matched on `name`, not with `instanceof` and not by reading the message.
 * `instanceof` breaks the moment two copies of `@inquirer/core` are installed
 * (a transitive dependency resolving its own), which is exactly the case where
 * a wrong answer is hardest to notice; and the message is prose that upstream
 * is free to reword. The name is the error's contract.
 */
export const CANCELLED_EXIT_CODE = 130;

/** True for the interrupt @inquirer raises when a prompt is cancelled. */
export function isPromptCancellation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const name = (err as { name?: unknown }).name;
  return name === "ExitPromptError";
}

/**
 * Report a cancelled prompt and give back the exit code to use.
 *
 * 130 is the shell convention for "terminated by SIGINT" (128 + 2), so a script
 * wrapping `vibe` can tell a cancellation from a real failure instead of seeing
 * the same 1 both ways.
 */
export function reportCancellation(write: (text: string) => void): number {
  write("Cancelled.\n");
  return CANCELLED_EXIT_CODE;
}
