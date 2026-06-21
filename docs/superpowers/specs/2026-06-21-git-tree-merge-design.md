# Git Tree + Supervisor-Assisted Merge - Design

- Date: 2026-06-21
- Status: Draft (brainstormed; pending spec review -> implementation plan)
- Surface: UI-first (the interactive tree has no CLI/TUI equivalent; underlying
  git ops remain plain-git)

## Summary

An interactive git surface in the dashboard: branches and commits drawn as an
explorable DAG, where the human selects a **source** node and a **target** node,
sees a **predicted** post-merge tree plus any conflicts **before** anything is
applied, and, on conflicts, has the **supervisor** (local provider, the same
assist path `shapeAssist` uses) propose per-hunk resolutions to review, edit, and
accept. Every merge is **human-initiated**, applied only on an explicit click (or
an explicit "merge X into Y" instruction the human still confirms), executed in a
throwaway worktree first, audited, and **one-click reversible**.

This is the interactive, any-node-to-any-node evolution of the existing
merge-advisor (`MergePage`, `docs/design/merge-advisor.md`), not a parallel
surface.

## Decisions (locked in brainstorming)

1. **Autonomy:** human-initiated, never automatic. The supervisor predicts,
   surfaces conflicts, and proposes resolutions; it never commits or merges on
   its own. Honors the repo's `No auto-merge` invariant.
2. **Scope:** full vision in v1 - all three layers, including AI conflict
   resolution.
3. **Apply + Undo:** every applied merge records the pre-merge SHA of the target
   branch; an "Undo merge" resets the branch back to it. Safe while the merge
   commit has not been pushed or built upon.
4. **UI-first:** the interactive experience is UI-only by nature; CLI/TUI parity
   is a sanctioned exception here.

## Non-goals (v1)

- No rebase, squash, cherry-pick, amend, or any history rewrite. **Merges only**
  (`--no-ff` merge commits), which is what keeps Undo a simple reset.
- No auto-merge, no auto-apply, no push. Apply is always an explicit human click.
- No force operations.
- No multi-repo / submodule handling.
- No CLI/TUI version of the interactive canvas.

## Architecture

One surface (`GitTreePage`, evolving the current `GitPage`). The merge-advisor
hub becomes the merge affordance reachable from the tree rather than a separate
page. Three layers, all reusing existing building blocks:

- `git-history-service` - extended from a linear `getGitHistory` log to real
  branch **topology** (commits + parents + branch heads).
- `src/git/git.ts` - `mergeNoCommit` (already returns `conflictedFiles`),
  `createWorktree`, `abortMerge`, `removeWorktree`, `currentHeadSha`.
- `assist-runner` - local-provider, secret-redacted single calls (the
  `shapeAssist` pattern) for conflict-resolution proposals.

### Layer 1 - Interactive DAG (read-only)

- **Data:** a `GitGraph` DTO: nodes (`commit` with sha/parents/author/subject;
  `branchHead` refs), edges (parent links), and which branches are this product's
  run-branches vs `main`. Bounded (configurable max nodes; collapse old history).
- **Interactions:** pan/zoom; click a node -> inspector (commit detail or branch
  head); run-branches and `main` highlighted. No writes.

### Layer 2 - Merge planner (predict, then apply)

- **Select** source node -> target node.
- **Predict (dry-run):** server adds a **scratch worktree** checked out at the
  target ref, runs `mergeNoCommit(source)` there, and returns
  `{ clean | conflicts: { file, hunks }[] }` plus the would-be merge-commit shape
  for the predicted-graph overlay. The scratch worktree is always removed after.
- **Apply (explicit):** performs the real `--no-ff` merge on the target branch
  (or, when resolved, commits the resolved tree), **after** recording the
  target's pre-merge SHA. Atomic; audited.
- **Undo:** `reset --hard <pre-merge-sha>` on the target branch, guarded: refused
  if the merge commit was pushed or has descendants/build-on (detected via
  rev-list); the UI explains why when refused.

### Layer 3 - Supervisor conflict resolution

- For a predicted conflict, the human can ask the supervisor to propose
  resolutions. Each conflicted hunk goes to the `assist-runner` (redacted) with
  ours/theirs/base context; it returns a proposed merged hunk + a one-line
  rationale.
- The human reviews a **3-way view** (ours / theirs / proposed), and
  accepts / edits / rejects **per hunk**.
- Accepted resolutions are written into the **scratch worktree** only. The merge
  becomes applicable once no conflict markers remain. The supervisor never
  commits; Apply is still a human click.

## Safety model (load-bearing)

Maps directly onto the repo's V0/V1 invariants:

- **Worktree-bounded:** all trial merges and all AI-written resolutions happen in
  a scratch worktree under the project root. Real branches are read-only until
  Apply. Scratch worktrees are always cleaned up (success or failure).
- **Explicit + narrow + audited:** Apply/Undo are explicit human actions, scoped
  to one source->target, written to the action/audit log with the SHAs involved.
- **Revertable:** pre-merge SHA recorded; Undo is a guarded reset. v1's
  merges-only rule is what makes this sound.
- **Secret-safe:** conflict bodies and proposed resolutions pass through the
  `redactSecretsInText` step before reaching the provider; bodies are never
  written to logs/artifacts/reports. `.env`-shaped or secret-shaped conflicted
  files are refused for AI resolution (manual only), consistent with the diff
  safety model.
- **Fail closed:** dirty target worktree, in-progress merge, missing branch, or a
  provider error abort with a clear message and leave no partial state on a real
  branch.

## Supervisor natural-language path

"merge feat/x into main" through the consult dock resolves the refs and **opens
the planner pre-filled** with that merge (prediction + conflicts). The supervisor
proposes; the human still confirms and clicks Apply. NL never executes a merge.
(If a ref is ambiguous/missing, it explains rather than guessing.)

## Components

- **Server**
  - `git-merge-service` (new): `predictMerge`, `proposeResolutions`,
    `applyMerge`, `undoMerge` - all scratch-worktree-based, audited.
  - `git-history-service` (extend): `getGitGraph` topology.
  - routes (extend `routes/git.ts` or new `routes/git-tree.ts`): graph (GET),
    predict (POST), propose-resolutions (POST), apply (POST), undo (POST).
    Write routes follow the project-root/worktree guard + audit conventions.
- **Client**
  - `GitTreePage`: canvas (DAG) + inspector + merge planner panel + 3-way
    conflict resolver.
  - `api` methods mirroring the routes.
- **Provider:** `assist-runner` for resolutions (fake provider in tests).

## Data flow

1. `GET graph` -> render DAG.
2. Select source/target -> `POST predict` (scratch worktree dry-run) -> show
   predicted tree + conflicts.
3. (If conflicts) `POST propose-resolutions` -> 3-way review -> human edits.
4. `POST apply` (records pre-SHA, performs merge / commits resolved tree) ->
   refresh graph.
5. `POST undo` (guarded reset) -> refresh graph.

## Error handling / edge cases

- Target branch dirty or mid-merge -> refuse predict/apply with guidance.
- Branch/ref missing or moved since predict -> re-validate at apply; refuse on
  drift (the predicted base no longer matches).
- Scratch worktree creation failure / leftover -> ensured cleanup; never reuse a
  dirty scratch.
- Undo refused when the merge commit is pushed or has descendants -> explain.
- Large histories -> bounded node count + lazy expansion.
- Provider failure during resolution -> conflict stays unresolved; manual path
  always available.
- Secret-shaped conflicted file -> AI resolution refused; manual only.

## Testing

- Temp-git-repo smokes (repo convention for patch/merge work): construct repos
  with known clean and conflicting merges; assert predict reports the right
  conflicts, apply produces the expected tree, undo restores the pre-SHA, and
  scratch worktrees are always cleaned up.
- Fake provider for the resolver (no real CLI); assert proposed resolutions are
  applied only to the scratch worktree and never auto-committed.
- Redaction tests: secret-shaped conflict bodies are redacted before the provider
  and excluded from logs.
- Route-level checks for the write endpoints (guarded, audited).
- Undo-guard tests: refused when descendants exist.

## Open questions / v2

- Rebase/squash workflows (deliberately deferred; would change the Undo model).
- Cross-run "merge train" (apply several run-branches in sequence with
  re-prediction between).
- Visual diffing of the predicted vs current graph beyond the merge-commit
  overlay.
