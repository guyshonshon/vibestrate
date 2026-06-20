---
title: Container isolation - run in a disposable Docker container
description: Run each agent turn inside a throwaway Docker container so the blast radius is the container, not your machine - what it mounts, what it can't touch, and where it stops short.
section: concepts
slug: concepts/sandbox
---

By default a run executes on your machine, bounded by a git worktree and the [post-turn diff gate](concepts/safety). For an unattended run, or a task you don't fully trust, you can move the agent off your host entirely: set `execution.backend: docker` and each provider turn runs inside a **disposable Docker container**. The blast radius becomes the container, and it's the same wall no matter which provider runs - which a provider's own sandbox can't do (that only confines its own process).

<div class="docs-callout warn">

**Opt-in, off by default.** The container backend is a deliberate choice for an unattended or lower-trust run, not a tax on every run. With `execution.backend: local-worktree` (the default) nothing changes. Turn it on with `vibe config set execution.backend docker` or the dashboard config editor.

</div>

## You are not starting a VM per run

A common worry: "does it boot a virtual machine every time?" No. Docker Desktop (the Linux VM the daemon runs in) starts **once** and stays up - that's the one-time cost. Per run, Vibestrate creates a **container**, which is a namespaced process, not a VM. Starting one on a warm image is a fraction of a second.

It is a **fresh** container per run, on purpose. Disposability is the whole point: each run gets a pristine box with no leftover files, installed packages, or a previous run's stray process bleeding into the next; concurrent runs never cross-contaminate; and each run mounts its **own** worktree. Reusing one shared container would defeat all three. The cost that *does* add up is re-installing your project's dependencies inside the container, which is why pointing it at a pre-built image is the recommended setup.

## What crosses the wall - and what doesn't

The container can touch exactly two things from your host, and nothing else:

<div class="docs-cards">

**The run's worktree (read-write)**
Mounted at its real host path so your diff still flows back to the gate, review, and merge exactly as a host run. This is the only writable surface that reaches your machine.

**The codex credential (read-only)**
`~/.codex/auth.json`, mounted read-only and only when it exists - so the codex CLI stays authenticated inside the container. It cannot be modified or deleted from inside.

</div>

Nothing else is mounted: no Docker socket, no project root, no home directory, no `~/.ssh`, no `~/.aws`. The container runs `--cap-drop=ALL --security-opt=no-new-privileges`, never `--privileged`. A write **inside** the worktree appears on your host; a write **outside** it stays in the container and never reaches your machine.

### Host secrets do not leak in

The container's environment is built from a fixed **provider-auth allowlist** (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `OPENAI_API_KEY`, and a few siblings) plus Vibestrate's own variables. Your shell's `AWS_*`, `GITHUB_TOKEN`, and everything else **never become container environment variables** - the host environment is not forwarded across the wall.

## Fail-closed: it refuses rather than pretend

If `execution.backend` is `docker` but the Docker daemon isn't running, the run **refuses** with a message telling you to start (or install) Docker. It does **not** quietly fall back to running on your host while reporting a sandbox - a sandbox you didn't get is worse than an honest stop.

If you genuinely want "use the container when Docker is up, otherwise run on the host," opt into it explicitly with `execution.container.onUnavailable: degrade`. Even then the run records honestly that it ran on the host, so the [isolation posture](concepts/safety) never claims a container that wasn't there.

```yaml
# .vibestrate/project.yml
execution:
  backend: docker            # default: local-worktree
  container:
    image: my-org/vibestrate-agent:latest  # MUST carry the provider CLI
    onUnavailable: fail       # default. "degrade" = fall back to host (not recommended)
```

## The image must carry the provider CLI

`docker exec` runs the provider CLI **inside** the container, so the image has to have it installed - your host's `codex`/`claude` binary is the wrong architecture for a Linux container. Point `execution.container.image` at an image that bundles the provider CLI (and your project's toolchain). If the CLI isn't there, the turn fails clearly with "command not found" rather than hanging. For claude there is no on-disk credential to mount, so authenticate it in-container by providing `ANTHROPIC_API_KEY` (it rides the allowlist).

## Where it stops short (read this before trusting it)

This slice gives you **filesystem and process isolation**, not a hardened jail for hostile code. Be honest with yourself about the gaps:

<div class="docs-callout warn">

**Network egress is open.** The container can reach the whole internet (it needs to reach the model API). A credential that's readable inside the container can therefore be sent anywhere by code the agent runs. So the container is **not** a safe box for genuinely malicious input - it raises the floor for an *unattended* run, it does not make "run arbitrary untrusted code" safe. Every container run prints this warning.

</div>

Also deferred for now, and tracked: the container runs rootful (rootless/user-namespace remap is not yet the default); an aborted or timed-out turn kills the `docker exec` client but the in-container process is reaped when the run ends, not instantly; and MCP-tool turns plus in-container validation are out of scope for this slice. An egress allowlist proxy, rootless-by-default, and remote/cloud execution backends are on the roadmap - the underlying strategy is already built to extend to them.

If the host process is killed before a run finishes, its container can linger. They're labelled, so you can reap any strays:

```
docker rm -f $(docker ps -aqf label=vibestrate.managed=true)
```

## How it fits the rest of the safety model

The container is the **hard wall**; it sits alongside, not instead of, the layers in [Safety](concepts/safety): the post-turn diff gate still checks every write, strict-apply-only still routes patches through the broker, and the run assurance verdict still summarizes what actually happened - now including whether the run really executed in a container. The provider-native OS sandbox (`execution.isolation`) is the cheaper, codex-only option for filesystem confinement on the host; the container backend is the model-agnostic one when you want the same wall around any provider.
