import { describe, it, expect } from "vitest";
import {
  isProtectedDiff,
  protectedPathMatch,
  BUILTIN_PROTECTED_GLOBS,
} from "../src/supervisor/protected-paths.js";
import { classifyChangedFilesForValidation } from "../src/core/validation/validation-scope.js";

describe("protected-paths - built-in floor", () => {
  it.each([
    "src/auth/login.ts",
    "lib/payments/charge.py",
    "db/migrations/0042_add_users.sql",
    ".github/workflows/release.yml",
    "pnpm-lock.yaml",
    ".env.production",
    "packages/api/.env",
    ".vibestrate/policies/actions.yml",
  ])("protects %s out of the box", (p) => {
    expect(protectedPathMatch(p)).not.toBeNull();
    expect(isProtectedDiff([p]).protected).toBe(true);
  });

  it.each(["src/utils/format.ts", "README.md", "docs/guide.txt", "src/app.tsx"])(
    "leaves %s unprotected",
    (p) => {
      expect(protectedPathMatch(p)).toBeNull();
    },
  );

  it("one protected file protects the whole diff", () => {
    const d = isProtectedDiff(["README.md", "src/auth/session.ts", "docs/a.md"]);
    expect(d.protected).toBe(true);
    expect(d.matches).toHaveLength(1);
    expect(d.matches[0]).toMatchObject({
      path: "src/auth/session.ts",
      source: "builtin",
    });
  });

  it("normalizes ./ prefixes and backslashes", () => {
    expect(protectedPathMatch("./src/auth/x.ts")).not.toBeNull();
    expect(protectedPathMatch("src\\auth\\x.ts")).not.toBeNull();
  });
});

describe("protected-paths - user config semantics", () => {
  it("user globs are additive", () => {
    const cfg = { protectedPaths: ["docs/runbooks/**"] };
    expect(protectedPathMatch("docs/runbooks/failover.md", cfg)).toMatchObject({
      source: "config",
    });
    // built-ins still apply
    expect(protectedPathMatch("src/auth/x.ts", cfg)).not.toBeNull();
  });

  it("unprotectedPaths suppresses built-ins only", () => {
    const cfg = {
      protectedPaths: ["fixtures/auth/**"],
      unprotectedPaths: ["fixtures/auth/**", "src/auth/**"],
    };
    // built-in suppressed by explicit opt-out
    expect(protectedPathMatch("src/auth/sample.ts", cfg)).toBeNull();
    // user-added protection is immune to the opt-out
    expect(protectedPathMatch("fixtures/auth/x.ts", cfg)).toMatchObject({
      source: "config",
    });
  });

  it("empty config changes nothing", () => {
    expect(isProtectedDiff(["src/auth/a.ts"], {}).protected).toBe(true);
  });
});

describe("protected-paths x validation scoping (A2 floor under B3)", () => {
  const isProtected = (p: string) => protectedPathMatch(p) !== null;

  it("a protected inert-extension file still validates", () => {
    // .md is on the inert allowlist, but a workflow .yml dir is protected -
    // use a protected .md to prove protection beats inertness.
    const d = classifyChangedFilesForValidation(
      [".vibestrate/skills/notes.md"],
      { isProtected },
    );
    expect(d.allInert).toBe(false);
    expect(d.nonInert).toEqual([".vibestrate/skills/notes.md"]);
  });

  it("an unprotected docs diff still scopes (B3 unchanged)", () => {
    const d = classifyChangedFilesForValidation(["docs/a.md", "README.md"], {
      isProtected,
    });
    expect(d.allInert).toBe(true);
  });

  it("without the option the classifier behaves exactly as before", () => {
    const d = classifyChangedFilesForValidation([".vibestrate/skills/notes.md"]);
    expect(d.allInert).toBe(true);
  });
});

describe("built-in glob list sanity", () => {
  it("compiles every glob", () => {
    // globToRegex throwing on any entry would break protection silently.
    for (const g of BUILTIN_PROTECTED_GLOBS) {
      expect(() => protectedPathMatch("x", { protectedPaths: [g] })).not.toThrow();
    }
  });
});
