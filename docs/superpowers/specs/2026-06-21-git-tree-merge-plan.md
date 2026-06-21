# Git Tree + Supervisor-Assisted Merge - Implementation Plan

- Date: 2026-06-21
- Companion to: `2026-06-21-git-tree-merge-design.md` (this plan CORRECTS that spec)
- Source: grounding+plan workflow validated every spec assumption against the code.

## 0. Safety-model verdict

**The predict-in-scratch-worktree model HOLDS.** It is already done in production:
`integration-service.ts:111-160` (`mergePreview`) creates a scratch worktree at a
base ref, runs `mergeNoCommit` cumulatively, and tears it down in a `finally`. A
linked-worktree merge faithfully predicts a real-branch merge. **Proceed.**

## 1. Spec corrections (apply during build)

### Critical (safety/undo)
1. **Apply is NOT atomic** (spec said "Atomic"). It is two steps (record pre-SHA,
   then merge). Persist `.vibestrate/merge/<branch>.json` with `preSha` + `recordedAt`
   BEFORE the merge (mirror `writeIntegrationRecord`). Call it "recorded + reversible."
2. **Undo guard, concrete definition:** refuse when any of (a) `currentHeadSha(branch)
   !== recordedMergeSha` (something built on top); (b) `preSha` is an ancestor of
   `origin/<branch>` if an upstream exists (`merge-base --is-ancestor`); (c) record
   missing / branch drifted. Return typed `{ undone:false, reason }`, never throw-partial.
   Push-detection is best-effort; say so in UI copy.
3. **Apply must gate the Action Broker and not move HEAD.** Mirror `finishIntegration`
   (`integration-service.ts:450-459`): gate `createActionBroker(...).decide({ kind:
   "git.merge" })` (fail-closed deny-list at `action-broker.ts:70`), refuse if target
   isn't the checked-out branch, fail closed on dirty tree.

### Hard (break an assumption)
4. **Conflicts are whole files with `<<<<<<< / ======= / >>>>>>>` markers, NOT hunks.**
   No parser/base-extractor exists. Layer 3 must read each conflicted file, parse hunks,
   reconstruct base via `git show <merge-base>:<path>`, send each hunk redacted to assist,
   rewrite markers with accepted content. Net-new, highest-risk surface.
5. **`GitCommit` has no `parents`** (`git-history-service.ts:24-32`). Add `parents:
   string[]`; edges are implicit, no separate edge array.
6. **No run-branch-vs-main criteria exists.** v1: all branch heads, `isMain` only for the
   configured `mainBranch`. Defer classification to v2.

### Soft
7. **No `isSecretLikeContent`.** Refuse AI resolution when `isSecretLikePath(filePath)`;
   otherwise `redactSecretsInText` hunk bodies before the provider. Don't invent
   content-shape refusal.
8. **Audit via the broker** (`broker.record`), not `EventLog` (runId-scoped).
9. **MergePage uses `/api/integration/*`.** The tree is a new `/api/project/git/tree/*`
   surface; keep integration endpoints for the legacy per-run flow.
10. **`GitPage` is a linear list.** `GitTreePage` is genuinely new; both coexist in v1.

## 2. Phased plan (hard verification gate between phases)

### Phase 1 - Backend topology `getGitGraph` (read-only)
- EDIT `git-history-service.ts`: `parents: string[]` on `GitCommit`; `GitBranchHead`,
  `GitGraphCommit`, `GitGraph` types; `getGitGraph({ worktreePath, maxNodes?, mainBranch })`.
- Branch heads: `git for-each-ref refs/heads/ --format=%(refname:short)\t%(objectname)`
  (do NOT parse `%D`). Commits: `git log --all --max-count=N --pretty=...%P` (reuse the
  unit-separator format at `git-history-service.ts:164`; `%P` = parent shas). Fetch
  `N+buffer`, return N, set `bounded=true`; UI tolerates out-of-set parents as stubs.
- EDIT `routes/git.ts`: `GET /api/project/git/graph`. EDIT `api.ts`: `getGitGraph()` + DTOs.
- TEST (temp-git): multi-branch fork -> parents+branchHeads+isMain; bounded truncation;
  empty repo.
- **GATE 1:** `pnpm typecheck && pnpm test`.

### Phase 2 - `git-merge-service` predict/apply/undo (SECURITY-CRITICAL)
- NEW `src/git/merge-service.ts`; EDIT `git.ts` add `reset(cwd, sha, { hard })` + document
  the mid-merge contract.
- `predictMerge` (mirror `mergePreview`): refExists guards -> prune stale scratch ->
  createWorktree at target -> `mergeNoCommit(source)` -> collect `{ clean, conflictedFiles }`
  -> `finally` remove+deleteBranch. Never commit scratch.
- `applyMerge` (mirror `finishIntegration`): require `humanConfirmed:true` -> broker gate
  `git.merge` -> re-validate target is checked-out HEAD + clean tree + source resolves ->
  write record `preSha` BEFORE merge -> `git merge --no-ff --no-edit` (credit trailers) ->
  on conflict `--abort` + record failure + throw -> on success record `mergedSha`. Clean-merge
  apply only (resolved-tree apply is Phase 3).
- `undoMerge`: guard (Correction #2) -> `reset(target, preSha, {hard})` -> delete record ->
  broker.record.
- TEST (temp-git): predict clean/conflict (+ assert no scratch survives); apply clean
  (record written) / conflict (aborted, tip unchanged) / refuses non-checked-out + dirty;
  undo restores preSha / refused on advance / refused on ancestor-of-fake-origin.
- **GATE 2 (pause + report - security boundary):** all green; killed-mid-apply smoke leaves
  the record so undo works; broker gate fires.

### Phase 3 - Conflict resolution + routes/api
- Hunk parser (reject malformed/nested, skip binary); base via `git show <merge-base>:<path>`;
  per-hunk `redactSecretsInText` -> `runAssist` (zod `{ resolved, rationale }`, fake-runner
  test seam, `auditBucket: "git-merge"`); refuse whole file when `isSecretLikePath`.
  Resolutions written to scratch only; resolved-tree apply is an explicit gated human step.
- 5 POST routes under `/api/project/git/tree/` (predict, propose-resolutions, apply, undo),
  project-root guarded, broker-audited, `SAFE_BRANCH_RE` validation, `HttpError`.
- TEST: parser cases; `proposeResolutions` with fake runner asserts redacted bodies + scratch
  untouched + never committed; `.env` file -> `refusedSecret`; route guard/audit + 403/409.
- **GATE 3:** all green; redaction proven; broker audit entries written.

### Phase 4 - UI `GitTreePage` (+ fold MergePage)
- NEW `GitTreePage.tsx`, `GitDag.tsx`, `MergePlannerPanel.tsx`, `ConflictResolver.tsx`; EDIT
  `route.ts` (add `git-tree` kind) + `App.tsx`. SVG canvas reusing `FlowGraph.tsx` topo-layering,
  no new deps. Three panels: DAG | inspector | planner+resolver. Consult NL "merge X into Y"
  opens the planner pre-filled, never executes. No pills, no status-dot pulse (memory).
- **GATE 4:** `pnpm typecheck && pnpm test && pnpm build`. Browser click-through (build is
  mandatory: the dashboard serves `dist/ui`).

## 3. First build slice
**Phase 1 `getGitGraph` + its temp-git test, nothing else.** Smallest fully-verifiable unit,
zero safety surface, the hard data dependency for the UI. Confirm the DTO shape before the
merge service.

## 4. Risk ledger
| Risk | Phase | Mitigation |
|---|---|---|
| Orphaned pre-SHA on mid-apply crash | P2 | Persist record before merge (#1) |
| Undo guard too weak -> data loss | P2 | tip-equality + ancestor-of-upstream + drift (#2) |
| Apply moves HEAD / skips broker | P2 | Refuse non-checked-out target; gate `git.merge` (#3) |
| Hunk parser on malformed/binary/nested | P3 | Strict parse, reject -> manual fallback |
| Secret leak to provider | P3 | `isSecretLikePath` refusal + redaction; tested |
| Scratch worktree leak | P2/P3 | `finally` remove+delete; pre-flight stale-prune |
| Concurrent predict collisions | P2/P3 | uuid-suffixed scratch path/branch |
| Large-history perf | P1/P2 | Bounded nodes; defer `git merge-tree` optimization |

Key files: `src/git/git.ts`, `src/integration/integration-service.ts` (apply/undo template),
`src/core/git-history-service.ts`, `src/assist/assist-runner.ts`, `src/core/diff-service.ts`
(redaction), `src/safety/action-broker.ts` (`git.merge` gate), `src/server/routes/git.ts`,
`src/ui/components/workflow/FlowGraph.tsx` (SVG DAG pattern).
