import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  renderFormula,
  nodeFloorFrom,
  fetchPublished,
  sha256Of,
} from "../scripts/update-homebrew-formula.js";

/**
 * The Homebrew formula is rendered from what npm actually served.
 *
 * A formula whose `sha256` does not match the tarball fails on a user's
 * machine, after `brew install` has already downloaded it - so the digest is
 * taken from the published bytes rather than a local `npm pack`, which produces
 * a different one the moment anything about the pack differs.
 */
const TEMPLATE = readFileSync("packaging/homebrew/vibestrate.rb.tmpl", "utf8");

describe("rendering the formula", () => {
  const rendered = renderFormula(TEMPLATE, {
    url: "https://registry.npmjs.org/vibestrate/-/vibestrate-9.9.9.tgz",
    sha256: "a".repeat(64),
    nodeFloor: 24,
  });

  it("leaves no placeholder behind", () => {
    // A formula shipped with `__SHA256__` in it installs nothing and reads like
    // a typo rather than a broken release, so this fails loudly instead.
    expect(rendered).not.toMatch(/__[A-Z0-9_]+__/);
  });

  it("refuses to render when a placeholder has no value", () => {
    expect(() =>
      renderFormula("url \"__URL__\"\nsha256 \"__SHA256__\"", {
        url: "u",
        sha256: "s",
        nodeFloor: 24,
      }),
    ).not.toThrow();
    expect(() =>
      renderFormula("url \"__URL__\"\nmystery \"__NOT_PROVIDED__\"", {
        url: "u",
        sha256: "s",
        nodeFloor: 24,
      }),
    ).toThrow(/placeholder/);
  });

  it("carries both published bins into the test block", () => {
    // Two bins ship; a broken symlink for the alias is invisible if only the
    // primary is exercised.
    expect(rendered).toContain("#{bin}/vibe --version");
    expect(rendered).toContain("#{bin}/vibestrate --version");
  });

  it("declares a node dependency that satisfies engines.node", () => {
    const floor = nodeFloorFrom(readFileSync("package.json", "utf8"));
    expect(floor).toBeGreaterThanOrEqual(18);
    // Unversioned `node` tracks current, which satisfies any floor we ship;
    // a pinned `node@N` breaks when that keg leaves homebrew-core.
    expect(rendered).toContain('depends_on "node"');
    expect(rendered).toContain(`">=${floor}"`);
  });

  it("reads the floor from engines.node, not a second copy of the number", () => {
    expect(nodeFloorFrom('{"engines":{"node":">=24"}}')).toBe(24);
    expect(nodeFloorFrom('{"engines":{"node":"^26.1.0"}}')).toBe(26);
    expect(() => nodeFloorFrom('{"engines":{}}')).toThrow(/engines.node/);
  });
});

describe("reading what npm published", () => {
  it("refuses a version npm does not have, rather than rendering a broken formula", async () => {
    const notFound = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    await expect(fetchPublished("0.0.0-nope", notFound)).rejects.toThrow(/no vibestrate@/);
  });

  it("takes the tarball url from the packument", async () => {
    const fake = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ dist: { tarball: "https://example.test/x.tgz" } }),
    })) as unknown as typeof fetch;
    await expect(fetchPublished("1.2.3", fake)).resolves.toEqual({
      tarball: "https://example.test/x.tgz",
    });
  });

  it("hashes the bytes it downloaded", async () => {
    const body = new TextEncoder().encode("hello");
    const fake = (async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => body.buffer,
    })) as unknown as typeof fetch;
    // sha256("hello"), so this pins the algorithm rather than just "some hex".
    await expect(sha256Of("https://example.test/x.tgz", fake)).resolves.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});
