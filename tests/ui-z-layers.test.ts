import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Z_LAYER } from "../src/ui/lib/z-layers.js";

const src = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../src/ui/${rel}`, import.meta.url)), "utf8");

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
});
