import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * "View diff" on the run header set the inspector tab and nothing else.
 *
 * The Inspect section sits roughly 2400px below the header, so the state change
 * happened off-screen: the page did not move, and the button read as broken.
 * The same was true of "View validation" and the outcome banner's tab links.
 * It surfaced while filming the README demo, where the only way to make the
 * button look alive was to scroll manually right after clicking it.
 *
 * The fix routes every opener ABOVE the section through `openInspector`, which
 * sets the tab and then scrolls. This test guards the shape rather than the
 * scroll: a sixth call site added later with a bare `setTab` would restore the
 * bug silently, and no runtime test would notice because the tab state IS
 * correct - only the viewport is wrong.
 *
 * Controls INSIDE the section (InspectorTabsV3) are meant to call setTab
 * directly: you are already looking at the panel, and scrolling the page under
 * your own cursor is worse than not scrolling at all.
 */

const PAGE = fileURLToPath(
  new URL("../src/ui/app/routes/RunDetailPage.tsx", import.meta.url),
);

describe("run detail inspector", () => {
  const src = readFileSync(PAGE, "utf8");

  it("reads the page at all", () => {
    // Guards the path: an empty read would make every assertion below vacuous.
    expect(src.length).toBeGreaterThan(1000);
    expect(src).toContain("05 Inspector");
  });

  it("routes every tab opener above the section through openInspector", () => {
    // Arrow-form handlers are the ones wired to controls rendered above the
    // Inspect section. `setCurrent={setTab}` on InspectorTabsV3 is a bare
    // reference, not this shape, so it is correctly untouched.
    const bare = [...src.matchAll(/=>\s*setTab\(/g)];
    expect({ bareOpeners: bare.length }).toEqual({ bareOpeners: 0 });
  });

  it("scrolls the section it just switched", () => {
    expect(src).toMatch(/const openInspector\s*=/);
    expect(src).toContain("inspectorRef.current?.scrollIntoView");
    // The ref has to be ON the section, or the scroll targets nothing.
    expect(src).toMatch(/<section ref=\{inspectorRef\}[^>]*05 Inspector/);
  });
});
