/**
 * THE prompt boundary. Every interactive question in the CLI comes through
 * here rather than importing `@inquirer/prompts` directly.
 *
 * Cancelling a prompt is a decision, not a failure: `vibe setup` says "Press
 * Ctrl+C to cancel anytime". `@inquirer` signals it by rejecting with an
 * `ExitPromptError`, which then travels as an ordinary error through whichever
 * `catch` happens to be nearest - and there are forty-odd of them across the
 * interactive commands. `vibe setup`'s own printed
 *
 *     ✗ User force closed the prompt with SIGINT
 *
 * and returned 1, so the product reported the action it had just suggested as
 * an error. Handling it in each catch is a rule every future catch has to
 * remember; handling it HERE means a cancelled prompt never becomes a generic
 * error in the first place.
 *
 * `tests/prompt-cancellation.test.ts` asserts nothing under `src/cli` imports
 * `@inquirer/prompts` except this file, so the boundary cannot be walked around.
 */
import {
  checkbox as rawCheckbox,
  confirm as rawConfirm,
  input as rawInput,
  password as rawPassword,
  select as rawSelect,
} from "@inquirer/prompts";
import { CANCELLED_EXIT_CODE, isPromptCancellation } from "./cancellation.js";

/**
 * Run one prompt, turning a cancellation into a clean exit.
 *
 * Exiting the process from inside a helper is normally the wrong shape. It is
 * right here and only here: the user pressed Ctrl+C, which is a request to stop
 * the program, and unwinding instead would hand a half-answered wizard back to
 * a caller that has no better answer than to stop too. Anything that is NOT a
 * cancellation rethrows untouched.
 */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!isPromptCancellation(err)) throw err;
    process.stderr.write("Cancelled.\n");
    process.exit(CANCELLED_EXIT_CODE);
  }
}

type Params<F> = F extends (...args: infer A) => unknown ? A : never;
type Result<F> = F extends (...args: never[]) => PromiseLike<infer R> ? R : never;

export const confirm = (...args: Params<typeof rawConfirm>): Promise<Result<typeof rawConfirm>> =>
  guarded(() => rawConfirm(...args));

export const input = (...args: Params<typeof rawInput>): Promise<Result<typeof rawInput>> =>
  guarded(() => rawInput(...args));

export const password = (...args: Params<typeof rawPassword>): Promise<Result<typeof rawPassword>> =>
  guarded(() => rawPassword(...args));

export const select = ((...args: never[]) =>
  guarded(() => (rawSelect as (...a: never[]) => Promise<unknown>)(...args))) as typeof rawSelect;

export const checkbox = ((...args: never[]) =>
  guarded(() => (rawCheckbox as (...a: never[]) => Promise<unknown>)(...args))) as typeof rawCheckbox;
