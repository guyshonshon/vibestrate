import { describe, expect, it } from "vitest";
import { cheapEffort, trimForRanking } from "../src/consult/codebase-search.js";

describe("cheapEffort", () => {
  it("skips 'minimal' (too weak for reliable JSON) and floors at the next level", () => {
    expect(cheapEffort(["minimal", "low", "medium", "high", "xhigh"], null)).toBe("low");
  });
  it("uses the lowest level when 'minimal' is absent (e.g. claude)", () => {
    expect(cheapEffort(["low", "medium", "high", "xhigh", "max"], null)).toBe("low");
  });
  it("falls back when a provider exposes no effort levels", () => {
    expect(cheapEffort([], "high")).toBe("high");
    expect(cheapEffort(undefined, null)).toBe(null);
  });
  it("returns the only level even if it is 'minimal'", () => {
    expect(cheapEffort(["minimal"], null)).toBe("minimal");
  });
});

describe("trimForRanking", () => {
  it("drops generated/lock/minified/snapshot noise", () => {
    const { paths } = trimForRanking([
      "src/app.ts",
      "pnpm-lock.yaml",
      "package-lock.json",
      "docs/generated/cli.json",
      "dist/bundle.js",
      "web/app.min.js",
      "web/app.js.map",
      "tests/__snapshots__/x.snap",
      "src/core/thing.ts",
    ]);
    expect(paths).toEqual(["src/app.ts", "src/core/thing.ts"]);
  });
  it("caps the list and flags truncation", () => {
    const many = Array.from({ length: 900 }, (_, i) => `src/f${i}.ts`);
    const { paths, truncated } = trimForRanking(many);
    expect(paths.length).toBe(700);
    expect(truncated).toBe(true);
  });
  it("keeps a small clean list intact", () => {
    const { paths, truncated } = trimForRanking(["a.ts", "b.ts"]);
    expect(paths).toEqual(["a.ts", "b.ts"]);
    expect(truncated).toBe(false);
  });
});
