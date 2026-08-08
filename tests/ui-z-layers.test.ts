import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Z_LAYER } from "../src/ui/lib/z-layers.js";

const src = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../src/ui/${rel}`, import.meta.url)), "utf8");

/** Every .tsx under src/ui, so a new overlay cannot slip in unchecked. */
function uiFiles(): string[] {
  const root = fileURLToPath(new URL("../src/ui", import.meta.url));
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".tsx")) out.push(relative(root, full));
    }
  };
  walk(root);
  return out;
}

const OVERLAYS = [
  "components/onboarding/TourOverlay.tsx",
  "components/HelpOverlay.tsx",
  "components/layout/GlobalErrorOverlay.tsx",
];

describe("overlay stacking scale", () => {
  it("is strictly ascending in declaration order", () => {
    const values = Object.values(Z_LAYER);
    const sorted = [...values].sort((a, b) => a - b);
    expect(values).toEqual(sorted);
    expect(new Set(values).size).toBe(values.length);
  });

  it("keeps the unhandled-error surface above every other layer", () => {
    const others = Object.entries(Z_LAYER)
      .filter(([name]) => name !== "globalError")
      .map(([, value]) => value);
    expect(Math.max(...others)).toBeLessThan(Z_LAYER.globalError);
  });

  it("orders coach marks under dialogs, and dialogs under errors", () => {
    expect(Z_LAYER.coachMark).toBeLessThan(Z_LAYER.dialog);
    expect(Z_LAYER.dialog).toBeLessThan(Z_LAYER.confirmDialog);
    expect(Z_LAYER.confirmDialog).toBeLessThan(Z_LAYER.globalError);
  });

  it("leaves no hardcoded z-index in the overlays that share the top rungs", () => {
    for (const file of OVERLAYS) {
      const text = src(file);
      expect(text, `${file} must read its level from Z_LAYER`).toMatch(/Z_LAYER\./);
      expect(text.match(/\bz-(?:\[\d+\]|\d+)(?![\w-])/g), `${file} hardcodes a z-index`).toBeNull();
    }
  });

  // The three named overlays were never the whole risk. Any literal at or above
  // the coach-mark rung can tie with them, and a tie is broken by DOM order -
  // which is precisely how an error ends up painted under the tour. Below that
  // rung a literal cannot cover an error, so the lower call sites stay as
  // documented migration targets rather than a failing build.
  it("has no hardcoded z-index anywhere at or above the coach-mark rung", () => {
    const offenders: string[] = [];
    for (const file of uiFiles()) {
      const text = src(file);
      for (const m of text.matchAll(/\bz-(?:\[(\d+)\]|(\d+))(?![\w-])/g)) {
        const value = Number(m[1] ?? m[2]);
        if (value >= Z_LAYER.coachMark) offenders.push(`${file}: z-[${value}]`);
      }
    }
    expect(offenders, "use Z_LAYER instead of a literal at the top rungs").toEqual([]);
  });
});
