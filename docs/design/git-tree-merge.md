# Design: Interactive Git Tree + Supervisor-Assisted Merge

Status: **shipped (0.18.0)** - design of record for behavior now on main.

Authoritative spec + plan (the plan corrects the design as built):

- [`../superpowers/specs/2026-06-21-git-tree-merge-design.md`](../superpowers/specs/2026-06-21-git-tree-merge-design.md)
- [`../superpowers/specs/2026-06-21-git-tree-merge-plan.md`](../superpowers/specs/2026-06-21-git-tree-merge-plan.md)
  (§1 Critical/Hard/Soft corrections, applied during build)

The any-node-to-any-node evolution of the merge advisor
([`merge-advisor.md`](./merge-advisor.md)): the same human-initiated, gated,
reversible safety model, driven from an interactive DAG instead of a per-run list.

## Shape as built

- **Read-only topology** (`getGitGraph`, `src/core/git-history-service.ts`):
  `GitCommit` gained `parents`; `GitGraph` = commits + `branchHeads` (`isMain`
  only for the configured main branch). Edges are implicit in `parents`;
  out-of-set parents render as stubs. Behind `GET /api/project/git/graph`.
- **Merge service** (`src/git/merge-service.ts`): `predictMerge` (scratch
  worktree, always torn down), `applyMerge` (clean), `applyResolvedMerge`
  (human-accepted resolutions), `undoMerge`. Mirrors `integration-service`'s
  reviewed apply/undo template.
- **Conflict resolution** (`src/git/merge-resolve.ts` + `conflict-parser.ts`):
  conflicts are whole-file `<<<<<<<` markers (no hunk format exists); the parser
  is strict (ambiguous -> manual fallback). `proposeResolutions` returns, per
  file, the **full reconstructed file** (`rebuildResolvedFile` splices proposed
  regions back into the original, preserving non-conflict context) - per-hunk text
  alone would truncate the file.
- **UI** (`GitTreePage` + `GitDag`/`MergePlannerPanel`/`ConflictResolver`):
  DAG | inspector | planner+resolver. UI-only (sanctioned CLI-parity exception).

## Safety invariants (load-bearing)

- Apply gates the Action Broker `git.merge` (fail-closed), refuses a non-checked-
  out target (never moves HEAD) and a dirty tree, records `preSha`+`sourceSha`
  **before** the merge (recorded + reversible, not atomic), `--no-ff`, never pushes.
- Undo is a guarded `reset --hard`: refuses on tip-advance, on a merge already
  upstream (best-effort), on drift; identifies a crashed-mid-apply merge by
  sha-exact or **tree-equality** (`git merge-tree --write-tree`), never by parent
  set alone.
- AI resolution refuses secret-like **paths** outright; redacts conflict bodies
  before the provider; resolved writes are symlink-safe (`lstat` + realpath-inside-
  root + `.git` refusal + `O_NOFOLLOW`) and only touch git-reported conflicted paths.
- Dashboard write routes require `VIBESTRATE_API_TOKEN` (mirrors guided merge-to-main).

## Review record

Three write-path adversarial reviews + a 7-dimension multi-agent review (~39
Opus-4.8 agents). Caught + fixed before merge: undo parent-set identity
(data loss) -> tree-equality; `applyResolvedMerge` symlink escape (local RCE) ->
`O_NOFOLLOW`+realpath guard; resolver whole-file truncation (data loss) ->
`rebuildResolvedFile`; already-up-to-date detection via `git status` -> `MERGE_HEAD`.

## Known v1 limitations

Secret/binary/unparseable conflicts are manual-only via this surface; CRLF
normalizes to LF on resolved apply; consult-NL "merge X into Y" pre-fill not
wired (planner is manual); modify/delete conflicts unresolvable here; no
cross-process lock on apply (single-user); push-detection is best-effort.
