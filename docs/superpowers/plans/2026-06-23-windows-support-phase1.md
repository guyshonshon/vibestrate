# Windows Support - Phase 1 (Audit + CI + Platform Seam) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-blocking `windows-latest` CI job that surfaces the real Windows failure list, and introduce a `src/platform/` seam that centralizes POSIX-only process control - with POSIX behavior byte-identical.

**Architecture:** CI-first: a `windows-latest` matrix job (continue-on-error) runs the full suite on Windows so the failure list is empirical, not guessed. A new `src/platform/` module owns `isWindows`, `killProcessTree` (POSIX process-group kill / Windows `taskkill /T`), and `detachedSpawnOptions`. The two clearest existing process-group-kill sites (scheduler-service, command-runner) are migrated to the seam as a pure refactor; their existing tests are the safety net. The actual Windows-branch verification, signal wiring, orchestrator abort, workspace-runtime, and scheduler-lock are Phase 2.

**Tech Stack:** TypeScript (ESM, NodeNext), Node 22 in CI (engine floor `>=18.17`), pnpm 10.26.0, Vitest, GitHub Actions, execa v9.

## Global Constraints

- POSIX (macOS/Linux) behavior MUST stay byte-identical. The seam is a no-op refactor there; every existing test must stay green unchanged.
- No new runtime dependency for tree-kill. Use the built-in `taskkill` command on Windows, NOT the `tree-kill` npm package.
- Tests live in `tests/*.test.ts` (flat dir). Vitest runs with `globals: false`, so import `{ describe, it, expect, vi }` from `"vitest"` explicitly. Import source under test as `"../src/<path>.js"` (ESM `.js` extension, even for `.ts` files).
- Build before test in CI and locally: `pnpm test` includes a test that spawns the bundled `dist/index.js`, so `pnpm build` must run first.
- Verification commands: `pnpm typecheck`, `pnpm build`, `pnpm test`.
- No emojis and no em dashes anywhere (code comments, commit messages, YAML comments). Use a regular hyphen `-`.
- Commit convention: conventional commits with a scope, e.g. `feat(platform): ...`, `test(platform): ...`, `ci: ...`, `refactor(scheduler): ...`.
- Branch: `feat/windows-support` (already checked out). Do not push or merge; that is decided at review time.

---

## File Structure

- `.github/workflows/ci.yml` (modify) - add the `windows-latest` matrix dimension, non-blocking.
- `src/platform/platform.ts` (create) - platform detection (`isWindows`). One responsibility: "are we on Windows".
- `src/platform/process-control.ts` (create) - `killProcessTree`, `detachedSpawnOptions`. One responsibility: cross-platform process spawning/termination primitives.
- `tests/platform-detection.test.ts` (create) - unit tests for `isWindows`.
- `tests/platform-process-control.test.ts` (create) - unit tests for `killProcessTree` and `detachedSpawnOptions` (dependency-injected, no real processes killed).
- `src/scheduler/scheduler-service.ts` (modify) - migrate `terminateChildProcess` and the two `detached:` spawns to the seam.
- `src/execution/command-runner.ts` (modify) - migrate the `detached` flag and `terminateSubprocess` to the seam.

Safety-net tests (must stay green, not modified): `tests/scheduler.test.ts`, `tests/scheduler-liveness.test.ts`, `tests/command-runner-env.test.ts`, `tests/command-runner-timeout.test.ts`, `tests/shell-command-runner.test.ts`.

---

### Task 1: Windows CI matrix job (non-blocking)

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: an empirical Windows pass/fail signal in CI logs (visible after the branch is pushed). No code symbols.

Note: this is CI config, so the deliverable's "test" is YAML validity locally; the real Windows result appears only when the branch runs on GitHub. That is expected and honest - the whole point of the non-blocking job is to surface failures without blocking merges.

- [ ] **Step 1: Rewrite `.github/workflows/ci.yml` to a matrix**

Replace the entire file with:

```yaml
name: CI

# Typecheck, test, and build on every push to main and every PR.
# This is the gate the release workflow trusts before publishing.
#
# Runs on Ubuntu (the blocking gate) and Windows (non-blocking while native
# Windows support lands - see
# docs/superpowers/specs/2026-06-23-windows-support-design.md). The Windows job
# surfaces the empirical failure list without blocking merges; it is promoted to
# a blocking gate in the final Windows phase.

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    continue-on-error: ${{ matrix.os == 'windows-latest' }}
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      # Build before test: the shell-command-runner test spawns the
      # bundled dist/index.js, so dist must exist first.
      - name: Build
        run: pnpm build

      - name: Test
        run: pnpm test
```

- [ ] **Step 2: Validate the YAML parses**

Run: `node -e "const yaml=require('yaml');const fs=require('fs');yaml.parse(fs.readFileSync('.github/workflows/ci.yml','utf8'));console.log('ci.yml is valid YAML')"`
Expected: prints `ci.yml is valid YAML` with no error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the suite on windows-latest (non-blocking) to surface the failure list"
```

---

### Task 2: Platform detection (`isWindows`)

**Files:**
- Create: `src/platform/platform.ts`
- Test: `tests/platform-detection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Platform = NodeJS.Platform`; `isWindows(platform?: Platform): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/platform-detection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isWindows } from "../src/platform/platform.js";

describe("isWindows", () => {
  it("is true on win32", () => {
    expect(isWindows("win32")).toBe(true);
  });

  it("is false on darwin and linux", () => {
    expect(isWindows("darwin")).toBe(false);
    expect(isWindows("linux")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/platform-detection.test.ts`
Expected: FAIL - cannot resolve `../src/platform/platform.js` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/platform/platform.ts`:

```ts
/**
 * Platform detection seam - the single source of truth for "are we on Windows".
 * Pure: takes the platform string so callers and tests can pass an explicit
 * value; defaults to the live `process.platform`.
 */
export type Platform = NodeJS.Platform;

export function isWindows(platform: Platform = process.platform): boolean {
  return platform === "win32";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/platform-detection.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/platform/platform.ts tests/platform-detection.test.ts
git commit -m "feat(platform): add isWindows detection seam"
```

---

### Task 3: Process control primitives (`killProcessTree`, `detachedSpawnOptions`)

**Files:**
- Create: `src/platform/process-control.ts`
- Test: `tests/platform-process-control.test.ts`

**Interfaces:**
- Consumes: `isWindows`, `Platform` from `src/platform/platform.ts`.
- Produces:
  - `interface SpawnPlatformOptions { detached: boolean; windowsHide?: boolean }`
  - `detachedSpawnOptions(platform?: Platform): SpawnPlatformOptions`
  - `interface ProcessControlDeps { platform?: Platform; kill?: (pid: number, signal: NodeJS.Signals) => void; runTaskkill?: (pid: number, force: boolean) => void }`
  - `killProcessTree(pid: number, signal: "SIGTERM" | "SIGKILL", deps?: ProcessControlDeps): void`

- [ ] **Step 1: Write the failing tests**

Create `tests/platform-process-control.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  killProcessTree,
  detachedSpawnOptions,
} from "../src/platform/process-control.js";

describe("killProcessTree", () => {
  it("signals the process group with a negative pid on POSIX", () => {
    const kill = vi.fn();
    const runTaskkill = vi.fn();
    killProcessTree(4321, "SIGTERM", { platform: "linux", kill, runTaskkill });
    expect(kill).toHaveBeenCalledWith(-4321, "SIGTERM");
    expect(runTaskkill).not.toHaveBeenCalled();
  });

  it("forwards SIGKILL to the process group on POSIX", () => {
    const kill = vi.fn();
    killProcessTree(50, "SIGKILL", { platform: "darwin", kill, runTaskkill: vi.fn() });
    expect(kill).toHaveBeenCalledWith(-50, "SIGKILL");
  });

  it("runs taskkill /T /F on Windows for SIGKILL and never process.kill", () => {
    const kill = vi.fn();
    const runTaskkill = vi.fn();
    killProcessTree(4321, "SIGKILL", { platform: "win32", kill, runTaskkill });
    expect(runTaskkill).toHaveBeenCalledWith(4321, true);
    expect(kill).not.toHaveBeenCalled();
  });

  it("runs taskkill /T without /F on Windows for SIGTERM", () => {
    const runTaskkill = vi.fn();
    killProcessTree(99, "SIGTERM", {
      platform: "win32",
      kill: vi.fn(),
      runTaskkill,
    });
    expect(runTaskkill).toHaveBeenCalledWith(99, false);
  });
});

describe("detachedSpawnOptions", () => {
  it("detaches on POSIX so a process group exists to signal", () => {
    expect(detachedSpawnOptions("linux")).toEqual({ detached: true });
  });

  it("does not detach on Windows and hides the console window", () => {
    expect(detachedSpawnOptions("win32")).toEqual({
      detached: false,
      windowsHide: true,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/platform-process-control.test.ts`
Expected: FAIL - cannot resolve `../src/platform/process-control.js` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/platform/process-control.ts`:

```ts
import { spawn } from "node:child_process";
import { isWindows, type Platform } from "./platform.js";

export interface SpawnPlatformOptions {
  detached: boolean;
  windowsHide?: boolean;
}

/**
 * Spawn options for a child we may later need to tree-kill.
 * POSIX: `detached: true` puts the child in its own process group so
 *   killProcessTree can signal the whole group via a negative pid. This is
 *   identical to the prior inline `detached: process.platform !== "win32"`.
 * Windows: no process groups; do not detach, and hide the console window.
 */
export function detachedSpawnOptions(
  platform: Platform = process.platform,
): SpawnPlatformOptions {
  if (isWindows(platform)) return { detached: false, windowsHide: true };
  return { detached: true };
}

export interface ProcessControlDeps {
  platform?: Platform;
  /** Defaults to process.kill. Injected in tests. */
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  /** Defaults to spawning `taskkill`. Injected in tests. */
  runTaskkill?: (pid: number, force: boolean) => void;
}

/**
 * Terminate a process AND its descendants, cross-platform. Throws on failure;
 * callers keep their existing direct-child fallback in a catch block.
 *
 * POSIX: signal the process *group* (negative pid) - identical to the prior
 *   inline `process.kill(-pid, signal)`. The child MUST have been spawned with
 *   detachedSpawnOptions() so a group exists.
 * Windows: `taskkill /PID <pid> /T` (with `/F` to force on SIGKILL). There are
 *   no process groups, so taskkill /T walks the child tree. This REPLACES the
 *   prior Windows fallback of `child.kill(signal)` (direct child only), which
 *   orphaned provider subagents.
 */
export function killProcessTree(
  pid: number,
  signal: "SIGTERM" | "SIGKILL",
  deps: ProcessControlDeps = {},
): void {
  const platform = deps.platform ?? process.platform;
  if (isWindows(platform)) {
    const runTaskkill =
      deps.runTaskkill ??
      ((p: number, force: boolean): void => {
        const args = ["/PID", String(p), "/T"];
        if (force) args.push("/F");
        spawn("taskkill", args, { stdio: "ignore", windowsHide: true });
      });
    runTaskkill(pid, signal === "SIGKILL");
    return;
  }
  const kill =
    deps.kill ??
    ((p: number, s: NodeJS.Signals): void => {
      process.kill(p, s);
    });
  kill(-pid, signal);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run tests/platform-process-control.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/platform/process-control.ts tests/platform-process-control.test.ts
git commit -m "feat(platform): add killProcessTree and detachedSpawnOptions"
```

---

### Task 4: Migrate scheduler-service to the seam (POSIX-identical refactor)

**Files:**
- Modify: `src/scheduler/scheduler-service.ts`

**Interfaces:**
- Consumes: `killProcessTree`, `detachedSpawnOptions` from `src/platform/process-control.ts`.
- Produces: nothing new (internal refactor).

Refactor only. On POSIX every changed line resolves to the exact prior behavior; the scheduler tests are the safety net.

- [ ] **Step 1: Confirm the safety-net tests are green before changing anything**

Run: `pnpm vitest run tests/scheduler.test.ts tests/scheduler-liveness.test.ts`
Expected: PASS. (This is the baseline the refactor must preserve.)

- [ ] **Step 2: Add the seam import**

At the top of `src/scheduler/scheduler-service.ts`, with the other relative imports, add:

```ts
import {
  killProcessTree,
  detachedSpawnOptions,
} from "../platform/process-control.js";
```

- [ ] **Step 3: Replace the kill logic in `terminateChildProcess`**

Find this block (around line 60-86):

```ts
  try {
    if (process.platform !== "win32") process.kill(-pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  const timer = setTimeout(() => {
    try {
      if (process.platform !== "win32") process.kill(-pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }, 3000);
```

Replace it with:

```ts
  try {
    killProcessTree(pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  const timer = setTimeout(() => {
    try {
      killProcessTree(pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }, 3000);
```

- [ ] **Step 4: Replace the two `detached:` spawn options**

There are two `spawn(...)` calls in `defaultRunTask` (around lines 104-116), each with the line:

```ts
            detached: process.platform !== "win32",
```

Replace BOTH occurrences of that line with:

```ts
            ...detachedSpawnOptions(),
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 6: Run the safety-net tests to verify still green**

Run: `pnpm vitest run tests/scheduler.test.ts tests/scheduler-liveness.test.ts`
Expected: PASS (same as the Step 1 baseline).

- [ ] **Step 7: Commit**

```bash
git add src/scheduler/scheduler-service.ts
git commit -m "refactor(scheduler): route process kill/spawn through the platform seam"
```

---

### Task 5: Migrate command-runner to the seam (POSIX-identical refactor)

**Files:**
- Modify: `src/execution/command-runner.ts`

**Interfaces:**
- Consumes: `killProcessTree`, `detachedSpawnOptions` from `src/platform/process-control.ts`.
- Produces: nothing new (internal refactor).

Refactor only. On POSIX `detached` is always `true` here, so `killProcessTree` resolves to the prior `process.kill(-pid, signal)`. The command-runner tests are the safety net.

- [ ] **Step 1: Confirm the safety-net tests are green before changing anything**

Run: `pnpm vitest run tests/command-runner-env.test.ts tests/command-runner-timeout.test.ts tests/shell-command-runner.test.ts`
Expected: PASS. (Baseline.)

- [ ] **Step 2: Add the seam import**

At the top of `src/execution/command-runner.ts`, with the other imports, add:

```ts
import {
  killProcessTree,
  detachedSpawnOptions,
} from "../platform/process-control.js";
```

- [ ] **Step 3: Replace the `detached` flag derivation**

Find (around line 90):

```ts
  const detached = process.platform !== "win32";
```

Replace with:

```ts
  const { detached } = detachedSpawnOptions();
```

(`detached` is still passed to execa unchanged at the `detached,` option line - leave that line as-is.)

- [ ] **Step 4: Replace the kill logic in `terminateSubprocess`**

Find this block (around line 118-144):

```ts
    try {
      if (detached) process.kill(-pid, "SIGTERM");
      else subprocess.kill("SIGTERM");
    } catch {
      try {
        subprocess.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    forceKillTimer = setTimeout(() => {
      try {
        if (detached) process.kill(-pid, "SIGKILL");
        else subprocess.kill("SIGKILL");
      } catch {
        try {
          subprocess.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }, 3000);
```

Replace it with:

```ts
    try {
      killProcessTree(pid, "SIGTERM");
    } catch {
      try {
        subprocess.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    forceKillTimer = setTimeout(() => {
      try {
        killProcessTree(pid, "SIGKILL");
      } catch {
        try {
          subprocess.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }, 3000);
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (If `detached` is now flagged as unused, that means the `detached,` execa option line was accidentally removed - it must remain.)

- [ ] **Step 6: Run the safety-net tests to verify still green**

Run: `pnpm vitest run tests/command-runner-env.test.ts tests/command-runner-timeout.test.ts tests/shell-command-runner.test.ts`
Expected: PASS (same as the Step 1 baseline).

- [ ] **Step 7: Full verification gate**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all PASS (this is the phase exit gate on POSIX).

- [ ] **Step 8: Commit**

```bash
git add src/execution/command-runner.ts
git commit -m "refactor(execution): route command-runner kill/spawn through the platform seam"
```

---

## Phase exit

After Task 5, the POSIX suite is fully green and the seam exists. Pushing the branch runs the `windows-latest` job, whose log is the empirical failure list that scopes Phase 2 (process-control verification + signal wiring + orchestrator abort + workspace-runtime + scheduler-lock). Push/merge is decided at review time, not by this plan.

## Self-Review

**1. Spec coverage (Phase 1 rows only):**
- "Add windows-latest matrix job FIRST" -> Task 1. Covered.
- "introduce src/platform/ seam with POSIX behavior unchanged" -> Tasks 2-3 (create), Tasks 4-5 (wire in, POSIX-identical). Covered.
- "catalogue every failing site from real CI output" -> emergent from Task 1's CI run (documented in Phase exit). Covered as a Phase-1 outcome; the cataloguing itself feeds Phase 2.
- Phase 1 explicitly does NOT do: Windows-branch verification, signal wiring, orchestrator abort, workspace-runtime, scheduler-lock (positive-pid single kill, different semantics - not a tree kill, deliberately excluded). These are Phase 2/3/4 per the spec.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step shows complete code; every run step shows the exact command and expected result.

**3. Type consistency:** `Platform` defined in Task 2, consumed in Task 3. `killProcessTree(pid, "SIGTERM"|"SIGKILL", deps?)` and `detachedSpawnOptions(platform?)` defined in Task 3, used with matching signatures in Tasks 4-5. `SpawnPlatformOptions` spread (`...detachedSpawnOptions()`) is a valid spawn-options subset (`detached`, `windowsHide`). On POSIX `detachedSpawnOptions()` returns `{ detached: true }`, matching the prior `detached: true` exactly.
