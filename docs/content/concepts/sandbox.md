---
title: Container isolation
description: Move a run off your machine entirely, so the blast radius is a disposable container.
slug: concepts/sandbox
---

## In simple words

By default a run works on your machine, bounded by its own git [[worktree]] and the post-turn diff gate. For an unattended run, or a task you do not fully trust, you can move the agent **off your host entirely**:

```bash
vibe config set execution.backend docker
```

Each provider turn then runs inside a disposable Docker container. The blast radius becomes the container.

<div class="docs-callout warn">

**It is off by default**, and the run records the confinement that was actually enforced, never what was merely configured. A run that could not start the container tells you so rather than quietly falling back to your host.

</div>

<div class="docs-callout tip">

**Tip.** You are not starting a virtual machine per run. It is a container per provider turn, which is why turning this on costs startup time rather than changing how a run behaves. Nothing about your flows, crews or policies changes.

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
The container can be placed on a network whose only route out is an allowlisting proxy.

</div>

<div class="docs-callout">

**Did you know?** The network confinement is enforced by the *missing route*, not by a proxy environment variable. Setting `HTTPS_PROXY` is a request that hostile code can ignore; having no gateway is not. That distinction is why the docs claim an allowlist narrows exfiltration to hosts you chose, rather than claiming a sandbox for arbitrary untrusted code.

</div>


## Going deeper

### Not a VM per run

A common worry: "does it boot a virtual machine every time?" No. Docker Desktop (the Linux VM the daemon runs in) starts **once** and stays up - that's the one-time cost. Per run, Vibestrate creates a **container**, which is a namespaced process, not a VM. Starting one on a warm image is a fraction of a second.

It is a **fresh** container per run, on purpose. Disposability is the whole point: each run gets a pristine box with no leftover files, installed packages, or a previous run's stray process bleeding into the next; concurrent runs never cross-contaminate; and each run mounts its **own** worktree. Reusing one shared container would defeat all three. The cost that *does* add up is re-installing your project's dependencies inside the container, which is why pointing it at a pre-built image is the recommended setup.

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

<div class="docs-cards">

**The run's worktree (read-write)**
Mounted at its real host path so your diff still flows back to the gate, review, and merge exactly as a host run. This is the only writable surface that reaches your machine.

**The codex credential (read-only)**
`~/.codex/auth.json`, mounted read-only and only when it exists - so the codex CLI stays authenticated inside the container. It cannot be modified or deleted from inside.

</div>

Nothing else is mounted: no Docker socket, no project root, no home directory, no `~/.ssh`, no `~/.aws`. The container runs `--cap-drop=ALL --security-opt=no-new-privileges`, never `--privileged`. A write **inside** the worktree appears on your host; a write **outside** it stays in the container and never reaches your machine.

### Host secrets do not leak in

The container's environment is built from a fixed **provider-auth allowlist** (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `OPENAI_API_KEY`, and a few siblings) plus Vibestrate's own variables. Your shell's `AWS_*`, `GITHUB_TOKEN`, and everything else **never become container environment variables** - the host environment is not forwarded across the wall.

### Hardened by default

On top of the dropped capabilities and no-privilege-escalation, the run container shrinks its own writable surface and process budget so a rogue or buggy agent has less to work with:

<div class="docs-cards">

**Read-only root (`execution.container.readonlyRoot`, on)**
The container's root filesystem is mounted read-only. Only three places stay writable: the run's worktree, a tmpfs `/tmp`, and a tmpfs HOME. An agent can't scribble across the rest of the image. Turn it off only for a custom image that runs as a non-root user or writes outside `/tmp` and `$HOME` - the run probes HOME writability at start and fails loudly rather than half-working.

**Process cap (`execution.container.pidsLimit`, 512)**
A `--pids-limit` on the container, so a fork bomb inside a turn hits a wall instead of your host's process table.

</div>

Both are configurable, and both are on top of the existing `--cap-drop=ALL --security-opt=no-new-privileges` (never `--privileged`).

### Fail-closed: it refuses rather than pretend

If `execution.backend` is `docker` but the Docker daemon isn't running, the run **refuses** with a message telling you to start (or install) Docker. It does **not** quietly fall back to running on your host while reporting a sandbox - a sandbox you didn't get is worse than an honest stop.

If you genuinely want "use the container when Docker is up, otherwise run on the host," opt into it explicitly with `execution.container.onUnavailable: degrade`. Even then the run records honestly that it ran on the host, so the [isolation posture](/docs/concepts/safety) never claims a container that wasn't there.

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

### The image needs the provider CLI

`docker exec` runs the provider CLI **inside** the container, so the image has to have it installed - your host's `codex`/`claude` binary is the wrong architecture for a Linux container. Point `execution.container.image` at an image that bundles the provider CLI (and your project's toolchain). If the CLI isn't there, the turn fails clearly with "command not found" rather than hanging. For claude there is no on-disk credential to mount, so authenticate it in-container by providing `ANTHROPIC_API_KEY` (it rides the allowlist).

### Confining the network (egress allowlist)

By default the container has normal networking and can reach the whole internet - it has to reach the model API. That means a credential readable inside the container can be sent anywhere by code the agent runs.

Turn that off with an **egress allowlist**:

```
vibe config set \
  execution.container.egress.mode allowlist
```

The run container is then placed on a Docker network created with `--internal` - a network with **no gateway**, so there is no route off it at all. The only other member is a small proxy container that vibestrate starts alongside the run; it is attached to an outbound network as well, and it tunnels only to allowlisted hosts, refusing everything else with a 403 that names the host.

<div class="docs-callout">

**The enforcement is the network, not the proxy setting.** The run container also gets `HTTP_PROXY`/`HTTPS_PROXY` pointing at the proxy, but those only tell a well-behaved client where to go. Code that ignores them and opens a raw socket finds no route, because an internal network has no gateway. That is the whole point: an allowlist proxy on a *routable* network would be security theater that one raw socket defeats.

Measured on the real thing, from inside a confined run container:

- No default route, and public IPs unreachable with `ENETUNREACH` - even for code that ignores the proxy variables entirely.
- `169.254.169.254`, the cloud metadata address, unreachable.
- External DNS through Docker's embedded resolver returns SERVFAIL.
- Adding a route back out fails with `Operation not permitted`, because `--cap-drop=ALL` removes `CAP_NET_ADMIN`.

**Your own localhost services are out of reach too.** `--internal` only filters *forwarded* traffic - the host normally keeps an address on the bridge, and packets to it take a different path - so a database or dev server bound to `0.0.0.0` would otherwise still be reachable from the "confined" container. The network is created with the host's address inhibited, so there is nothing on it to address the host by. This needs Docker Engine 25 or newer; on an older daemon the run is refused rather than started with the weaker network.

</div>

Allowed out of the box: the model API endpoints the supported provider CLIs need (`api.anthropic.com`, `api.openai.com` and their auth/telemetry siblings). Add your own - an exact host, or `.example.com` to include subdomains:

```
vibe config set execution.container.egress.allow \
  '["registry.npmjs.org", ".github.com"]'
```

If a run needs a host you didn't list, the proxy logs the exact refusal (`egress DENY connect <host>:443`) so you know precisely what to add. Only ports 80 and 443 are tunnelled: a `CONNECT` to an arbitrary port is a generic TCP tunnel, not web egress, and is refused even for an allowed host.

Setting up the network or the proxy is **fail-closed**. If either can't be created the run is refused, rather than quietly executing with full outbound access while the config claims an allowlist.

<div class="docs-callout warn">

**What an allowlist does not close.** Three honest limits:

- The proxy tunnels TLS, so it cannot see inside a connection to a host you allowed. Data can still be encoded into an otherwise-legitimate request to an allowed model API. Hostname allowlisting **narrows** exfiltration to the hosts you named; it does not eliminate it.
- MCP-tool turns don't run under the container backend at all, so their egress isn't covered by this.
- The proxy is not authenticated, so other containers on your default Docker bridge can use it. It only ever relays to allowlisted hosts, so the blast radius is small, but it isn't private.

</div>

Each run's network is disposable and labelled. If a vibestrate process is killed outright, its network can outlive it - and Docker's address pool is finite, so enough strays eventually block new runs. Vibestrate sweeps unused ones at run start; to do it by hand:

```
docker network prune -f \
  --filter label=vibestrate.managed=true
```

### Where it stops short

This gives you **filesystem, process, and (opt-in) network isolation**, not a hardened jail for hostile code. Be honest with yourself about the gaps:

<div class="docs-callout warn">

**With the default `egress.mode: open`, the container can reach the whole internet**, so a credential readable inside it can be sent anywhere. In that posture the container is **not** a safe box for genuinely malicious input - it raises the floor for an *unattended* run, it does not make "run arbitrary untrusted code" safe. Every container run prints this warning. Switch to `allowlist` above before pointing this at input you don't trust.

</div>

Also deferred for now, and tracked: the container runs rootful (rootless/user-namespace remap is not yet the default); an aborted or timed-out turn kills the `docker exec` client but the in-container process is reaped when the run ends, not instantly; and MCP-tool turns plus in-container validation are out of scope. Rootless-by-default and remote/cloud execution backends are on the roadmap - the underlying strategy is already built to extend to them.

If the host process is killed before a run finishes, its container can linger. They're labelled, so you can reap any strays:

```
docker rm -f \
  $(docker ps -aqf label=vibestrate.managed=true)
```

### How it fits the safety model

The container is the **hard wall**; it sits alongside, not instead of, the layers in [Safety](/docs/concepts/safety): the post-turn diff gate still checks every write, strict-apply-only still routes patches through the broker, and the run assurance verdict still summarizes what actually happened - now including whether the run really executed in a container. The provider-native OS sandbox (`execution.isolation`) is the cheaper, codex-only option for filesystem confinement on the host; the container backend is the model-agnostic one when you want the same wall around any provider.
