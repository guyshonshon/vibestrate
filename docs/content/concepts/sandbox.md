---
title: Container isolation
description: Move a run off your machine entirely, so the blast radius is a disposable container.
slug: concepts/sandbox
---

## In simple words

By default a run works on your machine, bounded by its own git [[worktree]] and the post-turn diff gate. For an unattended run, or a task you do not fully trust, you can move the agent **off your host entirely**: each provider turn then runs inside a disposable Docker container, and the blast radius becomes the container. Off by default.

One of the few things with no dashboard control. `vibe ui` opens the dashboard on `127.0.0.1:4317`; its **Config** page under **More** shows **Execution** read-only, with the command that changes it:

```bash
vibe config set execution.backend docker
```

What the dashboard *does* show is whether it worked: every run page ends in **Run assurance**, recording the run's **isolation posture** from per-turn provider evidence rather than config, so a run that ran on your host cannot report a container.

<div class="docs-callout tip">

**Tip.** You are not starting a virtual machine per run. Turning this on costs startup time, and nothing about your flows, crews or policies changes.

</div>

<div class="docs-callout">

**Did you know?** The network confinement is enforced by the *missing route*, not a proxy environment variable. `HTTPS_PROXY` is a request hostile code can ignore; having no gateway is not. That is why the docs claim an allowlist narrows exfiltration to hosts you chose, rather than a sandbox for arbitrary untrusted code.

</div>

## When it is worth turning on

<div class="docs-cards">

**Unattended runs**
Nobody is watching, so the wall should not be your attention.

**Code you did not write**
A task derived from an issue someone else filed.

**One wall for every provider**
A provider's own sandbox confines only its own process. The container confines whatever runs.

**Egress you want to name**
The container can sit on a network whose only route out is an allowlisting proxy.

</div>

## Going deeper

### Not a VM per run

Docker Desktop (the Linux VM the daemon runs in) starts **once** and stays up: that is the one-time cost. Per run comes a **container**, a namespaced process rather than a VM, which starts on a warm image in a fraction of a second.

**Fresh** per run, on purpose: no leftover files, no installed packages, no stray process from a previous run, no cross-contamination between concurrent runs, and each run mounts its **own** worktree. What does add up is re-installing your dependencies inside the container, which is why a pre-built image is the recommended setup.

### What crosses the wall

The container can touch exactly two things from your host, and nothing else:

<svg viewBox="0 0 560 148" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Only two things reach the run container from your host: the run's worktree read-write, and the codex credential read-only. The Docker socket, your home directory, .ssh and .aws are never mounted.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="300" y="1" width="259" height="146" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M256 58 h88"/><path d="M339 53 l5 5 l-5 5"/>
    <path d="M256 92 h88"/><path d="M339 87 l5 5 l-5 5"/>
    <path d="M256 126 h30"/>
    <path d="M291 119 l14 14"/><path d="M305 119 l-14 14"/>
  </g>
  <g fill="currentColor" font-size="12">
    <text x="248" y="62" text-anchor="end">the run's worktree</text>
    <text x="248" y="130" text-anchor="end">the Docker socket, HOME, .ssh, .aws</text>
    <text x="314" y="24">the run container</text>
  </g>
  <text x="248" y="96" fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="end">~/.codex/auth.json</text>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="248" y="24" text-anchor="end">your host</text>
    <text x="352" y="62">read-write</text>
    <text x="352" y="96">read-only</text>
    <text x="352" y="130">never mounted</text>
  </g>
</svg>

The **run's worktree** is mounted read-write at its real host path, so your diff still flows back to the gate, review and merge as a host run would, and it is the only writable surface reaching your machine. The **codex credential**, `~/.codex/auth.json`, is mounted read-only and only when it exists, so the codex CLI stays authenticated without being modifiable from within.

Nothing else is mounted, the project root included. A write **inside** the worktree appears on your host; a write **outside** it stays in the container. Host secrets do not leak in either, because the container's environment is built from a fixed **provider-auth allowlist** (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `OPENAI_API_KEY` and a few siblings) plus Vibestrate's own variables. Your shell's `AWS_*`, `GITHUB_TOKEN` and everything else never become container environment variables.

### Hardened, and it refuses rather than pretend

The container runs `--cap-drop=ALL --security-opt=no-new-privileges`, never `--privileged`, and shrinks its own writable surface and process budget:

<div class="docs-cards">

**Read-only root (`execution.container.readonlyRoot`, on)**
Only three places stay writable: the run's worktree, a tmpfs `/tmp`, and a tmpfs HOME. Turn it off only for a custom image that runs as a non-root user or writes elsewhere; the run probes HOME writability at start and fails loudly rather than half-working.

**Process cap (`execution.container.pidsLimit`, 512)**
A `--pids-limit` on the container, so a fork bomb inside a turn hits a wall instead of your host's process table.

</div>

If `execution.backend` is `docker` but the daemon is not running, the run **refuses** rather than falling back to your host while reporting a sandbox. For "use the container when Docker is up, otherwise the host", opt into `execution.container.onUnavailable: degrade` - and even then the run records honestly that it ran on the host.

```yaml
# .vibestrate/project.yml
execution:
  backend: docker   # default: local-worktree
  container:
    # the image MUST carry the provider CLI
    image: my-org/vibestrate-agent:latest
    # default. "degrade" falls back to the host
    onUnavailable: fail
    # default. writable: worktree, /tmp, HOME
    readonlyRoot: true
    # default. max processes (fork-bomb guard)
    pidsLimit: 512
```

`docker exec` runs the provider CLI **inside** the container, so the image must carry it - your host's `codex` or `claude` binary is the wrong architecture for Linux. The default image is a Node toolchain with no provider CLI, so point `execution.container.image` at one bundling the CLI and your project's toolchain; a missing CLI fails the turn with "command not found" rather than hanging. claude has no on-disk credential to mount, so authenticate it in-container with `ANTHROPIC_API_KEY`, which rides the allowlist.

### Confining the network

By default the container has normal networking, because it has to reach the model API. Turn that off with an **egress allowlist**:

```
vibe config set \
  execution.container.egress.mode allowlist
```

The run container then sits on a Docker network created with `--internal`, which has **no gateway**, so there is no route off it at all. Its only other member is a small proxy container Vibestrate starts alongside the run; that one is on an outbound network too, and tunnels only to allowlisted hosts, refusing everything else with a 403 naming the host.

<div class="docs-callout">

**The enforcement is the network, not the proxy setting.** The container does get `HTTP_PROXY` and `HTTPS_PROXY` pointing at the proxy, but those only tell a well-behaved client where to go. Code that ignores them and opens a raw socket finds no route.

Measured from inside a confined container: no default route, public IPs unreachable with `ENETUNREACH`, `169.254.169.254` (cloud metadata) unreachable, external DNS returning SERVFAIL, and adding a route back out failing with `Operation not permitted` because `--cap-drop=ALL` removes `CAP_NET_ADMIN`.

**Your own localhost services are out of reach too.** `--internal` only filters *forwarded* traffic, and the host normally keeps an address on the bridge, so a database or dev server bound to `0.0.0.0` would otherwise still be reachable. The network is created with the host's address inhibited, so there is nothing on it to address the host by. That needs Docker Engine 25 or newer; on an older daemon the run is refused rather than started with the weaker network.

</div>

Allowed out of the box: the model API endpoints the supported provider CLIs need (`api.anthropic.com`, `api.openai.com` and their auth and telemetry siblings). Add your own, as an exact host or `.example.com` to include subdomains:

```
vibe config set execution.container.egress.allow \
  '["registry.npmjs.org", ".github.com"]'
```

A host you did not list is logged as an exact refusal (`egress DENY connect <host>:443`). Only ports 80 and 443 are tunnelled: a `CONNECT` to an arbitrary port is a generic TCP tunnel, not web egress, and is refused even for an allowed host. Setting up the network or the proxy is **fail-closed** - if either cannot be created the run is refused, rather than executing with full outbound access while the config claims an allowlist.

<div class="docs-callout warn">

**What an allowlist does not close.** Three honest limits:

- The proxy tunnels TLS, so it cannot see inside a connection to a host you allowed. Data can still be encoded into an otherwise-legitimate request to an allowed model API. Hostname allowlisting **narrows** exfiltration to the hosts you named; it does not eliminate it.
- MCP-tool turns do not run under the container backend at all, so their egress is not covered by this.
- The proxy is not authenticated, so other containers on your default Docker bridge can use it. It only ever relays to allowlisted hosts, so the blast radius is small, but it is not private.

</div>

### Where it stops short

This is **filesystem, process, and opt-in network isolation**, not a hardened jail for hostile code.

<div class="docs-callout warn">

**With the default `egress.mode: open`, the container can reach the whole internet**, so a credential readable inside it can be sent anywhere. In that posture the container is **not** a safe box for genuinely malicious input: it raises the floor for an *unattended* run, it does not make "run arbitrary untrusted code" safe. Every container run prints this warning. Switch to `allowlist` before pointing this at input you do not trust.

</div>

Also deferred, and tracked: the container runs rootful, so rootless and user-namespace remap are not yet the default; an aborted or timed-out turn kills the `docker exec` client but the in-container process is reaped when the run ends, not instantly; MCP-tool turns and in-container validation are out of scope.

Each run's network and container are disposable and labelled. A Vibestrate process killed outright can leave either behind, and Docker's address pool is finite, so enough strays eventually block new runs. Unused networks are swept at run start; to reap by hand:

```
docker network prune -f \
  --filter label=vibestrate.managed=true

docker rm -f \
  $(docker ps -aqf label=vibestrate.managed=true)
```

### How it fits the safety model

The container is the **hard wall**, sitting alongside rather than instead of the layers in [Safety](/docs/concepts/safety). The post-turn diff gate still checks every write, strict apply-only still routes patches through the broker, and Run assurance still summarises what happened - now including whether the run really executed in a container. The provider-native OS sandbox (`execution.isolation`) is the cheaper, codex-only option for filesystem confinement on the host; the container backend is the model-agnostic one.
