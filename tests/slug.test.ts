import { describe, it, expect } from "vitest";
import { slugify } from "../src/utils/slug.js";

describe("slugify", () => {
  it("lowercases input", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with dashes", () => {
    expect(slugify("add policy reacceptance")).toBe("add-policy-reacceptance");
  });

  it("strips unsafe characters", () => {
    expect(slugify("foo/bar:baz?qux*")).toBe("foo-bar-baz-qux");
  });

  it("collapses repeated dashes", () => {
    expect(slugify("foo   bar---baz")).toBe("foo-bar-baz");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify("--foo--")).toBe("foo");
  });

  it("truncates to 60 chars and trims trailing dash", () => {
    const input = "a".repeat(80);
    const result = slugify(input);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("-")).toBe(false);
  });

  it("falls back to 'task' on empty input", () => {
    expect(slugify("")).toBe("task");
    expect(slugify("   ")).toBe("task");
    expect(slugify("???")).toBe("task");
  });
});
