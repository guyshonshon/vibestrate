// Architecture scope gate. The architect already declares, in prose, exactly
// which paths the implementer may touch ("May create/edit: package.json,
// server.js, public/*, README.md"). Nothing read it. Measured across this
// project's own benchmark: three of three orchestrated runs created a
// `test/api.test.js` that was NOT on their architect's allowlist - and whose
// architect had explicitly written that no test framework was in scope. An
// upstream step ruled the work out and the downstream step did it anyway.
//
// This turns that prose into a checked contract, using the same shape as the
// `block` policy tier: a DETERMINISTIC merge-cap over the run's changed files,
// never a model verdict (a model in the merge path can brick a legitimate
// merge; a glob caps exactly what it matches).
//
// Fail-open on ABSENCE, and deliberately so: a flow with no architecture step,
// or an architect that declared no scope, has nothing to violate. Capping those
// would break every flow that does not happen to have an architect. Absence is
// not a violation - it is silence.
import { globToRegex } from "../policies/policy-store.js";

/** The path contract an architect declares for the seats downstream of it. */
export type DeclaredScope = {
  /** Globs the implementer may create or edit. Empty = no allowlist declared. */
  mayEdit: readonly string[];
  /** Globs it must not touch even if they match `mayEdit`. */
  mayNotEdit: readonly string[];
};

export type ScopeViolation = {
  file: string;
  reason: "not-in-allowlist" | "explicitly-forbidden";
  /** The `mayNotEdit` glob that matched, for an explicitly-forbidden file. */
  glob: string | null;
};

export type ScopeGateResult = {
  /** True when nothing violated the declared scope (including "none declared"). */
  clean: boolean;
  /** Whether the architect actually declared a scope at all. */
  declared: boolean;
  violations: ScopeViolation[];
  /** Globs that could not be compiled - fail-open, surfaced, never a crash. */
  inert: { glob: string; reason: string }[];
};

/**
 * Generated files no author writes by hand. A lockfile appears in the diff
 * because `npm install` ran, not because the implementer chose to edit it, so
 * capping a merge over one punishes the architect for an omission rather than
 * the implementer for a violation. Narrow and explicit on purpose - this is the
 * only exemption, and it is listed rather than inferred.
 */
const GENERATED_PATHS = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "npm-shrinkwrap.json",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "go.sum",
]);

function compile(
  globs: readonly string[],
  inert: { glob: string; reason: string }[],
): RegExp[] {
  const out: RegExp[] = [];
  for (const g of globs) {
    try {
      out.push(globToRegex(g));
    } catch (err) {
      inert.push({
        glob: g,
        reason: err instanceof Error ? err.message : "glob did not compile",
      });
    }
  }
  return out;
}

/**
 * Pure. Check a run's changed files against the scope its architect declared.
 *
 * An empty `mayEdit` means no allowlist was declared, so only `mayNotEdit` is
 * enforced. Both empty means nothing was declared and the gate is silent.
 */
export function evaluateScope(
  scope: DeclaredScope | null | undefined,
  changedFiles: readonly string[],
): ScopeGateResult {
  const inert: { glob: string; reason: string }[] = [];
  const mayEdit = scope?.mayEdit ?? [];
  const mayNotEdit = scope?.mayNotEdit ?? [];
  const declared = mayEdit.length > 0 || mayNotEdit.length > 0;
  if (!declared) return { clean: true, declared: false, violations: [], inert };

  const allow = compile(mayEdit, inert);
  const denyGlobs = mayNotEdit.filter((g) => {
    try {
      globToRegex(g);
      return true;
    } catch {
      return false;
    }
  });
  const deny = compile(mayNotEdit, inert);

  const violations: ScopeViolation[] = [];
  for (const raw of changedFiles) {
    const file = raw.replace(/^\.\//, "").replace(/\\/g, "/");
    if (!file) continue;

    const denyHit = deny.findIndex((re) => re.test(file));
    if (denyHit >= 0) {
      violations.push({
        file,
        reason: "explicitly-forbidden",
        glob: denyGlobs[denyHit] ?? null,
      });
      continue;
    }
    if (GENERATED_PATHS.has(file)) continue;
    // An allowlist only bites when one was declared; `mayNotEdit` alone is a
    // denylist and must not turn every other file into a violation.
    if (allow.length === 0) continue;
    if (!allow.some((re) => re.test(file))) {
      violations.push({ file, reason: "not-in-allowlist", glob: null });
    }
  }
  return { clean: violations.length === 0, declared: true, violations, inert };
}

/**
 * Pure. Render the architect's declared scope for a code-WRITING turn, so the
 * seat that can still stay inside it is told what it is. Returns null when
 * nothing was declared, so the turn is byte-identical to before.
 *
 * Capping at the merge gate alone means the run is already paid for before
 * anyone learns the boundary was crossed. This is the same lesson the advise
 * policies taught: a rule the writer never sees is a rule that gets violated
 * and then expensively removed.
 */
export function renderScopeBlock(scope: DeclaredScope | null | undefined): string | null {
  const mayEdit = scope?.mayEdit ?? [];
  const mayNotEdit = scope?.mayNotEdit ?? [];
  if (mayEdit.length === 0 && mayNotEdit.length === 0) return null;
  const lines: string[] = [
    "Path scope for this change, declared by the architecture step and checked against your actual diff at the merge gate:",
  ];
  if (mayEdit.length > 0) {
    lines.push(`- You may create or edit only: ${mayEdit.join(", ")}`);
    lines.push(
      "- A file you change outside that list caps merge-readiness. If the task genuinely needs one, say so in your summary rather than adding it quietly.",
    );
  }
  if (mayNotEdit.length > 0) {
    lines.push(`- You must not touch: ${mayNotEdit.join(", ")}`);
  }
  return lines.join("\n");
}
