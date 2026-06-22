// tests/hub-publish-guards.test.ts
import { describe, it, expect } from "vitest";
import {
  buildPublishRef,
  assertNoHardSecrets,
  collectPublishWarnings,
  runPublishPreflight,
} from "../src/flows/hub/publish-guards.js";

describe("buildPublishRef", () => {
  it("builds a valid community ref", () => {
    expect(buildPublishRef({ handle: "guy", name: "deep-refactor", version: "1.2.0" }))
      .toEqual({ ok: true, ref: "guy@deep-refactor:1.2.0" });
  });
  it("rejects a 1-char name (hub min is 2)", () => {
    const r = buildPublishRef({ handle: "guy", name: "a", version: "1.0.0" });
    expect(r.ok).toBe(false);
  });
  it("rejects a trailing-hyphen name (hub requires alnum end)", () => {
    expect(buildPublishRef({ handle: "guy", name: "my-flow-", version: "1.0.0" }).ok).toBe(false);
  });
  it("rejects a name over 40 chars", () => {
    expect(buildPublishRef({ handle: "guy", name: "a".repeat(41), version: "1.0.0" }).ok).toBe(false);
  });
  it("rejects uppercase in the name", () => {
    expect(buildPublishRef({ handle: "guy", name: "MyFlow", version: "1.0.0" }).ok).toBe(false);
  });
  it("rejects 'latest' and partial semver", () => {
    expect(buildPublishRef({ handle: "guy", name: "x-flow", version: "latest" }).ok).toBe(false);
    expect(buildPublishRef({ handle: "guy", name: "x-flow", version: "1.2" }).ok).toBe(false);
  });
  it("fails fast on an empty handle (no bare-name fallthrough)", () => {
    expect(buildPublishRef({ handle: "", name: "x-flow", version: "1.0.0" }).ok).toBe(false);
  });
  it("rejects '@' or ':' smuggled into name or handle", () => {
    expect(buildPublishRef({ handle: "guy", name: "x@evil", version: "1.0.0" }).ok).toBe(false);
    expect(buildPublishRef({ handle: "g:y", name: "x-flow", version: "1.0.0" }).ok).toBe(false);
  });
});

describe("assertNoHardSecrets", () => {
  it("refuses an AWS key (shared high-precision pattern)", () => {
    expect(assertNoHardSecrets("steps:\n  - run: AKIAABCDEFGHIJKLMNOP\n").length).toBeGreaterThan(0);
  });
  it("refuses a generic OpenAI sk- key the shared scan misses", () => {
    expect(assertNoHardSecrets(`token: sk-${"a".repeat(40)}\n`).length).toBeGreaterThan(0);
  });
  it("refuses a short github_pat the shared scan misses (server matches {22,})", () => {
    expect(assertNoHardSecrets(`pat: github_pat_${"a".repeat(30)}\n`).length).toBeGreaterThan(0);
  });
  it("passes a clean flow", () => {
    expect(assertNoHardSecrets("steps:\n  - run: echo hi\n")).toEqual([]);
  });
});

describe("collectPublishWarnings", () => {
  it("warns on an absolute home-dir path", () => {
    expect(collectPublishWarnings("prompt: open /Users/guy/Programming/secret\n").join(" "))
      .toMatch(/home|\/Users\//i);
  });
  it("warns on an env: ref", () => {
    expect(collectPublishWarnings("key: env:MY_SECRET\n").join(" ")).toMatch(/env:/);
  });
  it("warns on a user:pass@ URL", () => {
    expect(collectPublishWarnings("url: https://bob:hunter2@example.com\n").join(" ")).toMatch(/credential|user/i);
  });
  it("is silent on a clean flow", () => {
    expect(collectPublishWarnings("steps:\n  - run: echo hi\n")).toEqual([]);
  });
});

describe("runPublishPreflight", () => {
  it("refuses when a hard secret is present", () => {
    const r = runPublishPreflight("k: sk-" + "a".repeat(40));
    expect(r.ok).toBe(false);
  });
  it("passes with warnings on a path leak", () => {
    const r = runPublishPreflight("prompt: /Users/guy/x");
    expect(r).toEqual({ ok: true, warnings: expect.arrayContaining([expect.any(String)]) });
  });
});
