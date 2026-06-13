# Design: Sandboxed execution backend (T14)

Status: **proposed - adversarially reviewed (Opus), verdict folded in** · Triage:
[`backlog-triage-2026-06.md`](./backlog-triage-2026-06.md) § T14 · Related:
[`policy-enforcement-assurance.md`](./policy-enforcement-assurance.md) § S6.

> Raw ask (T14): "The supervisor should control how each flow/agent works with
> a sandbox (Docker), prepare Dockerfile, with volume shared or inside git or
> whatever - flexible."

This is the security boundary for running agent-generated code - the spine under
S6 (process-level forbidden-path guarantees) and Phase C (parallel writers). It
is hard to reverse: every run flows through it. The design is the deliverable;
it was adversarially reviewed before any code, and the review materially changed
it (see §0 and §3).

---

## 0. Two reframes the review forced

**Reframe A - this is not "implement a docker `prepareRun`."** The provider CLI
spawn **completely bypasses the execution backend today.** `ExecutionBackend`
(`src/execution/execution-backend-schema.ts`) declares only `prepareRun` (run
once to make the git worktree) + an unused `cleanup`. The agent turn actually
spawns via a single `execa` in `src/execution/command-runner.ts:81`, with
`cwd: worktreePath` and `env: { ...process.env, ...overrides }`, **on the host**.
Nothing in `orchestrator → runProviderResilient → runProvider → runCliProvider →
runArgvCommand → execa` consults the backend. So a docker backend that only
containerizes `prepareRun` would create a container and **run the agent on the
host anyway** - theater. T14's unavoidable spine is **making execution routable
through the backend** (a new `run()` method on the interface; `runArgvCommand` is
the one chokepoint to dispatch through). Everything depends on that.

**Reframe B (from the review) - Docker is not the cheapest way to get the
headline win, and for some providers it is the wrong tool.** The headline goal
is OS-enforced **filesystem** isolation (make `forbiddenPaths`/forbidden-read
real - S6). But **the provider CLIs already ship OS sandboxes**:

- `codex --sandbox read-only|workspace-write|danger-full-access` runs
  model-generated commands under **Apple Seatbelt** on macOS (Landlock/seccomp on
  Linux). Verified against the installed `codex` (`codex sandbox` subcommand:
  "Run commands within a Codex-provided sandbox … under seatbelt").
- Claude Code references its own sandboxing ("sandboxes with no internet
  access").

Provider-native sandbox gives the filesystem win **on the host, with the
provider's own auth/config already wired, no Docker, no path translation, no
architecture mismatch, no bind-mount I/O penalty, no image build** - it dominates
Docker on cost for the filesystem goal. So the design is restructured around a
**spectrum of isolation modes**, recommended in cost order, with provider-native
**first** and Docker as the heavier second mode for cases it can't cover.

---

## 1. Goals / non-goals

**Goals.**
- A routable execution layer (`ExecutionBackend.run()`) so the agent process is
  launched *by* the backend, with the default `local-worktree` byte-identical to
  today.
- **Real, OS-enforced filesystem isolation** as the headline deliverable
  (forbidden-read/-write become OS-prevented, not just diff-audited - S6),
  delivered cheapest-first.
- An **honest, machine-readable isolation level per mode** surfaced in the
  assurance artifact - never claim isolation a mode doesn't provide (`CLAUDE.md`
  §5: "Do not claim OS sandboxing" unless real).
- Supervisor/flow control: per-flow/step isolation mode; wire the inert
  `sandbox-suggested` posture + consult `request_sandbox` to something real;
  flag in assurance when a sandbox-suggested run ran unsandboxed (ties to T9).
- Loud, safe fallback when a mode is unavailable.

**Non-goals (this design).** gVisor / Firecracker / nsjail / bubblewrap (the
higher-assurance S6 spectrum - the interface admits them, we don't build them);
remote/cloud runners (`CLAUDE.md` §5: no cloud unless requested); auto-merge/push
from the container (merge stays host-side, human-confirmed `vibe integrate
finish`).

---

## 2. Threat model (what each mode defends, and what none of them close)

| # | Threat | Defended by |
|---|---|---|
| T-read | Agent reads an *unrelated* host secret/path (`~/.ssh`, `~/.aws`, another repo, a sibling `.env`) | **Filesystem isolation** (provider-native confinement, or container with worktree-only mount). Real. |
| T-write | Agent writes outside the worktree | Same. Real. |
| T-destroy | `rm -rf`, fork bomb, disk fill | Resource limits + ephemeral container (docker mode); the provider sandbox bounds writes but not host process resources. |
| T-exfil | A prompt-injected agent encodes data and sends it out | **Not closed by any mode here** (see below). Narrowed only by an egress proxy (slice 3). |
| T-cred | Agent reads the *provider's own* credential (`~/.claude`, `~/.codex` token) and exfils it | **Not closed by slice 1 of either mode** - that credential dir must be present for the agent to authenticate. Closed only by the host credential proxy (slice 3). |

**The constraint that bounds everything:** the "agent" is a provider CLI that is
**one process doing two jobs** - it calls the LLM API (needs network +
credentials) *and* executes tools / writes code (the thing we sandbox). You
cannot separate them with an off-the-shelf CLI. Therefore **filesystem isolation
is genuinely achievable and is the real shippable win; network/credential
isolation (T-exfil, T-cred) is fundamentally limited** until a host-side proxy
holds the credentials and chokes egress. A design that markets any slice-1 mode
as "the agent is sandboxed" (full sense) is dishonest. This one states the floor
per mode (§4, §5).

---

## 3. The architecture: routable execution + a spectrum of isolation modes

Extend the interface so it owns process launch and declares its honesty:

```ts
type IsolationLevel = {
  filesystem: "none" | "provider-sandbox" | "container";
  network:    "host" | "provider-only" | "proxied";   // never "disabled" - see §5
  process:    "host" | "namespaced";
  credentials:"in-process" | "in-container" | "brokered";
};
type ExecutionBackend = {
  id: ExecutionBackendId;
  isolation: IsolationLevel;                       // honest, surfaced in assurance
  prepareRun(input): Promise<PreparedExecution>;   // unchanged
  run(input: BackendRunInput): Promise<CommandResult>;  // NEW - the chokepoint
  cleanup?(input): Promise<void>;
};
```

`runArgvCommand` (the single `execa` site) dispatches through the active
backend's `run()`. The three modes:

| Mode | `run()` does | filesystem | cost | when |
|---|---|---|---|---|
| **local-worktree** (default) | today's host `execa`, byte-identical | none | zero | unchanged default |
| **provider-native** | host `execa` **+ inject the provider's sandbox flag** (`codex --sandbox workspace-write`, claude's equivalent) | OS-enforced (provider's Seatbelt/Landlock) | ~zero | **recommended first** - codex/claude on the host |
| **docker** | `docker exec` into this run's container (§4) | OS-enforced (namespaces) | high | clean room / arch control / provider without a native sandbox |

**Why provider-native first.** It delivers the headline filesystem win at near-zero
cost and zero new failure surface: it stays host `execa` (so the tree-kill,
stdin, env, MCP-config-path, abort/timeout all keep working unchanged), the
provider is already authenticated, deps are the host's correct-arch deps. Its
honesty caveats, stated plainly: assurance depends on **trusting the provider's
sandbox implementation**; it is **per-provider** (codex ≠ claude; a provider
without a sandbox gets `filesystem: none` and the assurance says so); and it does
**not** close T-exfil/T-cred (the CLI still calls the LLM with its creds).

**Why docker still earns its place.** A clean room with a pinned toolchain and
namespace isolation independent of the provider; the only path for a provider
with no native sandbox; the substrate for the future gVisor/Firecracker rows.
But it is heavy and underspecified-if-naive - see §4.

---

## 4. The docker mode is NOT a thin `docker exec` wrapper (review blockers #1, #2)

The review proved two things the first draft hid behind "smallest change":

### 4a. Mount-and-path translation (blocker #1)

"Mount only the worktree" breaks the run, because the agent CLI is handed
**host-absolute paths that live outside the worktree**:

- MCP config: written to `.vibestrate/runs/<id>/artifacts/mcp/*.json` and passed
  as `--mcp-config <hostpath>` + `VIBESTRATE_MCP_CONFIG=<hostpath>` (both
  providers). The worktree is a *sibling* of `runs/<id>/artifacts/`, so a
  worktree-only mount doesn't contain it.
- `--settings <file>` (claude) and skill-referenced files: host-absolute.

So docker mode needs a **path-translation layer** in `run()`: mount the run's
artifact dir read-only alongside the worktree, and **rewrite** `cwd`,
`--mcp-config`, `--settings`, `VIBESTRATE_MCP_CONFIG` to their in-container mount
points. This is real slice-2 work, not an afterthought. Every additional mount
weakens "forbidden paths don't exist" (see §6), so each non-worktree mount is
`:ro`, minimal, and path-validated.

### 4b. The `docker exec` option matrix (blocker #2)

`docker exec` is not a drop-in for the host `execa`. Per option:

| `execa` option (command-runner.ts) | docker translation |
|---|---|
| `cwd` | map host worktree path → fixed in-container path |
| `env: {...process.env}` | **must NOT forward the host env** - pass an explicit **allowlist** with `-e` (§5); host paths in env get rewritten |
| `input: stdin` (the prompt) | requires `docker exec -i`; dropping `-i` hangs every stdin-mode provider |
| `detached` + `kill(-pid)` **tree-kill** | **breaks** - `-pid` is the host `docker exec` client, not the in-container tree; abort/timeout must `docker kill`/stop the container's PID namespace. This is load-bearing (the existing tree-kill is the project's fix for orphaned subagents) |
| `cancelSignal`/`timeoutMs` | must reap the *container-side* process, not just the client |
| `onChunk` streaming | survives (docker proxies stdout/stderr) |
| claude `--resume`/`--session-id` | session store lives in the container's HOME - fine for container-per-run, but HOME must persist across that run's turns |

### 4c. Lifetime, perf, deps (review #6, #10)

- **One container per run, `docker exec` per turn** (not `docker run` per turn -
  that pays image-start latency every turn); `cleanup` removes it.
- **Self-destruct TTL on the container** (not only a startup reaper): a leaked
  container is a *live* credential holder + open egress channel after an
  orchestrator crash, so it must die on its own (max-lifetime watchdog), not wait
  for the next `vibe` startup.
- **`node_modules` on a named Docker volume**, never the macOS bind mount -
  in-container `pnpm install` over osxfs/virtiofs is 10-30x slower and would make
  sandboxed runs categorically slower than unsandboxed (driving users to disable
  the sandbox - defeating the goal). Native host deps can't be reused (arch +
  symlink), so a fresh in-container install on the volume is the model; **a
  perf budget on a representative repo is a gating spike, not an open question.**
- **Rootless / userns-remap is a slice-default**, not a nice-to-have: for an
  untrusted-agent threat model, a container escape should land as an unprivileged
  host user. Never mount the docker socket; never `--privileged`.

---

## 5. Network, credentials, and the honest floor (review #3, #5, #7)

The container/sandbox must reach the LLM API and authenticate. `network:
"disabled"` (the S6 doc's example) is **incompatible** with an agent CLI that
makes its own LLM calls - it would hang every run; the design rejects offering it
(it's only meaningful for a future split-loop the off-the-shelf CLIs don't
support).

| Option | T-exfil | T-cred | Notes |
|---|---|---|---|
| A. host network + host env creds | open | open | trivial; the floor of "creds-in-container" |
| B. egress-allowlist + creds present | narrowed | **still open** | the provider's own auth dir must be present for the CLI to run; an injected agent can read + exfil it. **Enforceability on Docker Desktop macOS is unproven** (container networking is a Linux VM; in-container iptables needs NET_ADMIN you don't want to grant) - so B effectively requires the option-C proxy to be real on macOS |
| C. host credential+egress proxy; no creds in container | narrowed + audited chokepoint | **closed** | the only credential-safe sandbox; the genuinely professional design |

**Honest floor of slice 1 (either filesystem mode):** filesystem isolation from
*unrelated* host secrets (`~/.ssh`, other repos) - real and worth shipping - but
**the provider's own credential stays reachable and T-exfil stays open.** Slice 1
is a *filesystem* improvement, not a credential-safe sandbox. Credential safety
requires the slice-3 proxy. The assurance artifact reports exactly this
(`credentials: in-process|in-container|brokered`) so a reader never over-trusts.
The env passed into docker mode is an **explicit allowlist** (the provider's auth
+ `PATH`/`HOME`/proxy vars only), never `...process.env` (which would leak
`AWS_*`, `GITHUB_TOKEN`, etc.).

---

## 6. Mount-boundary integrity (review #8, #9)

- "`forbiddenPaths` become real" holds **only** for paths not reachable through
  *any* mounted directory. Every mount §4a forces (artifacts, deps volume) is a
  potential cross-mount `..`/symlink path - so non-worktree mounts are `:ro`,
  minimal, and the claim in docs is qualified ("real for paths outside every
  mount; the provider's config/credential dir is necessarily present").
- The host post-turn diff-gate must run **after** the turn's `docker exec`
  returns *and* no other exec is active in the container (the existing diff-gate
  snapshot assumes the writer has exited; a long-lived container breaks that
  invariant unless we quiesce). Otherwise the audit races the agent (TOCTOU).
- Defense in depth is preserved: writes land on the bind-mounted worktree, so the
  host diff-gate + `checkPatchSafety` + secret redaction + action broker all
  still run unchanged. The container adds OS *prevention*; the gate keeps
  *detection*.

---

## 7. How it preserves the existing safety model

Nothing in S0-S5 is removed; isolation makes parts *real*. Action broker still
gates `provider.spawn` (now "spawn under <mode>") and records the mode + isolation
level as evidence. Diff-gate/`checkPatchSafety`/redaction unchanged. Path guards
still bound API reads; the sandbox additionally bounds the *agent's own* reads.
`forbiddenPaths`/`forbiddenOperations` stop being advisory prompt text and become
OS-enforced - stated honestly only for modes that actually enforce them. No
secrets in images/config; env-ref creds only; `.env` never mounted unless a path
is explicitly opted in.

---

## 8. Config surface

```yaml
execution:
  isolation: off            # off | provider-native | docker
  provider_native:
    mode: workspace-write   # read-only | workspace-write   (maps to codex --sandbox / claude equiv)
  docker:
    image: vibestrate/sandbox-claude:pinned   # or:
    dockerfile: ./Dockerfile.agent            # project toolchain, content-hashed
    network: provider-only                    # provider-only | host  (NOT "disabled")
    rootless: true
    resources: { pids: 512, memory: 4g }
```

Per-flow/step override (`flow.yml` step `isolation:`); the `sandbox-suggested`
posture upgrades `off → provider-native` (or `docker`) where configured - never
downgrades, suggestion not hard rule (the raw ask's "configurable, no hard
rules"); selection surfaced in `selection.json` + the supervisor panel.

---

## 9. Slices (reordered by the review)

1. **Routable execution + provider-native sandbox (M).** Add `run()` + `isolation`
   to the interface; dispatch `runArgvCommand` through it (local-worktree
   byte-identical, proven by an unchanged-output test). Provider-native mode:
   inject `codex --sandbox`/claude's flag on the host execa; `isolation` reports
   the real per-provider level; a provider without a sandbox → `filesystem: none`
   + an honest assurance note. **The cheap, big, low-risk win.** Tests: dispatch
   unit tests with a stub backend; a gated real-CLI smoke that the sandbox flag
   is passed and a forbidden write is OS-refused.
2. **Docker mode (L, gated by a real-docker spike).** Container-per-run,
   worktree + `:ro` artifacts mount, **path translation** (4a), the **`docker
   exec` option matrix incl. tree-kill rewrite** (4b), explicit **env allowlist**
   (§5), `node_modules` **named volume**, **rootless** default, **self-destruct
   TTL**, loud fallback + `vibe doctor` check. Gating spikes *before* coding: (a)
   does claude/codex run headless in a minimal container with the translated
   mounts; (b) is `pnpm install` + a lint on a representative repo under a perf
   budget with the named volume. If either fails, provider-native (slice 1)
   stands on its own and docker is reconsidered.
3. **Credential + egress proxy (L).** Host proxy holds creds; container is
   credential-free and reaches only the proxy → the first credential-safe sandbox
   (closes T-cred, narrows + audits T-exfil). Required before any mode is marketed
   as a full sandbox.
4. **Selection + posture + deps polish (M).** `execution.isolation` honored;
   per-flow/step; `sandbox-suggested` upgrade; assurance **flag when a
   sandbox-suggested run ran unsandboxed** (ties to T9 flags); devcontainer reuse;
   arch-gated read-only host-deps fast path.

## 10. Open questions

- Docker mode egress mechanism on Docker Desktop macOS (sidecar proxy vs
  in-VM policy) - likely converges with slice 3's proxy; resolve before claiming
  any docker egress control.
- Claude Code's exact sandbox surface + flag (codex is confirmed; claude needs
  the same verification before slice 1 claims it for claude).
- Container lifetime under the diff-gate quiesce requirement (§6) - pause vs stop
  between turns.

## 11. Recommendation

Build **slice 1 (routable execution + provider-native sandbox)** first: it
delivers the genuine headline win - **OS-enforced filesystem isolation, making
forbidden-read/-write real (S6)** - for codex (and claude, pending the flag
check) at near-zero cost, on the host, with no Docker dependency and no new
failure surface, while honestly reporting that **T-exfil/T-cred stay open**.
Treat **docker (slice 2)** as the heavier clean-room mode, gated behind the
headless + perf spikes, with the path-translation/option-matrix/env-allowlist/
named-volume/rootless/TTL work as real scope (not "a thin wrapper"). The
**credential proxy (slice 3)** is the prerequisite before any mode is described
as a full sandbox. Reject every framing that markets filesystem isolation as
"the agent is sandboxed." First concrete step before slice 1: confirm Claude
Code's sandbox flag (codex's is verified); first step before slice 2: the
headless-in-container + perf spike.
