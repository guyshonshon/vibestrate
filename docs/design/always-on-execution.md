# Always-on / unattended execution (running while you are away)

Status: **Proposed (design only - nothing shipped).** Informed by a multi-agent
analysis of the scheduler, run-lifecycle, approval, auth, and OS subsystems, and
by an independent adversarial review recorded at the end. It extends the spine
([`responsible-orchestrator.md`](./responsible-orchestrator.md)) and
[`unattended-resilience.md`](./unattended-resilience.md): the orchestrator owns
judgment, bounded by deterministic evidence, and humans keep authority over
irreversible/outward actions.

## The physics constraint (read this first)

"Run when my laptop is closed" is not, first, a feature request - it is a request
to run on something that is not asleep. Closing a MacBook lid on battery puts the
machine to sleep: the CPU halts, and **every** local process freezes - the Node
orchestrator and the vendor CLI subprocesses alike. No local trick reliably
defeats lid-close-on-battery. `caffeinate` prevents the **idle** timer only;
clamshell-awake historically needs AC power plus an external display; `pmset
disablesleep` is a hacky, battery-hostile override.

So the honest framing is tiered by what is actually running:

- Keep the machine **awake** while it would otherwise idle (lid open, or
  AC/clamshell).
- Keep the **scheduler** alive across terminal-close / logout / reboot (a real OS
  service, not a terminal child).
- Run on a **separate always-on host you control** - the only thing that answers
  "the laptop is shut in my bag."

A subtlety that matters for correctness: sleep **pauses**, it does not kill. A
frozen process resumes on wake - but if the freeze outlasted the scheduler's lock
heartbeat, a competing spawn can reclaim the lock and SIGKILL the **scheduler
loop** (the lock holder). Task runs are spawned **detached** in their own process
group, so they are not group-killed with the loop - instead they become **orphans
with no supervising loop**, and the new loop can double-launch the same task. So
even "stay awake" tiers have a sleep/wake edge, and the fix is loop-startup
reconciliation of in-flight runs, not just "grace the heartbeat" (see Hazards).

## What already exists (so this extends, it does not reinvent)

Verified against the code:

- A real **scheduler loop** - `runSchedulerLoop` (`src/scheduler/scheduler-service.ts`)
  is process-agnostic and **disk-resumable**, single-owner via an advisory lock
  (`src/scheduler/scheduler-lock.ts`, heartbeat with `LOCK_HEARTBEAT_STALE_MS`).
  `vibe queue run` acquires/releases it; `ensure-running.ts` auto-spawns it on
  enqueue ("queueing = work starts").
- **`managed-scheduler.ts`** spawns the loop as a **child of `vibe ui`** and
  SIGTERM/SIGKILLs it on UI shutdown. So today the scheduler dies when the
  launching UI/terminal dies - it is **not** an OS daemon.
- **Detached runs** go through `dist/run-entry.js` (`src/core/detached-run.ts`),
  the one audited core path the UI and CLI share.
- **Unattended ceilings** exist (`maxTurnsPerRun`, `maxWallClockMinPerRun`,
  per-day variants, spend cap) and a **`--unattended`** flag - but `--unattended`
  only forces budget `onLimit -> stop` and resilience `onExhausted -> fail`
  (`orchestrator.ts:4899`, `:5026`). **It does not cover approvals.**
- **Remote is already sovereign-by-construction:** `server.ts:158` refuses to bind
  a non-loopback host without `VIBESTRATE_API_TOKEN`, and gates every `/api/*`
  with a bearer token when one is set. "Remote" means your own token-gated box,
  never a Vibestrate-operated relay.
- **Gaps:** no `caffeinate`/`launchd`/`systemd` anywhere; run `state.json` records
  **no pid** (`state-machine.ts`), so a killed run looks alive forever; and the
  unattended approval path hangs (next section).

## The real problem is autonomy at gates, not the host

Leaving the scheduler running is worthless - worse, actively harmful - until the
gate behavior is honest. Today a run pauses at any of four triggers: an
agent-emitted `HUMAN_APPROVAL: REQUIRED`, a `policies.requireApprovalAtStages`
stage, a flow approval-gate step, or a `file.patch` diff-gate `require_approval`.
The wait is `awaitApprovalRequest` -> `approvalService.waitForResolution(id, {pollMs:1500})`
(`orchestrator.ts:3710`, called at `:2078`/`:2961`). `waitForResolution` *accepts*
a `timeoutMs` (`approval-service.ts:163`) but the unattended path does not pass
one, so a gated run **hangs forever**, burning a scheduler worker, and on a later
crash leaves a `state.json` frozen at `waiting_for_approval` that the dashboard
reports as alive indefinitely.

This is the single biggest footgun. A supervised scheduler that picks up a gated
task while you are away does not "keep working" - it wedges. **Fix autonomy first;
install a daemon second.** Your own `test.txt` runs are sitting in exactly this
state right now.

### The autonomy posture (the central design)

- **Default: BLOCK (stall-and-queue), never auto-approve.** When unattended, a
  gate short-circuits to its non-approved branch and the run ends honestly as
  `blocked`, with the pending approval recorded to an **inbox**. No config can grant
  auto-approval of a human-mandatory gate. This is a behavior change from "hang
  forever" to "stop honestly," and it is the prerequisite slice. **Important:**
  `blocked` is a terminal state (`state-machine.ts:341`, no outgoing transitions),
  so resolving an inbox item does **not** resume the original run - it enqueues a
  fresh `resumeFrom` fork from the gated stage (in-place resume is the deferred XL
  work). The inbox is "decide later and re-launch," not "unpause."
- **Optional, bounded `auto-low-risk` posture.** A project may opt into
  auto-approving a gate **only** when the change is low-risk by deterministic
  signal **and** the stage is on an explicit allowlist (this ties into the
  `express`/low-risk path in [`proportional-orchestration.md`](./proportional-orchestration.md)
  and the supervisor personas). It is bounded, logged as evidence, and fail-closed:
  unknown risk or unlisted stage falls back to BLOCK.
- **`forbidAutoPush` / `forbidAutoMerge` stay absolute.** Unattended changes stop
  at `merge_ready` / `blocked`; a human merges. There is no push/merge code today
  and none is added here. Humans keep authority over every irreversible/outward
  action, code-enforced - the autonomy posture cannot reach past it.
- **Crash honesty.** Record run liveness on `state.json` at spawn (absent today),
  and on scheduler startup run a **liveness sweeper** that marks dead, non-terminal
  runs as `blocked`. The death signal must be **pid-reuse-immune**: bare
  `isProcessAlive` (`scheduler-lock.ts:52`) is ESRCH-only, and on a long-uptime
  T2/T3 host a recycled pid will make a dead run read as alive (the very zombie this
  kills, resurrected). So record `{pid, startedAt, host}` and treat a run as alive
  only when the pid is live **and** its process start-time matches - or, simpler and
  reuse-immune, give each run a heartbeat-touch file (mirroring the scheduler's own
  `lastUpdatedAt` liveness) and sweep on staleness. `isProcessAlive` is meaningless
  cross-host, so the sweeper only judges runs whose recorded `host` is this host.
  True mid-run resume (continue a stalled run in place) is a distinct XL effort and
  is out of scope; the cheap honest move is "mark it dead, re-fork for a fresh
  decision" (see the BLOCK posture below, which is also a re-fork, not a resume).

## The host tiers

| Tier | Survives | Does NOT survive | Mechanism | Local-first | Effort |
|---|---|---|---|---|---|
| **T0 keep-awake** | idle sleep (lid open / AC) | terminal-close, logout, reboot, lid-closed, off | run-scoped `caffeinate -i -w <pid>` (macOS) / `systemd-inhibit` (Linux), released on drain | yes | S |
| **T1 per-user agent** | terminal-close, parent UI exit, reboot-then-**login** | logout (restarts at next login), lid-closed-on-battery, logged-out machine | `vibe scheduler install` writes `~/Library/LaunchAgents/...plist` (or `systemd --user`) running `queue run` permanently | yes | M |
| **T2 root daemon** | reboot **without** login, logout | lid-closed-on-battery, machine-off | `LaunchDaemon` / system unit, **must run AS the user** (`UserName` key) or vendor creds resolve to root's empty `~/.claude`; sudo-gated, non-default | partial (wider surface) | L |
| **T3 always-on host** | **laptop closed / off entirely** | (host's own downtime) | run the same Vibestrate on a box you control (mini-PC / home server / your own VM), dashboard over Tailscale/SSH; `server.ts` token-gates the bind | yes (sovereign) | doc/pattern |

T1 is the recommended default for "I closed the terminal / logged back in." Only
**T3** answers "the laptop is shut." There is no honest local tier between T2 and
T3 for lid-closed-on-battery, because the CPU is off.

### Hazards the daemon tiers must handle

- **Sleep/wake loop reclaim.** A scheduler loop frozen by sleep past
  `LOCK_HEARTBEAT_STALE_MS` (15s, wall-clock) looks wedged; on wake a racing spawn
  can SIGKILL it via `getLockReclaimReason`, orphaning its detached in-flight runs
  and risking a double-launch. The reclaim input is `LOCK_HEARTBEAT_STALE_MS`
  **only** - `OFFLINE_AFTER_SECONDS` (`scheduler-liveness.ts:31`) is a UI/display
  verdict, not a reclaim knob, so raising it changes a badge, not safety (and it is
  duplicated in `src/ui/lib/schedulerLiveness.ts` - the two will drift). A
  cross-process "monotonic-clock jump = we woke" heuristic is **not implementable**:
  the timestamps are wall-clock (`Date.now`) and two processes cannot share a
  monotonic origin. The implementable fix is a **generous daemon-tier
  `LOCK_HEARTBEAT_STALE_MS`** (minutes, not 15s) plus a one-shot grace after a
  detected large wall-clock gap, or subscribing to an OS wake notification
  (`IORegisterForSystemPower` via a helper). Either way, the new loop must
  **reconcile `runningTaskIds` against live runs on startup** (using the
  reuse-immune liveness above) before launching anything.
- **Same-host lock war.** The UI-child `managed-scheduler` and an installed
  LaunchAgent are **both** legitimate loop owners on one host and will fight for the
  lock. The installer must enforce single ownership (e.g. the managed child stands
  down when an agent is installed, or the agent is the sole owner and `vibe ui` only
  observes), not let two loops reclaim each other in a cycle.
- **Cross-host lock wedge.** Cross-host locks are never reclaimed (host mismatch is
  trusted). A shared/NFS `.vibestrate` or a renamed host can write a lock no local
  process can take, wedging the scheduler permanently. Needs a
  `vibe scheduler unlock --force` escape hatch.
- **Minimal launchd env.** A unit does not get a login shell; a config that "works
  in my terminal" can fail to find the vendor CLI or its creds. The installer must
  set absolute `ProgramArguments` plus needed `EnvironmentVariables` (or a
  login-shell wrapper) and **verify at install time** with `runSafeProviderTest`,
  surfacing `needsLogin` honestly rather than failing silently at 3am.
- **Credential expiry on headless hosts (T2/T3).** A one-time interactive `claude`
  login produces an OAuth session that **expires**; by design there is no
  programmatic refresh, so weeks later every run silently fails `needsLogin` exactly
  when no human is watching. The honest mitigation on an always-on box is an
  `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in the daemon's env (the presets already
  accept it, `provider-presets.ts`) - an API key does not lapse like an OAuth
  session. This is still env-inheritance (no stored/forwarded creds), so it does not
  breach the auth invariant; it is a deliberate posture choice for headless tiers.

## Auth on a headless / remote host

Vibestrate holds no credentials. The sole auth channel is **env inheritance**:
`command-runner.ts` spawns the vendor CLI with `{...process.env, ...input.env}`,
so `claude`/`codex`/etc authenticate from their own on-disk creds (`~/.claude`)
and inherited env. Login is out-of-band and interactive (`provider-presets.ts`
`loginCommand`, e.g. bare `claude` = browser OAuth); there is **no programmatic
login path, by design**. Consequences:

- A T1 user-agent inherits the user's vendor creds automatically.
- A T2 root daemon must run **as the user** or auth resolves to root's empty home
  and every run fails.
- A T3 remote box needs a **one-time interactive login on that box** (SSH in, run
  `claude` once). This is the real friction of "run elsewhere," and it is setup,
  not code.

## Non-negotiables

1. **No Vibestrate cloud backend, no hosted relay.** Every tier is the user's own
   local OS unit or the user's own token-gated host (`server.ts` enforces the
   non-loopback token gate). Never a hosted bot.
2. **No auto-push, no auto-merge - ever**, including unattended. Runs stop at
   `merge_ready`/`blocked`; a human merges. No such code exists; none is added.
3. **Unattended-approval default is BLOCK.** No config grants auto-approval of a
   human-mandatory gate; the optional `auto-low-risk` posture is bounded,
   deterministic, allowlisted, and fail-closed.
4. **Env-inheritance auth only.** The daemon never reads, stores, or forwards
   vendor creds; `http-api` keys stay `env:` refs, never literals, never logged.
5. **No secrets exposure.** No `.env` into prompts/artifacts/logs/UI; the diff-gate
   secret+path guards and the scheduler-log sanitization stay.
6. **No arbitrary shell from HTTP; the browser never spawns commands.**
   `vibe scheduler install/uninstall` and `caffeinate` are CLI/local-process
   actions. There is **no** existing core action that writes a plist or runs
   `launchctl` - Slice 3 invents one, and it is the single highest-risk
   implementation step. It must be a **fixed-argument local-core action** (the
   plist path and contents are derived internally from project state, never from
   HTTP-supplied parameters), invoked the same way `startDetachedRun` /
   `ensureSchedulerRunning` are today (no `child_process`/`execa` in a server
   route). The dashboard triggers that exact audited action; it does not template a
   command from request input.
7. **Honest state.** A dead run is marked dead, not shown as in-flight; a stalled
   gate is `blocked` with a queued approval, not a silent hang.

## Minimal first slice (autonomy before daemon)

1. **[Slice 1 - the prerequisite] Honest unattended gates + crash honesty.** In
   unattended mode, a gate stalls to `blocked` (pass a `timeoutMs` / short-circuit
   the non-approved branch) and queues the approval to an inbox (resolving it
   re-forks via `resumeFrom`, not in-place resume); record reuse-immune run liveness
   (`{pid, startedAt, host}` + start-time match, or a per-run heartbeat-touch file)
   on `state.json`; add a startup sweeper that marks dead, same-host, non-terminal
   runs `blocked` and reconciles `runningTaskIds`. Model-free, no daemon, kills the
   silent-hang footgun. Ship this even if nothing else ships.
2. **[Slice 2] T0 keep-awake.** Opt-in run-scoped `caffeinate`/`systemd-inhibit`,
   released on drain. Pure local, audited, never browser-triggered.
3. **[Slice 3] T1 per-user agent installer.** `vibe scheduler install` (LaunchAgent
   / `systemd --user` with `enable-linger`), as a fixed-arg local-core action (NN#6),
   with the daemon-tier `LOCK_HEARTBEAT_STALE_MS` raise + wake-grace, single-owner
   coordination vs the UI-child scheduler, the `unlock --force` escape hatch, and an
   install-time `runSafeProviderTest` auth check. Dashboard shows status + triggers
   the same audited install action (never templates a command from request input).
4. **[Slice 4 - gated] T2 root daemon.** Sudo-gated, runs as the user, non-default,
   audited install/uninstall. Only for users who explicitly want boot-without-login.
5. **[Slice 5 - pattern, not a service] T3 run-on-your-own-host guide.** A
   deployment doc (provision a box, one-time `claude` login, token-gated bind,
   Tailscale/SSH to the dashboard). No hosted product.

## Cut-list (rejected or deferred)

- A **Vibestrate-operated cloud relay / hosted runner** - rejected (violates the
  no-cloud/no-relay invariant; the user wants their own box, not ours).
- **Auto-approving a human-mandatory gate**, or any auto-push/auto-merge - rejected.
- The optional **`auto-low-risk`** posture - deferred out of Slices 1-4: it depends
  on a deterministic, fail-closed risk signal that does not exist yet (it is the
  proportional-orchestration work), and until it does, "bounded" is a promise, not a
  bound. It ships only behind merge-gate-level scrutiny, never before the honest
  BLOCK default is in place.
- **True mid-run resume** (continue a stalled run in place rather than re-fork from
  a stage boundary) - deferred (XL; `resumeFrom` already forks a fresh runId from a
  stage, which is the cheaper existing path).
- **OS-sandbox claims** - not made; the daemon runs as the user with the user's
  privileges.

## Open questions

- **Sleep/wake detection.** An OS wake notification (`IORegisterForSystemPower`)
  vs a generous daemon `LOCK_HEARTBEAT_STALE_MS` + wall-clock-gap grace, and the
  exact daemon threshold. (The cross-process monotonic heuristic is ruled out.)
- **The approval inbox UX.** How queued unattended approvals surface and batch-
  resolve (CLI + dashboard parity). The run model is decided (resolving re-forks via
  `resumeFrom`, not in-place resume); the open part is purely the surface.
- **Reuse-immune liveness mechanism.** Start-time-matched pid vs a per-run
  heartbeat-touch file - which is cheaper to maintain and clearly cross-platform.
- **The `auto-low-risk` boundary (if ever).** Which deterministic signals + stage
  allowlist, gated behind the same scrutiny as a merge gate - this depends on the
  proportional-orchestration risk signal existing and being fail-closed first (see
  Cut-list).

## Adversarial review (recorded)

A multi-agent workflow mapped the subsystems and generated the design angles that
inform this doc (its synthesis step stalled producing the long-form draft, so the
doc was authored from the salvaged analysis plus direct code verification of the
load-bearing claims).

An independent Opus review then verified every code claim against the tree (all
accurate) and returned **REVISE**, which this revision folds in full:

1. The lock guards the scheduler **loop**, not the detached run; sleep/wake reclaim
   **orphans** in-flight runs and risks double-launch (not "kills the healthy run").
   Fix: loop-startup reconciliation of `runningTaskIds`.
2. **Riskiest assumption (accepted):** bare-pid liveness is not a reliable death
   signal on long-uptime hosts (pid reuse resurrects the zombie). Fix: start-time-
   matched pid or a per-run heartbeat-touch file, host-scoped.
3. `OFFLINE_AFTER_SECONDS` is a UI verdict, not a reclaim input - dropped from the
   reclaim fix; reclaim is `LOCK_HEARTBEAT_STALE_MS` only (and is duplicated, will
   drift).
4. The cross-process monotonic-clock wake heuristic is not implementable (wall-clock
   timestamps; no shared monotonic origin). Replaced with a generous daemon
   threshold + wake-grace, or an OS wake notification.
5. T3 durability is gated by silent **credential expiry**; added as a hazard, with
   API-key env blessed for headless (still env-inheritance).
6. The UI-child scheduler and a LaunchAgent are both legitimate lock owners -
   same-host lock war; added single-owner coordination.
7. `blocked` is terminal, so inbox resolution **re-forks** via `resumeFrom`, not
   in-place resume; stated explicitly.

Security lens found **no breach** (token-gated non-loopback bind is code-enforced;
no auto-push/merge code; no shell-from-HTTP today). The one guardrail folded into
Non-negotiable #6 and Slice 3: the plist/`launchctl` install action must be a
fixed-argument local-core action, never templated from HTTP input.

A second adversarial review will be recorded before the first slice that runs a
daemon installer (Slice 3) or descends an autonomy gate.
