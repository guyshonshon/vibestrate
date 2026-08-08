/**
 * A fetch that is allowed to fail without taking the page down, but NOT allowed
 * to fail invisibly.
 *
 * The pattern this replaces - `api.getX().catch(() => null)` inside a
 * `Promise.all` - gets the isolation right and the honesty wrong: the panel then
 * renders its empty state, so "the request failed" and "there is nothing here"
 * look identical. On the run screen that meant a failed diff fetch read as "this
 * run changed nothing" and a failed assurance fetch made the terminal verdict
 * disappear - the two things a human is supposed to review before merging.
 *
 * `settle` keeps the isolation and makes the failure a value the caller must
 * look at, so a panel can render a recovery instead of a blank.
 */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

export function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  return p.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
}

/** The value if it loaded, else `fallback` - for a panel that also renders the error. */
export function valueOr<T>(s: Settled<T>, fallback: T): T {
  return s.ok ? s.value : fallback;
}

/** The error if it failed, else null - feeds straight into `<ErrorView err={…} />`. */
export function errorOf<T>(s: Settled<T>): unknown {
  return s.ok ? null : s.error;
}
