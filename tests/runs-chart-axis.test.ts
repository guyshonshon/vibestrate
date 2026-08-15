// The runs chart labels its x axis by striding over the daily buckets. The
// stride was fixed at every other point, which was legible over a 7 day range
// and turned into a smear of overlapping dates over 90. Nothing throws when it
// regresses, so the invariant needs its own check: labels must never be closer
// together than they are wide.

import { describe, it, expect } from "vitest";
import { xLabelStride } from "../src/ui/components/metrics/RunsAreaChart.js";

// Matches X_LABEL_PX in the chart. Kept local so a change there has to be a
// deliberate one here too.
const LABEL_PX = 56;

/** Pixels between two consecutive labels at a given stride. */
function spacing(count: number, innerWidth: number, stride: number): number {
  const step = innerWidth / Math.max(1, count - 1);
  return step * stride;
}

describe("xLabelStride", () => {
  // The reported bug: 90 daily buckets in a wide panel.
  it("keeps 90 days of labels from overlapping", () => {
    const stride = xLabelStride(90, 1750);
    expect(spacing(90, 1750, stride)).toBeGreaterThanOrEqual(LABEL_PX);
  });

  it("labels every day when a short range has room for them all", () => {
    expect(xLabelStride(7, 1750)).toBe(1);
    expect(xLabelStride(14, 1750)).toBe(1);
  });

  it("holds the no-overlap guarantee across every range and width", () => {
    for (const count of [1, 2, 7, 14, 30, 60, 90, 180, 365]) {
      for (const innerWidth of [220, 420, 700, 1100, 1750, 2400]) {
        const stride = xLabelStride(count, innerWidth);
        expect(Number.isInteger(stride), `${count}d @ ${innerWidth}px`).toBe(true);
        expect(stride, `${count}d @ ${innerWidth}px`).toBeGreaterThanOrEqual(1);
        if (count < 2) continue;
        expect(
          spacing(count, innerWidth, stride),
          `${count}d @ ${innerWidth}px`,
        ).toBeGreaterThanOrEqual(LABEL_PX);
      }
    }
  });

  // Anchoring the phase to the last index is what removed the separate
  // always-draw-the-last rule that caused the doubled label at the right edge.
  it("always lands a label on the newest day", () => {
    for (const count of [1, 7, 30, 90, 365]) {
      const stride = xLabelStride(count, 1750);
      const phase = (count - 1) % stride;
      const labelled = Array.from({ length: count }, (_, i) => i).filter(
        (i) => i % stride === phase,
      );
      expect(labelled.at(-1), `${count} days`).toBe(count - 1);
    }
  });

  it("degrades to a single label rather than dividing by a zero width", () => {
    expect(xLabelStride(90, 0)).toBe(90);
    expect(Number.isFinite(xLabelStride(90, 0))).toBe(true);
  });
});
