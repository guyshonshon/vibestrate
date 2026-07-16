// ── Protected-path matcher (proportional-orchestration.md) ──────────────────
//
// The deterministic floor under every "do less checking" decision. A diff that
// touches a protected path always gets the full check descent: it is never
// inert for validation scoping, and the express flow's review descent
// must run a real review turn. Pure - no I/O, no model judgment; the
// caller supplies the changed paths.
//
// Semantics (locked by the batch design + its adversarial review):
//   - The BUILT-IN set below is the safety default. User config
//     (`policies.protectedPaths`) is ADDITIVE - it can extend protection,
//     never shrink it.
//   - Shrinking requires the explicit `policies.unprotectedPaths` opt-out,
//     which is matched against the path and suppresses BUILT-IN protection
//     only. A user-added protectedPaths glob is never suppressed (delete the
//     entry instead).
//   - Failure direction: a wrong call here can only cause MORE checking
//     (over-protection), never less - mirroring validation-scope.ts.

import { globToRegex } from "../policies/policy-store.js";

/**
 * Built-in protected globs. Conservative, ecosystem-generic. Matched against
 * repo-relative paths (forward slashes, no leading "./").
 */
export const BUILTIN_PROTECTED_GLOBS: readonly string[] = [
  // authn/authz, secrets, money
  "**/auth/**",
  "**/authn/**",
  "**/authz/**",
  "**/security/**",
  "**/secrets/**",
  "**/payment/**",
  "**/payments/**",
  "**/billing/**",
  // schema/data migrations
  "**/migrations/**",
  "**/migration/**",
  // CI / automation entrypoints
  ".github/workflows/**",
  ".gitlab-ci.yml",
  ".circleci/**",
  "Jenkinsfile",
  "azure-pipelines.yml",
  // dependency lockfiles (supply-chain surface)
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
  // env files (should be secret-refused upstream anyway - belt and braces)
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  // Vibestrate's own config/policies - a run editing its own gates is never routine
  ".vibestrate/**",
];

export type ProtectedPathsConfig = {
  /** Additive user globs (config `policies.protectedPaths`). */
  protectedPaths?: readonly string[];
  /** Built-in-only opt-out globs (config `policies.unprotectedPaths`). */
  unprotectedPaths?: readonly string[];
};

export type ProtectedPathMatch = {
  path: string;
  /** The glob that protected it. */
  pattern: string;
  source: "builtin" | "config";
};

export type ProtectedDiffDecision = {
  protected: boolean;
  matches: ProtectedPathMatch[];
};

function normalize(p: string): string {
  let out = p.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  return out.replace(/^\/+/, "");
}

type CompiledMatcher = {
  builtin: { pattern: string; re: RegExp }[];
  config: { pattern: string; re: RegExp }[];
  unprotect: RegExp[];
};

function compile(config?: ProtectedPathsConfig): CompiledMatcher {
  return {
    builtin: BUILTIN_PROTECTED_GLOBS.map((pattern) => ({
      pattern,
      re: globToRegex(pattern),
    })),
    config: (config?.protectedPaths ?? []).map((pattern) => ({
      pattern,
      re: globToRegex(pattern),
    })),
    unprotect: (config?.unprotectedPaths ?? []).map((g) => globToRegex(g)),
  };
}

/** The glob protecting a single path, or null. User globs win the label (they
 *  are immune to the opt-out); built-ins apply unless explicitly opted out. */
export function protectedPathMatch(
  filePath: string,
  config?: ProtectedPathsConfig,
): ProtectedPathMatch | null {
  return matchOne(normalize(filePath), compile(config));
}

function matchOne(
  path: string,
  m: CompiledMatcher,
): ProtectedPathMatch | null {
  for (const { pattern, re } of m.config) {
    if (re.test(path)) return { path, pattern, source: "config" };
  }
  const optedOut = m.unprotect.some((re) => re.test(path));
  if (!optedOut) {
    for (const { pattern, re } of m.builtin) {
      if (re.test(path)) return { path, pattern, source: "builtin" };
    }
  }
  return null;
}

/**
 * Classify a diff's changed paths. `protected` is true when ANY path matches -
 * one protected file protects the whole diff (the floor is per-diff, not
 * per-file, because review/validation decisions are per-run).
 */
export function isProtectedDiff(
  changedPaths: readonly string[],
  config?: ProtectedPathsConfig,
): ProtectedDiffDecision {
  const compiled = compile(config);
  const matches: ProtectedPathMatch[] = [];
  for (const p of changedPaths) {
    const hit = matchOne(normalize(p), compiled);
    if (hit) matches.push(hit);
  }
  return { protected: matches.length > 0, matches };
}
