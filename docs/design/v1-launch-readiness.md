# V1 Launch Readiness

Status: assessed 2026-07-05 (v0.63.0). Six independent, code-grounded audits
(sandboxing, local attack surface, supply-chain/gateways, feature completeness,
performance, correctness/test-health). Every claim below is cited to `file:line`
in the audit trail; tags: [evidence] read the code, [inference] reasoned,
[guess] unknown.

## Context - the real question

The owner asked "are we ready for v1?" with sandboxing/virtualization as the
headline, on the premise "it's fully local, no servers, so nothing can be
stolen." That premise is the thing to test, not accept: Vibestrate's whole job
is to spawn coding-agent CLIs that **execute arbitrary code and write files on
the user's machine**. The threat isn't exfiltration to a Vibestrate server (there
is none) - it's **local**: an agent (buggy or prompt-injected) reading `~/.ssh` /
`~/.aws`, writing outside the worktree, or making network calls. "No cloud"
removes one class and leaves the scarier one.

Verdict up front: **the product is honest, well-defended at the HTTP boundary,
and feature-complete - but it is NOT sandboxed by default, and that is the one
gap that decides whether v1 can be *marketed* as safe local execution.** The
code never over-claims; the risk is a marketing/README claim outrunning the
default behavior.

## What exists vs partial vs foundation

| Capability | State | Evidence |
|---|---|---|
| HTTP boundary defense (Origin allowlist, Sec-Fetch-Site, no state-changing GET, token option) | **EXISTS, solid** | `server.ts:210-269` |
| Merge/apply hardening (conflicted-paths-only, symlink refusal, realpath containment, O_NOFOLLOW, fail-closed broker) | **EXISTS, strong** | `merge-service.ts:504-589`, `action-broker.ts:66-88` |
| Secret handling (secret-file refusal, content redaction at model-input/display, env-ref tokens, no leak to reports/notifications/metrics) | **EXISTS** | `diff-service.ts:43-199`, `notifications.ts:26-47` |
| Supply chain (0 known vulns, no install scripts, external gateways *removed* from code) | **EXISTS, clean** | `pnpm audit`, `gateway-registry.ts:11-12` |
| Core product loop (init->providers->spec-up->run->review->verify->diff->merge), policies, crews, supervisors, metrics, Conductor | **EXISTS, end-to-end** | feature audit |
| Provider-native sandbox (codex `--sandbox`) | **PARTIAL** - codex-only; claude warns+runs unsandboxed; off by default | `provider-apply.ts:244-269` |
| Docker execution backend | **PARTIAL** - real FS boundary, but egress OPEN, provider credential mounted, no in-container process reap on abort | `docker-backend.ts:112-138` |
| **OS-level sandbox on the DEFAULT run** | **FOUNDATION (missing)** - default `local-worktree` is a bare `execa` as the full host user; worktree is a cwd, not a wall | `local-worktree-backend.ts:8-19`, `command-runner.ts:105-119` |
| **Credential + egress proxy** (the "filesystem sandbox" -> "safe sandbox" unit) | **FOUNDATION (missing)** | TODO S6/T14, `docs/design/docker-backend.md` |

## Findings by launch tier

### Tier A - must fix before ANY launch (cheap, embarrassing)
- **A1 [BLOCKER]** `vibe saga create` is a **dead command** the README (`README.md:195`) and `docs/content/cli|concepts/saga.md` tell users to run. It was migrated to `vibe tasks --supervised`; `buildSagaCommand` is never registered (`cli/index.ts`). Copy-paste fails on line one of the flagship feature. Docs/README fix.
- **A2 [BLOCKER]** README calls the **shipped** Conductor "the planned next phase" (`README.md:195`) - undersells the headline autonomous feature. Same commit as A1.
- **A3 [MEDIUM, real]** Non-atomic `project.yml`/policies writes: `writeDocument`->`writeText` (plain `fs.writeFile`). Crash-mid-write can **truncate the project's own config**; concurrent CLI+UI edits lose-update. Cheap fix: temp+rename (pattern already at `project-params.ts:314`). `config-update-service.ts`, `project-policy-service.ts:108`.
- **A4 [MAJOR]** `POST /api/providers/:id/setup` accepts an arbitrary `command`+`args`; `POST /api/providers/:id/test` then `execa`s it - a **local process can turn the loopback API into "run any local binary"** (argv-only, same-origin-gated, so a web page can't reach it). Inconsistent with the config route's own `EXEC_VALUED_KEYS` "never take a shell command over HTTP" stance. Gate it (token-required, or allowlist detected commands). `providers.ts:278,344`.

### Tier B - the sandbox question (the headline; FOUNDATION, not cheap)
The default run has no OS isolation. To honestly market "safe local execution":
- **B1** A default-on OS sandbox at the `runArgvCommand` chokepoint (macOS `sandbox-exec`/Seatbelt, Linux `bubblewrap`/namespaces+seccomp) so the boundary isn't contingent on which CLI the user runs - OR make docker-isolation the default for untrusted-input runs. `command-runner.ts`.
- **B2** Docker egress lockdown (`--network` control) + a credential/egress proxy so the mounted provider credential can't be exfiltrated. `docker-backend.ts:112-138`.
- **B3** Route abort/timeout through `docker kill` of the container PID namespace (today it kills the `docker exec` client; the in-container agent keeps running with its egress channel). `command-runner.ts:122-146`.

This is weeks of work, not a checkbox. **The launch decision is whether v1 requires the hard sandbox, or launches with honest framing + opt-in isolation and the sandbox as a fast-follow.** The code is already honest, so the honest-framing path is viable; the only unacceptable option is marketing "safe/sandboxed" while the default isn't.

### Tier C - polish / fast-follow (non-blocking)
- **Perf:** cache `detectAllProviders()` off the poll path (up to 16 subprocess spawns x 4s timeout, uncached, on the metrics/providers polls - the sharpest real-world stall; do before launch). Lazy-load UI routes + de-visx the Home sparkline (1.35MB eager chunk). Cache `/api/runs`/`loadAllRuns`; O(n^2) aggregator filters -> Set. `provider-detection.ts:291`, `App.tsx:7-32`, `runs.ts:179`.
- **Security minor:** OTLP exporter endpoint not SSRF-guarded (`otel-exporter.ts:156`); no Host-header allowlist; artifact read lacks O_NOFOLLOW (`artifacts.ts:83`).
- **Honesty/docs:** codex/gemini token-cost is estimated not real (A7); no "secret-handling guarantees" docs page; docs "lead-simple" rewrite (T17) pending; no guided first-run tour (init screen + setup wizard exist, so acceptable).
- **Test hygiene:** de-flake `unattended-pause.test.ts` (last-alphabetical run picker + 40ms poll); isolate the shared worktree namespace to kill the effort-spawn collision. Both TEST-ONLY - the code paths fail loud, never corrupt.

## Build sequencing (dependency-ordered)
- **M0 (days):** Tier A - the docs/README truth fix (A1/A2), the atomic-config-write (A3), and gating provider-command-over-HTTP (A4). Plus the perf quick win (cache provider detection). All small, all ship-before-launch.
- **M1 (decision):** pick the sandbox launch posture (hard-sandbox-required vs honest-framing + fast-follow). This gates everything in Tier B.
- **M2 (weeks, if M1 = hard sandbox for v1):** the OS-sandbox foundation - scout first (a `sandbox-exec`/`bubblewrap` wrapper at the command-runner chokepoint proving one provider runs confined), then docker egress+credential proxy, then container reaping.
- **M3 (fast-follow):** Tier C polish - UI bundle split, remaining perf caches, OTLP guard, docs page, cost metrics, test de-flake.

## Open decisions
1. **Sandbox posture for v1** (the M1 fork above) - owner's call; determines whether M2 blocks launch.
2. A4: token-gate the provider-command write, or allowlist detected commands only?
3. A1: register `buildSagaCommand` as a deprecated alias, or delete it and fix docs to `vibe tasks`?

## Review trail
Six fresh-context audit agents, each grounding in code with file:line and a
launch-blocker verdict. Consolidated verdicts: supply-chain **acceptable**
(Telegram concern already removed from code), attack-surface **acceptable** (one
MAJOR: provider-command-over-HTTP), feature-completeness **acceptable** (docs
drift = the real risk), performance **no hard blocker**, correctness
**acceptable** (both flakes test-only), sandboxing **NOT on par** for a
safety-marketed v1 (the one genuine gap). The redaction primitive was
separately hardened this session (bounded regex, trailing-segment key test)
after an adversarial review caught a ReDoS + false-positive class in the first
attempt.
