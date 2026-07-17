// Proportional validation scoping (proportional-orchestration.md).
//
// The orchestrator should not run a project's code checks (tests, typecheck,
// lint) for a change that is only documentation/text/assets. This module makes
// that call from the ACTUAL changed files (never the task text), with a
// deliberately FAIL-SAFE design adopted from the adversarial review:
//
//   - We do NOT denylist "code" extensions. We ALLOWLIST a small set of
//     provably-inert extensions. Anything not on the allowlist - source code,
//     `.json` (could be package.json scripts), `.yaml` (could be CI/k8s),
//     `.sql` (could be a migration), an unknown extension, or a file with no
//     extension - is treated as code-class and still validates.
//   - A change must touch at least one file and EVERY changed file must be inert
//     before validation is skipped. One non-inert file -> validate everything.
//
// So a misjudgment can only ever cause MORE validation than necessary, never
// less. The inverse (skipping a check on real code) is structurally impossible
// here as long as the allowlist contains only genuinely inert file types.

// Provably-inert file extensions: prose, plaintext, and binary assets that no
// code-validation command (test/typecheck/lint) meaningfully covers. Kept
// deliberately small and conservative; add to it only when a type is genuinely
// behavior-free. (Note: `.mdx` is intentionally absent - it can embed JS/JSX.)
const INERT_EXTENSIONS: ReadonlySet<string> = new Set([
  // prose / text
  ".md",
  ".markdown",
  ".rst",
  ".txt",
  ".text",
  ".adoc",
  // images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".bmp",
  ".avif",
  // fonts
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
]);

export type ValidationScopeDecision = {
  /** Total number of changed files considered. */
  changedFileCount: number;
  /** Changed files classified as provably-inert. */
  inert: string[];
  /** Changed files that are NOT provably-inert (code-class; force validation). */
  nonInert: string[];
  /**
   * True only when there is at least one changed file and every one of them is
   * inert. This is the only condition under which configured validation may be
   * skipped.
   */
  allInert: boolean;
};

export type ValidationScopeOptions = {
  /**
   * Protected-path floor (protected-paths.ts): when provided, a path this returns true for
   * is NEVER inert, whatever its extension - a protected `.md` (e.g. under
   * `.github/workflows/` or a user-protected dir) still validates. Optional so
   * the classifier stays pure and the caller owns the config.
   */
  isProtected?: (path: string) => boolean;
};

/** Lowercased extension (including the dot) of a path's basename, or null when
 *  the basename has no real extension (no dot, or a leading-dot dotfile like
 *  `.gitignore`). A null extension is treated as non-inert (fail-safe). */
function extensionOf(filePath: string): string | null {
  const base = filePath.split("/").pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  // dot <= 0 covers both "no dot" and a leading-dot dotfile (".gitignore" -> 0).
  if (dot <= 0) return null;
  return base.slice(dot).toLowerCase();
}

/** A path is inert only if its extension is on the explicit allowlist. */
export function isInertPath(filePath: string): boolean {
  const ext = extensionOf(filePath);
  return ext !== null && INERT_EXTENSIONS.has(ext);
}

/**
 * Classify a run's changed-file paths for validation scoping. Pure: no I/O.
 */
export function classifyChangedFilesForValidation(
  paths: readonly string[],
  opts?: ValidationScopeOptions,
): ValidationScopeDecision {
  const inert: string[] = [];
  const nonInert: string[] = [];
  for (const p of paths) {
    if (isInertPath(p) && !opts?.isProtected?.(p)) inert.push(p);
    else nonInert.push(p);
  }
  return {
    changedFileCount: paths.length,
    inert,
    nonInert,
    allInert: paths.length > 0 && nonInert.length === 0,
  };
}
