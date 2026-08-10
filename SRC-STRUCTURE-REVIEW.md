# `src/` structure review

A review artifact, not a doc-set addition. `docs/design/` was deliberately
emptied in `e36f011d` ("the design notes are the owner's, not the repo's"), so
this sits at the root and is meant to be deleted or moved once you have decided.
Nothing has been refactored. Measurements are from `analysis/src-structure-review`
at 161,641 lines across 23 top-level packages.

---

## The headline

**The tree is not too flat, and I would not re-layer it.** Four of the fourteen
packages in the brief are the problem, but not for the reason the brief gives.

Two things are worth correcting up front, because they change the answer:

**Half the named packages are not top-level - they are already nested where they
belong.** `src/` has 23 directories and **zero loose files**:

| Named in the brief | Where it actually is |
|---|---|
| `orchestrator` | `core/orchestrator.ts` - a file, not a package |
| `execution` | `core/execution/` |
| `workflow` | `core/workflow/` |
| `crews` | `agents/crew-{schema,registry,presets}.ts` |
| `mcp` | `providers/mcp/` |
| `telemetry` | `core/metrics/otel-exporter.ts`, command in `cli/commands/telemetry.ts` |
| `permissions` | `safety/permission-{schema,profiles}.ts` |

That list is itself evidence: seven concepts the brief expected to find sitting
flat at the root are already grouped under the package that owns them. The
grouping the brief is asking for has, for these, already happened.

**A restructure program already ran.** Waves A-D, `35d7f9e8` (37 -> 23
directories) through `b6fe6016` (65 flat `core/` files -> 6 domain clusters).
The published `docs/content/architecture/directory-map.md` describes the result.
A second re-layout would be relitigating that work rather than building on it.

What the brief correctly senses is that interfaces and domain sit at the same
level. That is true. It is also, I will argue, the cheapest thing about the
current structure - and the expensive problems are in the dependency graph,
where moving directories cannot reach them.

---

## 1. The current packages

Sorted by size. The distribution matters more than the count:

| Package | Files | LOC | What it is |
|---|---:|---:|---|
| `ui` | 246 | 55,596 | Mission Control, the React dashboard SPA |
| `core` | 93 | 27,424 | The run engine + the plumbing around it |
| `cli` | 85 | 15,201 | The commander program and every command |
| `shell` | 71 | 11,137 | The Ink TUI behind `vibe shell` |
| `server` | 42 | 9,578 | Local Fastify HTTP/SSE API |
| `flows` | 20 | 7,382 | Flow schema, built-ins, resolution |
| `git` | 12 | 4,184 | Worktrees, diffs, merge, the git tree |
| `providers` | 31 | 4,058 | Adapters over the vendor CLIs |
| `reviews` | 10 | 3,720 | Review passes and their outcomes |
| `project` | 11 | 3,618 | Project config, paths, state |
| `roadmap` | 12 | 3,446 | Tasks, steps, the roadmap model |
| `setup` | 5 | 2,444 | `vibe init` / `doctor` wiring |
| `supervisor` | 11 | 1,898 | Supervisor profiles and posture |
| `scheduler` | 11 | 1,742 | Queue, locks, background runs |
| `safety` | 8 | 1,599 | Permissions, patch safety, the action broker |
| `notifications` | 11 | 1,454 | Gateways and delivery |
| `spec-up` | 4 | 1,215 | The plan-before-you-build chain |
| `policies` | 6 | 1,195 | Project policy tiers |
| `workspace` | 5 | 1,162 | Multi-project workspace |
| `agents` | 13 | 1,098 | Agent roles and seat definitions |
| `consult` | 4 | 916 | The read-only advisor |
| `utils` | 13 | 915 | Generic helpers, no domain knowledge |
| `terminal` | 4 | 659 | The in-app terminal |

**The shape:** `ui + cli + shell + server` = **91,512 LOC, 57% of the tree**.
`core` is another 17%. The remaining eighteen packages share 26% between them -
all eighteen together are smaller than `cli` alone.

So "23 peers" overstates the flatness. In practice there are five large things
and eighteen small, individually nameable capabilities.

---

## 2. Cohesion, and what is actually misplaced

I built the full cross-package import matrix rather than judging by name.
Inbound edge counts:

```
utils(393)  project(204)  core(203)  flows(89)  providers(68)
setup(46)   roadmap(44)   agents(43)
```

### Genuinely cohesive

`ui` is near-isolated - it imports **two** symbols from `flows` and nothing
else. `notifications` imports only `utils`. `terminal`, `workspace`, `consult`,
`policies` are small with shallow dependencies. These need nothing.

### The real problem: `core` is both hub and consumer

`core` is imported by 203 call sites **and imports from 14 other packages** -
`flows(37)`, `project(29)`, `providers(21)`, `safety(15)`, `supervisor(14)`,
`roadmap(11)`. Those packages import `core` straight back: `flows -> core(9)`,
`project -> core(8)`, `providers -> core(6)`, `roadmap -> core(5)`,
`supervisor -> core(3)`.

That is a bidirectional cycle between the engine and nearly every domain
package. It is the thing that will actually hurt as the codebase grows -
changing `flows` can break `core` and vice versa, and no directory move fixes
it. **This is the finding I would act on.**

### Three concrete inversions

Each is a single wrong import, and each already has a correct home:

**1. The base layer reaches upward.**
`src/utils/file-mutex.ts:26` imports `isProcessAlive` from
`scheduler/scheduler-lock.ts`. `utils` has 393 inbound edges - it is the
foundation, and it must depend on nothing. `isProcessAlive` is ten lines of
`process.kill(pid, 0)` with no scheduler knowledge, and **`src/utils/process-control.ts`
already exists**. This one is a symbol in the wrong file, not a structural issue.

**2. A domain package imports a frontend.**
`spec-up/spec-up-assist.ts`, `spec-up-artifact-edit.ts` and `spec-up-chain.ts`
all import `assertSafeRunId` from `server/security.ts`. Domain logic should
never reach into an interface.

The cause is that `server/security.ts` is two modules under one name. It exports
HTTP concerns (`HttpError`, `isLoopbackHost`, `isAllowedRequestHost`,
`bearerToken`, `bindAddressFromArgs`) alongside generic validators
(`assertSafeRunId`, `assertSafeRelativePath`, `assertContainedIn`,
`timingSafeEqualStr`). The second group is domain-level input validation that
happens to have been needed by HTTP first. **`src/utils/run-id.ts`,
`src/utils/paths.ts` and `src/utils/real-path-guard.ts` already exist.**

**3. The two terminal frontends are circular.**
`shell/ink/runtime.tsx:4` imports `buildVibestrateProgram` from `cli/index.js`,
while `cli/commands/shell.ts` imports `runInkShell` and `buildShellSnapshot`
from `shell/`. Defensible in intent - `vibe shell` launches the TUI, and the TUI
needs the command tree - but it is a true cycle and the only one among the
frontends.

---

## 3. Domain, layers, or hybrid

**Hybrid, weighted heavily toward leaving the tree alone.**

The tree is already *mostly* domain-organised (18 capability packages) with an
implicit layer split (4 frontends, 1 engine, 1 base). That is the right model.
What is missing is not a different shape - it is that the model is **not written
down and not enforced**, so nothing stops the next inversion.

Arguing against a full re-layer, concretely:

- **`src/app/{cli,server,shell,ui}` adds a path segment and no information.**
  A directory named `cli` already announces its layer. The move would rewrite
  imports across 91,512 LOC - 57% of the tree - to tell a reader something the
  name already told them.
- **Grouping the 18 small packages under `domain/` is worse.** They total 26%
  of the tree; the nesting would cost every import path in exchange for a label.
- **It would relitigate Waves A-D**, which deliberately went 37 -> 23.
- Your own brief warns against clean architecture for its own sake. A re-layer
  here is exactly that: it would satisfy a diagram without removing one cycle.

The one place nesting genuinely pays is where it has already been applied -
inside `core`, where wave D turned 65 flat files into 6 clusters. That was worth
it because `core` is 27k LOC. The same logic does not extend to a 915-LOC
`utils`.

---

## 4. Target tree

Deliberately close to what exists. Every move below is justified by a measured
edge, not by symmetry.

```
src/
  # Interfaces - unchanged, still top-level. Their names are the layer.
  cli/          server/        shell/        ui/

  # Engine - unchanged internally. 11 clusters over 11 root hub files;
  # wave D's clustering stands and nothing here needs re-cutting.
  core/
    assist/ codebase/ context/ execution/ metrics/ run/ run-engine/
    saga/ stores/ validation/ workflow/
    orchestrator.ts  state-machine.ts  diff-service.ts  path-guard.ts  ...

  # Domain capabilities - unchanged, flat, one directory per nameable capability
  agents/  consult/  flows/     git/       notifications/  policies/
  project/ providers/ reviews/  roadmap/   safety/         scheduler/
  setup/   spec-up/  supervisor/ terminal/ workspace/

  # Base - must import nothing outside itself
  utils/
```

### The moves (three, all symbol-level)

| Symbol | From | To | Why |
|---|---|---|---|
| `isProcessAlive` | `scheduler/scheduler-lock.ts` | `utils/process-control.ts` | Generic; unblocks `utils` importing nothing |
| `assertSafeRunId` | `server/security.ts` | `utils/run-id.ts` | Run-id validation; module already exists |
| `assertSafeRelativePath`, `assertContainedIn` | `server/security.ts` | `utils/paths.ts` | Path containment, not HTTP |

`server/security.ts` keeps `HttpError`, `isLoopbackHost`, `isAllowedRequestHost`,
`bearerToken`, `timingSafeEqualStr`, `bindAddressFromArgs` and re-exports the
moved validators for one release so no call site breaks in the same commit.

For the `cli <-> shell` cycle, the cheapest correct fix is to invert one
direction rather than move files: `cli/commands/shell.ts` should keep importing
`shell/`, and `shell/ink/runtime.tsx` should receive the program as an argument
instead of importing `cli/index.js`. One frontend may depend on another; they
must not depend on each other.

**Explicitly not proposed:** no `app/`, no `domain/`, no `infrastructure/`, no
`interfaces/`, no barrel-per-package, no renames. Zero directories created,
zero moved.

---

## 5. The import rules I would enforce

Four layers, expressed as an allowlist. This is the part that makes new code
obvious, and it is what the tree cannot do on its own.

```
L0  utils/                      imports: nothing in src/
L1  domain packages             imports: L0, other L1, core/  (never L3)
L2  core/                       imports: L0, L1
L3  frontends cli|server|shell|ui  imports: L0, L1, L2, at most one sibling frontend
```

Rules, in priority order:

1. **`utils/` imports nothing from `src/`.** It has 393 inbound edges; anything
   it depends on is transitively depended on by the whole tree. Violated once
   today.
2. **No domain package imports a frontend.** Violated three times today, all by
   `spec-up` -> `server`.
3. **No cycles between frontends.** Violated once today, `cli <-> shell`.
4. **`core` may not grow new outbound domain edges.** It has 14 today. Freeze
   the set, and require any new one to be argued - this is the guard against the
   hub-and-consumer problem getting worse while nobody is looking.

### How to enforce it

Not in review, and not in prose. As a test that fails the build, matching the
repo's existing habit of a single central verify gate:

- `tests/import-boundaries.test.ts` walks `src/`, resolves every relative
  import to its owning package, and asserts the matrix above.
- Rules 1-3 assert **zero** violations after the three fixes land.
- Rule 4 is a **pinned snapshot** of `core`'s 14 outbound edges. Adding a
  fifteenth fails with a message saying to justify it or invert the dependency.
  A snapshot is honest about the debt without blocking work on it.

That test is roughly 60 lines, needs no dependency, and encodes the whole
architecture. It is also the artifact that answers "where does this go?" - if
the import fails the gate, it is in the wrong package.

---

## 6. On not over-engineering this

The brief asked me to avoid clean architecture for its own sake, so the reasoning
behind what I am *not* proposing:

- **No new nesting level.** Every candidate (`app/`, `domain/`, `core/domain/`)
  added a segment without adding information a directory name did not already
  carry, and each would have rewritten imports across a large fraction of the
  tree to do it.
- **No barrels.** Wave C already found the cost of one (`api.ts`, which needed a
  collision-guard test). Per-package barrels would multiply that.
- **No package-per-concept.** `consult` (916 LOC) and `terminal` (659 LOC) are
  small, but each is one nameable thing with shallow dependencies. Merging them
  into a `features/` bucket would trade a clear name for a vaguer one.
- **`state-machine.ts` stays at `core/` root.** It is the type vocabulary the
  rest of the engine speaks; this was settled in wave D and I am not reopening it.

The honest summary: this tree has already been through the restructure the brief
is asking for. What it has not been through is **having its boundaries written
down and enforced**, which is why three inversions and a 14-edge hub crept in
afterwards. Fixing three imports and adding one test buys more than any
directory move available here.

---

## Suggested order

1. Add `tests/import-boundaries.test.ts` with rules 1-3 marked expected-to-fail,
   so the violations are visible and counted.
2. Move the three symbols. Flip the tests to expected-to-pass.
3. Invert the `shell -> cli` edge.
4. Pin `core`'s outbound edge snapshot (rule 4).
5. Update `docs/content/architecture/directory-map.md` with the layer rules, so
   the published map states the contract.

Steps 1-3 are mechanical and independently verifiable. Step 4 is the one that
keeps this from happening again.
