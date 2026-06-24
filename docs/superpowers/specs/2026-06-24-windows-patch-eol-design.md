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

### New module: `src/git/patch-eol.ts`

One pure, isolated function:

```
normalizePatchEol(patchText: string, worktreePath: string): Promise<string>
```

Returns a patch whose every file section's line terminators match that target
file's dominant EOL, so a subsequent strict `git apply` both matches context and
writes EOL-consistent results.

Algorithm:

1. Split `patchText` into per-file sections. A unified diff delimits files by
   `diff --git a/… b/…` headers when present, otherwise by `--- ` / `+++ ` header
   pairs. Each section carries its own header + hunks.
2. Resolve each section's target path from the `+++ b/<path>` header (strip the
   `b/` prefix; `+++ /dev/null` means a deletion - resolve from `--- a/<path>`).
3. Detect the target file's dominant EOL by reading it from `worktreePath`:
   CRLF if the content contains any `\r\n`, else LF. (Same rule as
   `conflict-parser.ts`; extract a shared `dominantEol(content)` helper so the
   two callers cannot drift.)
4. Rewrite that section's line terminators to the detected EOL. Structural lines
   (`diff --git`, `index`, `---`, `+++`, `@@`, and each ` `/`+`/`-` body line) all
   take the target EOL.
5. Reassemble sections in original order and return.

### Edge cases (each gets a dedicated unit test)

- **`\ No newline at end of file`**: the preceding content line keeps no trailing
  terminator; the marker line itself is normalized but does not cause a newline
  to be synthesized on the content line.
- **New file** (`--- /dev/null`): no existing file to detect against; the section
  is left byte-for-byte unchanged. It applies cleanly regardless (nothing to
  mismatch), matching git's own behavior. (Decision below.)
- **Deleted file** (`+++ /dev/null`): detect EOL from the existing `--- a/<path>`
  source file (its context must match what is on disk).
- **Binary hunks** (`Binary files a/x and b/x differ`, or `GIT binary patch`):
  left untouched - never rewrite binary content.
- **Multi-file patch**: each section resolved and normalized independently; files
  may legitimately have different dominant EOLs.
- **Missing target file** (patch references a path not on disk): leave the section
  unchanged and let the strict `git apply --check` produce its normal rejection -
  the normalizer never invents content or silences a real mismatch.

### Integration points

Normalize immediately before the strict apply, at each call site, forward and
reverse:

- `review-suggestion-service.ts` `apply()` - normalize `current.proposedPatch`
  before `git apply --check` (~L426). Persist the **normalized** text as the
  `*-applied.patch` / `*-reverse.patch` artifacts so revert stays consistent.
- `review-suggestion-service.ts` revert path (`git apply -R`, ~L853/878) -
  re-normalize against the current worktree before the reverse apply.
- `suggestion-bundle-service.ts` bundle apply (`--check` loop ~L501, apply loop) -
  normalize each patch before its check + apply.

Strict apply (`--check` then apply, `--whitespace=nowarn`, no
`--ignore-whitespace`) is preserved everywhere. Normalization only changes line
terminators; if the patch still doesn't match (a genuine content mismatch), the
strict apply rejects exactly as today.

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

- **Unit** (`patch-eol.test.ts`): the full EOL matrix (LF/CRLF file x LF/CRLF
  patch x match/mismatch), plus every edge case above. Assert the normalized
  patch's per-section EOL and that structure is preserved.
- **Integration** (through the real services, temp git repo): apply a cross-EOL
  patch end-to-end; assert (a) it applies, (b) the resulting file is
  EOL-consistent (no mixed terminators), (c) revert restores the original bytes.
- Regression: existing LF-only fixtures keep passing unchanged (normalization is
  a no-op when patch EOL already equals file EOL).

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
