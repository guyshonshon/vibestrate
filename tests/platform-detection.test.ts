import { describe, it, expect } from "vitest";
import { isWindows } from "../src/platform/platform.js";

describe("isWindows", () => {
  it("is true on win32", () => {
    expect(isWindows("win32")).toBe(true);
  });

  it("is false on darwin and linux", () => {
    expect(isWindows("darwin")).toBe(false);
    expect(isWindows("linux")).toBe(false);
  });
});
