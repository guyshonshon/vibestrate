// Code-split routes that survive the server being rebuilt under them.
//
// `vibe ui` serves hashed files out of `dist/ui`, and a rebuild replaces them:
// `RunComposePage-DFUSLVyV.js` becomes `RunComposePage-CoTvODq5.js` and the old
// name is gone. A tab that was open across that rebuild still holds the old
// module graph in memory, so the first navigation to a not-yet-loaded route
// requests a filename the server honestly 404s (see the SPA fallback in
// src/server/server.ts, which refuses to answer asset requests with HTML).
//
// Nothing running in that page can repair this. The stale filename is baked
// into loaded code; only a document reload fetches the new index.html and the
// new names. So a failed route chunk reloads the page once.
//
// Once, and only for a load failure:
//   - The attempt is recorded in sessionStorage, which survives the reload and
//     dies with the tab. A chunk that fails again after a reload is not stale -
//     the build is broken, the server is down, the tab is offline - and the
//     rejection is let through to the ErrorBoundary instead of refreshing
//     forever.
//   - A module that loads and then throws at its top level is a real bug, not
//     staleness, and reloading would discard the user's page state to arrive at
//     the same error. Those rejections are rethrown untouched.
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_KEY_PREFIX = "vibestrate:stale-chunk:";

/** The subset of sessionStorage this module needs, so tests can supply one. */
export type ReloadMemory = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Whether a rejected dynamic import failed to *fetch* rather than failing to
 * *run*. There is no structured signal for this - every engine throws a plain
 * TypeError - so the message is matched, per engine:
 *
 *   Chrome/Edge  Failed to fetch dynamically imported module: <url>
 *   Firefox      error loading dynamically imported module: <url>
 *   Safari       Importing a module script failed.
 *   any          Failed to load module script: <MIME complaint>
 *
 * A miss here is safe: the error reaches the ErrorBoundary, which already
 * offers a Reload button. A false positive is not, which is why this matches
 * loader phrasing rather than anything an application module could produce.
 */
export function isChunkLoadFailure(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause ?? "");
  return /dynamically imported module|importing a module script failed|failed to load module script/i.test(
    message,
  );
}

/**
 * Take the one reload this key is allowed, returning false if it is already
 * spent. Storage that throws (a locked-down profile, Safari's private mode)
 * also returns false: without a durable marker there is no loop guard, and an
 * unguarded reload against a permanently missing chunk is an endless refresh.
 */
export function claimReload(key: string, memory: ReloadMemory | null): boolean {
  if (!memory) return false;
  try {
    if (memory.getItem(key) !== null) return false;
    memory.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

function releaseReload(key: string, memory: ReloadMemory | null): void {
  if (!memory) return;
  try {
    memory.removeItem(key);
  } catch {
    /* nothing durable was written, so there is nothing to clear */
  }
}

function sessionMemory(): ReloadMemory | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * `React.lazy` with stale-chunk recovery. `name` only has to be unique per
 * route - it keys that route's single reload attempt.
 */
// The signature mirrors React's own `lazy` - the component type is the type
// parameter, not its props. Inferring props instead makes TypeScript resolve
// `P` while it is still contextually typing the `.then(m => ({ default: m.X }))`
// callback, and every call site lands on `ComponentType<never>`.
export function lazyRoute<T extends ComponentType<any>>(
  name: string,
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  const key = `${RELOAD_KEY_PREFIX}${name}`;
  return lazy(async () => {
    try {
      const mod = await load();
      // Loaded: give the route its reload back, so a second rebuild later in
      // the same tab is recovered from too.
      releaseReload(key, sessionMemory());
      return mod;
    } catch (cause) {
      if (!isChunkLoadFailure(cause)) throw cause;
      if (!claimReload(key, sessionMemory())) throw cause;
      window.location.reload();
      // Never settles. The document is being torn down; resolving here would
      // render a page into it on the way out.
      return new Promise<never>(() => {});
    }
  });
}
