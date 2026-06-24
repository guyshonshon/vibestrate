# Windows patch-apply EOL robustness - design

- Date: 2026-06-24
- Status: approved (brainstorm), pending plan
- Area: `src/git/`, `src/reviews/` (suggestion + bundle apply paths)
- Origin: deferred follow-up of E1 (Windows support) in `docs/TODO.md` -
  "real-world `autocrlf=true` robustness for end users (patch-apply under CRLF)".

## Problem

Vibestrate applies AI-proposed patches with a strict
`git apply --check --whitespace=nowarn` -> `git apply --whitespace=nowarn`
(piped via stdin) in
[`review-suggestion-service.ts`](../../../src/reviews/review-suggestion-service.ts)
and
[`suggestion-bundle-service.ts`](../../../src/reviews/suggestion-bundle-service.ts).

`git apply` matches a patch's context lines against the working-tree file
**byte for byte**, including the line terminator. When the patch's line endings
differ from the target file's, the behavior depends entirely on `core.autocrlf`:

Empirical matrix (reproduced 2026-06-24, `autocrlf=false` repo):

| Case | Current flags | `--ignore-whitespace` | `-c core.autocrlf=true` |
|------|---------------|-----------------------|--------------------------|
| EOL match (LF/LF or CRLF/CRLF) | applies | applies | corrupts clean LF -> CRLF |
| EOL mismatch (LF patch / CRLF file, or CRLF patch / LF file) | **rejects** | applies but writes **mixed-EOL** file | rejects or mixed |

`autocrlf=true` was found to be the *robust* configuration (git normalizes both
directions). The real break is **EOL mismatch under `autocrlf=false`**, in both
directions:

- LF patch against a CRLF-committed file (Windows team, `autocrlf=false`).
- CRLF patch against an LF file.

Both currently produce a clean rejection - safe, but a legitimate edit silently
fails to auto-apply in the core review loop. The obvious "fix" `--ignore-whitespace`
is a trap: it applies the patch but writes the changed line with the *patch's*
EOL into a file of the *other* EOL, producing a mixed-line-ending file. Silent
corruption of a user's working tree is strictly worse than a clean refusal.

CI never exercises this: `ci-windows.yml` and `ci.yml` both force
`core.autocrlf=false`, and checkouts are LF, so a CRLF working tree never occurs.

## Goal

Make a legitimate cross-EOL patch apply **cleanly and EOL-consistently**, while
preserving the invariant that the worst case is a clean refusal, never
corruption. Close the coverage gap so the EOL-mismatch path is tested.

## Non-goals

- No change to `core.autocrlf` detection or to git config. We never run
  `git apply` under a forced `-c core.autocrlf=*` (it corrupts the clean case).
- We never add `--ignore-whitespace` (the corruption vector).
- The merge-resolve / `applyResolvedMerge` path is **out of scope**: it writes
  whole files via `fs.writeFile` and uses `git merge`, not `git apply`, and
  already rebuilds files to their dominant EOL
  ([`conflict-parser.ts:142`](../../../src/git/conflict-parser.ts)).
- New-file sections are left as-is (see Decisions).

## Design

Two safety properties, together:

1. **Content bytes are never altered - only inter-line terminators.** The
   normalizer detects the patch's *own* terminator from its first (structural)
   line, then `split(from).join(target)`. It never inspects or rewrites line
   content, so a CR that is part of a hunk line's content is preserved, not
   mistaken for a terminator. (An earlier draft used a global
   `replace(/\r\n/g,"\n").replace(/\n/g,target)` that silently dropped a content
   CR while still passing `--check` - caught in adversarial review and
   regression-tested.)
2. **Normalize only on the failure path, double-guarded by `git apply --check`.**
   A patch that already applies is never touched (zero regression). The
   normalizer runs only after a patch has *already failed* `--check`, and its
   output must pass a *fresh* `--check` before we apply it - so an incomplete
   normalization falls back to the clean refusal, never a corrupt write.

Together these keep the normalizer tiny instead of special-casing every diff
shape.

### New module: `src/git/patch-eol.ts`

```
dominantEol(content: string): "\r\n" | "\n"
normalizePatchEol(patch: string, worktreePath: string): Promise<string>
resolveApplicablePatch(patch, worktreePath, applyArgs?): Promise<
  { patch: string } | { ok: false; reason: string }>
```

- `dominantEol` - CRLF if the content has any `\r\n`, else LF. Local to this
  module (the `conflict-parser.ts` one-liner is left as-is; not worth the cross-
  module coupling).
- `normalizePatchEol` - collect the source-side paths the patch references
  (`--- a/<path>` / `diff --git` headers, skipping `/dev/null`), resolve them
  under `worktreePath` (path-guarded: reads stay inside the worktree), read the
  on-disk files, detect each dominant EOL. If the touched files share a single
  EOL, rewrite the **whole** patch's line terminators to it
  (`patch.replace(/\r\n/g,"\n").replace(/\n/g, eol)`) and return it; otherwise
  (no readable target, or mixed EOLs across files) return the patch unchanged.
- `resolveApplicablePatch` - run `git apply --check` on the patch as-is; if it
  passes, return it untouched. Only on failure, compute `normalizePatchEol`; if
  it differs and passes a fresh `--check`, return the normalized text; else
  return the original `--check` failure reason. This is the single helper all
  call sites use.

Edge cases (binary hunks, `\ No newline at end of file`, mixed multi-file EOL,
missing files) need **no bespoke handling**: if normalization doesn't yield a
check-clean patch, we refuse - same as today, never corrupt. New-file-only
patches already pass the first `--check`, so they're returned untouched.

### Integration points

Replace the existing `git apply --check` at each call site with
`resolveApplicablePatch`, forward and reverse:

- `review-suggestion-service.ts` `apply()` (~L426) - on a usable result, apply
  the **returned** text and persist *that* as the `*-applied.patch` /
  `*-reverse.patch` artifacts so revert stays consistent; on `{ok:false}`, the
  existing `markFailed` with the returned reason.
- `review-suggestion-service.ts` revert path (`git apply -R`, ~L853) - same
  helper with `applyArgs:["-R"]`.
- `suggestion-bundle-service.ts` bundle apply (`--check` loop ~L501) - resolve
  each patch; apply the returned text.

Strict apply (`--whitespace=nowarn`, never `--ignore-whitespace`, never forced
`-c core.autocrlf`) is preserved everywhere.

## Decisions

- **New-file EOL = leave as-is.** New-file sections apply cleanly without
  normalization; forcing an EOL would require repo-EOL sampling and a guess.
  Lowest risk, matches git. (User-approved 2026-06-24.)
- **Scope = full fix + tests** (vs. fail-fast-only or coverage-only).
  (User-approved 2026-06-24.)

## Testing

The coverage gap is closed **OS-independently**: fixtures construct CRLF
working-tree files explicitly, so the EOL-mismatch path runs on Ubuntu CI too -
no dependency on `ci-windows.yml`.

- **Unit** (`tests/patch-eol.test.ts`, real temp git repos via `execa`): the EOL
  matrix (LF/CRLF file x LF/CRLF patch x match/mismatch) through
  `resolveApplicablePatch` + a real `git apply`. Assert each mismatch case (a)
  becomes applicable, (b) applies to an EOL-consistent file (no mixed
  terminators), and (c) reverse-applies back to the original bytes. Assert
  matching cases are returned byte-identical (no-op) and a genuinely
  non-applying patch still returns `{ok:false}`.
- Regression: existing apply/bundle tests keep passing unchanged (the new helper
  is a pure superset - identical behavior whenever the first `--check` passes).

## Security notes

- Worktree-bounded: the normalizer only reads files under the run worktree
  (path-guarded by the existing `checkPatchSafety` that runs before apply); it
  writes nothing itself.
- No new secret-exposure surface: it manipulates line terminators only, never
  logs patch content.
- Fail-closed preserved: strict `git apply --check` remains the authority. The
  normalizer can only make a *valid* patch apply consistently; it cannot make an
  invalid or unsafe patch apply.

## Risks / limitations

- Diff-splitting must handle both `diff --git`-prefixed and bare unified diffs;
  malformed headers fall through to "leave section unchanged" so the strict apply
  still gates them.
- The "No newline at EOF" marker is the fiddliest case; it is explicitly tested.
- Reachability of the underlying bug in practice is unproven (no field data);
  the fix is still correct and the tests document the contract regardless.

## Rollout

- Branch `feat/windows-patch-eol` off `main`.
- `pnpm typecheck && pnpm test && pnpm build`, plus the new EOL test suites.
- Independent adversarial review before merge (write-path to user repos).
- CHANGELOG entry + version bump; tick the E1 follow-up in `docs/TODO.md`.
