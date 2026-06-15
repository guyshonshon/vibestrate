import { describe, it, expect } from "vitest";
import { randomRunName, makeRunId } from "../src/utils/run-id.js";

describe("run id generation (docker-style)", () => {
  it("randomRunName is a short, ref-safe adjective-noun", () => {
    for (let i = 0; i < 100; i += 1) {
      const id = randomRunName();
      expect(id).toMatch(/^[a-z]+-[a-z]+$/);
      expect(id.length).toBeLessThanOrEqual(24);
    }
  });

  it("makeRunId returns an unused, filesystem/ref-safe id", () => {
    const id = makeRunId(() => false);
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  it("never returns an id that isTaken reports as taken (uniqueness)", () => {
    const used = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const id = makeRunId((x) => used.has(x));
      expect(used.has(id)).toBe(false);
      used.add(id);
    }
    expect(used.size).toBe(500);
  });

  it("falls back to a suffix when every bare adjective-noun is taken", () => {
    // Treat every plain `adj-noun` (2 parts) as taken; only suffixed ids are free.
    const id = makeRunId((x) => x.split("-").length === 2);
    expect(id.split("-").length).toBe(3); // adjective-noun-<suffix>
    expect(id).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]{2}$/);
  });
});
