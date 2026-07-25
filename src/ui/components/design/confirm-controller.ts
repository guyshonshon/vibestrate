/**
 * The settlement rules behind `ConfirmDialog`, kept free of React and the DOM
 * so they can be tested directly.
 *
 * These dialogs gate destructive actions (abort a run, delete a flow, apply or
 * undo a merge, revert a patch), so the invariant is narrow and worth stating
 * plainly: a request resolves `true` ONLY via `accept()`. Every other exit -
 * decline, being superseded, teardown - resolves the caller as a refusal, and
 * no request is ever left unsettled.
 */

export type PendingKind = "confirm" | "prompt";

type Entry = {
  kind: PendingKind;
  /** Opaque payload the view renders. */
  opts: unknown;
  settle: (value: boolean | string | null) => void;
};

export type ConfirmController = {
  /** Register a request, superseding (and declining) any open one. */
  open: (
    kind: PendingKind,
    opts: unknown,
    settle: (value: boolean | string | null) => void,
  ) => void;
  /** The explicit yes. `value` is the text for a prompt. */
  accept: (value: string) => void;
  /** The explicit no - cancel, Escape, backdrop. */
  decline: () => void;
  /** Provider teardown. Never leave a caller awaiting forever. */
  dispose: () => void;
  current: () => { kind: PendingKind; opts: unknown } | null;
};

/** A refusal, shaped for the kind of request that was open. */
function refuse(entry: Entry): void {
  entry.settle(entry.kind === "confirm" ? false : null);
}

export function createConfirmController(
  onChange: (next: { kind: PendingKind; opts: unknown } | null) => void = () => {},
): ConfirmController {
  let entry: Entry | null = null;

  const clear = (): Entry | null => {
    const prev = entry;
    entry = null;
    return prev;
  };

  return {
    open(kind, opts, settle) {
      // Superseding must decline the outgoing request rather than drop it,
      // or its caller waits on a promise that never settles.
      const prev = clear();
      if (prev) refuse(prev);
      entry = { kind, opts, settle };
      onChange({ kind, opts });
    },
    accept(value) {
      const prev = clear();
      onChange(null);
      if (!prev) return;
      prev.settle(prev.kind === "confirm" ? true : value);
    },
    decline() {
      const prev = clear();
      onChange(null);
      if (prev) refuse(prev);
    },
    dispose() {
      const prev = clear();
      if (prev) refuse(prev);
    },
    current: () => (entry ? { kind: entry.kind, opts: entry.opts } : null),
  };
}
