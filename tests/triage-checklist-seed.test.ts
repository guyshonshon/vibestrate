// The guard on seeding a card from the triage turn's roadmap.
//
// This one rule stands between a model's reading of a one-line brief and the
// user's own planning data. The failure that matters is not "we skipped a seed"
// - it is overwriting a breakdown a human wrote, which they would have to
// notice before they could undo.

import { describe, it, expect } from "vitest";
import { maySeedChecklist } from "../src/roadmap/roadmap-service.js";

const steps = [{ text: "one" }, { text: "two" }];

describe("maySeedChecklist", () => {
  it("seeds a card that has no checklist yet", () => {
    expect(maySeedChecklist({ checklist: [] }, steps)).toBe(true);
  });

  it("NEVER touches a card the owner has already broken down", () => {
    expect(maySeedChecklist({ checklist: [{}] }, steps)).toBe(false);
    // Not even when the triage has far more to say than the card does - "the
    // card looks thin" is not a judgment this is in a position to make.
    expect(
      maySeedChecklist({ checklist: [{}] }, [...steps, ...steps, ...steps]),
    ).toBe(false);
  });

  it("does nothing without a card or without steps", () => {
    expect(maySeedChecklist(null, steps)).toBe(false);
    expect(maySeedChecklist({ checklist: [] }, [])).toBe(false);
    expect(maySeedChecklist({ checklist: [] }, undefined)).toBe(false);
  });
});
