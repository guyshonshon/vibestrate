import { describe, it, expect } from "vitest";
import { claimReload, isChunkLoadFailure, type ReloadMemory } from "../src/ui/app/lazy-route.js";

/**
 * The dashboard serves hashed chunks out of dist/ui, so a rebuild under an open
 * tab leaves that tab importing filenames the server no longer has. lazyRoute
 * reloads once to recover. These cover the two ways that could go wrong:
 * reloading for a bug that a reload cannot fix, and reloading forever.
 */

function memory(initial: Record<string, string> = {}): ReloadMemory & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
}

describe("recognising a chunk that failed to arrive", () => {
  it("matches what each engine throws for a missing module", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: http://127.0.0.1:4317/assets/RunComposePage-DFUSLVyV.js",
      "error loading dynamically imported module: http://127.0.0.1:4317/assets/RunsPage-abc.js",
      "Importing a module script failed.",
      "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of text/html.",
    ]) {
      expect(isChunkLoadFailure(new TypeError(message)), message).toBe(true);
    }
  });

  it("leaves a module's own error alone, so a real bug is not answered with a refresh", () => {
    // Reloading here would throw away the user's page state to land on the
    // same exception, and the message is the one the ErrorBoundary should show.
    expect(isChunkLoadFailure(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadFailure(new Error("provider claude is not configured"))).toBe(false);
    expect(isChunkLoadFailure(undefined)).toBe(false);
  });
});

describe("spending the one reload a route gets", () => {
  it("allows the first attempt and refuses the second", () => {
    const store = memory();
    expect(claimReload("k", store)).toBe(true);
    // The reload happened and the chunk is still missing: a second one would
    // just be the first frame of an endless refresh.
    expect(claimReload("k", store)).toBe(false);
  });

  it("keys per route, so one dead chunk cannot mute recovery for the others", () => {
    const store = memory();
    expect(claimReload("vibestrate:stale-chunk:RunsPage", store)).toBe(true);
    expect(claimReload("vibestrate:stale-chunk:CrewPage", store)).toBe(true);
  });

  it("refuses when the attempt cannot be recorded", () => {
    // No durable marker means no loop guard. Without storage the failure has to
    // reach the ErrorBoundary, which offers the user a Reload button instead.
    const throwing: ReloadMemory = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("storage is disabled");
      },
      removeItem: () => undefined,
    };
    expect(claimReload("k", throwing)).toBe(false);
    expect(claimReload("k", null)).toBe(false);
  });
});
