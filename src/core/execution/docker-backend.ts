import { execa } from "execa";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { prepareWorktree } from "../../git/worktree.js";
import { VibestrateError } from "../../utils/errors.js";
import {
  DEFAULT_EGRESS_ALLOW,
  EGRESS_PROXY_PORT,
} from "./egress-proxy.js";
import type { EgressConfig } from "./execution-backend-schema.js";
import type {
  ExecutionBackend,
  ExecSpec,
  ExecStrategy,
  PrepareRunInput,
  PreparedExecution,
  CleanupInput,
} from "./execution-backend-schema.js";

// ── Container execution backend ────────────────────────────────
//
// Runs each provider turn inside a disposable Docker container whose blast
// radius is the container - model-agnostic isolation a provider-native sandbox
// can't give. Security posture:
//   - Mounts are kept to the minimum: the run's git worktree (RW, identical
//     host path so the host diff-gate/path-guard/attribution still resolve),
//     plus read-only single-file credential mounts where a provider needs one.
//     Nothing else - no docker socket, no project root, no $HOME, no ~/.ssh,
//     no ~/.aws. Adding a mount widens the blast radius; weigh it as such.
//   - The container env is built from a HARDCODED provider-auth allowlist, never
//     from the host process.env - so AWS_*/GITHUB_TOKEN never cross the wall.
//   - Hardened: --cap-drop=ALL, --security-opt=no-new-privileges, no --privileged.
//   - FAIL-CLOSED: if Docker is absent/down we REFUSE the run (with a "start/
//     install Docker" message) rather than silently run on the host while
//     reporting a sandbox. Host fallback is opt-in (`onUnavailable: "degrade"`).
//   - HONEST: the ExecStrategy.location is "container" only for commands that
//     actually ran via `docker exec`; the assurance posture keys off that.
//
//   - EGRESS is open by default and confinable on request
//     (`execution.container.egress.mode: allowlist`): the run container moves to
//     an `--internal` network with no gateway, and its only reachable peer is an
//     allowlisting CONNECT proxy. See egress-proxy.ts for why the topology - not
//     the HTTP(S)_PROXY env vars - is the enforcement.
//
// KNOWN LIMITATIONS: the `image` must carry the provider
// CLI (the host binary is the wrong arch); with the default open egress a
// credential read in-container can be exfiltrated (same data-plane risk as
// running the CLI, but the user is invited to point this at sketchier inputs, so
// backend=docker warns loudly), and even under an allowlist a CONNECT tunnel to
// an allowed model API is opaque TLS that data can be encoded into;
// rootless/userns-remap is not yet the default (hardened-rootful here);
// MCP-config turns and in-container validation are not supported.

/** Host env keys that may cross into the container (provider auth + our own).
 *  Read from {process.env, spec.env}; everything else is dropped. */
export const CONTAINER_ENV_ALLOWLIST: readonly string[] = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_API_BASE",
];

const CODEX_AUTH_FILE = path.join(os.homedir(), ".codex", "auth.json");

/**
 * The `-e KEY=value` flags the container gets - ONLY the allowlist, sourced from
 * the turn's intended env first, then the host env. Pure + testable: pass the
 * env maps explicitly so a test never depends on the ambient process.env.
 */
export function buildContainerEnvFlags(
  specEnv: Record<string, string>,
  hostEnv: Record<string, string | undefined>,
): string[] {
  const flags: string[] = [];
  for (const key of CONTAINER_ENV_ALLOWLIST) {
    const value = specEnv[key] ?? hostEnv[key];
    if (value !== undefined && value !== "") {
      flags.push("-e", `${key}=${value}`);
    }
  }
  // Our own VIBESTRATE_* keys (e.g. flags), only from the turn's intended env.
  for (const [k, v] of Object.entries(specEnv)) {
    if (k.startsWith("VIBESTRATE_") && v !== "") flags.push("-e", `${k}=${v}`);
  }
  return flags;
}

/**
 * The `docker exec` argv that runs one turn in the container. Pure. The env
 * flags are passed in (built by buildContainerEnvFlags) so this stays testable.
 */
export function buildDockerExecArgv(input: {
  containerId: string;
  cwd: string;
  envFlags: string[];
  command: string;
  args: string[];
}): string[] {
  return [
    "exec",
    "-i",
    "-w",
    input.cwd,
    ...input.envFlags,
    input.containerId,
    input.command,
    ...input.args,
  ];
}

/**
 * The `docker run -d` argv that starts the long-lived run container. Pure. Only
 * the worktree (RW) and an optional auth file (RO) are mounted; hardened flags;
 * no socket, no privileged. `sleep infinity` keeps it alive for `docker exec`.
 */
export function buildDockerRunArgs(input: {
  containerName: string;
  image: string;
  worktreePath: string;
  /** Absolute host file paths to mount read-only (e.g. codex auth.json). */
  roFileMounts: string[];
  /** Mount the container root read-only (writable = worktree + tmpfs only). */
  readonlyRoot: boolean;
  /** Cap in-container process count (fork-bomb guard). */
  pidsLimit: number;
  /** Egress confinement: the internal network to join and the proxy URL to
   *  advertise. Absent ⇒ default bridge networking (open egress). */
  egress?: { networkName: string; proxyUrl: string };
}): string[] {
  const args = [
    "run",
    "-d",
    "--name",
    input.containerName,
    // Findable for bulk cleanup if the host process is killed before teardown:
    //   docker rm -f $(docker ps -aqf label=vibestrate.managed=true)
    "--label",
    "vibestrate.managed=true",
    // Hardening: drop all caps, forbid privilege escalation. No --privileged,
    // no --network=host, no docker socket - the worktree is the only writable
    // surface that touches the host.
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    // Fork-bomb guard: cap the container's process count.
    `--pids-limit=${input.pidsLimit}`,
  ];
  if (input.egress) {
    // The `--internal` network has no gateway, so this container has NO route
    // off it - the proxy container (the network's only other member) is the one
    // reachable peer. That missing route is the enforcement; the proxy env vars
    // below merely tell compliant clients where to go. NOT `--network none`,
    // which would also cut the proxy off and leave the run with no egress at all.
    args.push("--network", input.egress.networkName);
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) {
      args.push("-e", `${key}=${input.egress.proxyUrl}`);
    }
    // Never proxy loopback/link-local; some CLIs probe them.
    args.push("-e", "NO_PROXY=localhost,127.0.0.1,::1");
    args.push("-e", "no_proxy=localhost,127.0.0.1,::1");
  }
  if (input.readonlyRoot) {
    // Read-only root FS. The provider CLI still needs to write temp files and a
    // HOME (claude writes ~/.claude, npm/tools write caches), so give it two
    // disposable tmpfs mounts: /tmp and the default image HOME (/root for the
    // stock node:22 image). The worktree (RW volume below) is unaffected by
    // --read-only, and the codex auth mount stays RO. nosuid,nodev harden the
    // tmpfs against setuid/device tricks.
    args.push(
      "--read-only",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,size=1g",
      // HOME for the stock (root) image; small - only CLI config/cache/session.
      "--tmpfs",
      "/root:rw,nosuid,nodev,size=256m",
    );
  }
  args.push(
    // Identical-path worktree mount (RW): the host diff-gate / path-guard /
    // attribution all read this absolute path off run state.
    "-v",
    `${input.worktreePath}:${input.worktreePath}`,
    "-w",
    input.worktreePath,
  );
  for (const f of input.roFileMounts) {
    args.push("-v", `${f}:${f}:ro`);
  }
  args.push(input.image, "sleep", "infinity");
  return args;
}

/**
 * The `docker run -d` argv for the egress proxy sidecar. It joins the SAME
 * internal network as the run container (so the run can reach it) and is later
 * attached to `bridge` as well (so it can reach the internet) - the run
 * container is never on bridge, which is what makes the proxy the only way out.
 *
 * The proxy image is the run image: it already has to carry a node runtime, and
 * reusing it avoids a second pull. The proxy source is bind-mounted read-only
 * at a `.mjs` path so node loads it as ESM regardless of the image's
 * package.json.
 */
export function buildEgressProxyRunArgs(input: {
  containerName: string;
  image: string;
  networkName: string;
  /** Host path of the compiled egress-proxy module. */
  proxyModulePath: string;
  allow: readonly string[];
  pidsLimit: number;
}): string[] {
  return [
    "run",
    "-d",
    "--name",
    input.containerName,
    "--label",
    "vibestrate.managed=true",
    "--network",
    input.networkName,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    // This container is dual-homed (internal net + bridge), so it is the one
    // machine that could route the run container to the internet. Kernel IP
    // forwarding is on by default in a container; turn it off. The run
    // container also cannot install a route to it (that needs CAP_NET_ADMIN,
    // which --cap-drop=ALL removes there) - this is the second lock, so that
    // adding a capability later cannot silently open a full bypass.
    "--sysctl",
    "net.ipv4.ip_forward=0",
    `--pids-limit=${input.pidsLimit}`,
    "--read-only",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=64m",
    "-v",
    `${input.proxyModulePath}:${PROXY_MOUNT_PATH}:ro`,
    "-e",
    "VIBESTRATE_EGRESS_ENTRY=1",
    "-e",
    `VIBESTRATE_EGRESS_ALLOW=${input.allow.join(",")}`,
    input.image,
    "node",
    PROXY_MOUNT_PATH,
  ];
}

/** Where the proxy module is mounted inside the proxy container. `.mjs` so node
 *  parses it as ESM whatever the image's package.json says. */
const PROXY_MOUNT_PATH = "/vibestrate-egress-proxy.mjs";

/**
 * Resolve the COMPILED egress-proxy module on the host, so it can be
 * bind-mounted into the proxy container. It must be a real .js file: the
 * container runs it with its own node and knows nothing about TypeScript.
 *
 * Layout differs by install: the CLI ships as a single bundled `dist/index.js`
 * with the proxy emitted beside it (a separate tsup entry), while a source
 * checkout runs this module from `src/core/execution/`. Probe both rather than
 * assume, and return the tried paths so the caller can say what was missing.
 */
export async function egressProxyModulePath(): Promise<{
  file: string | null;
  tried: string[];
}> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Installed / bundled: dist/index.js -> dist/egress-proxy.js
    path.join(here, "egress-proxy.js"),
    // Source checkout after a build: src/core/execution -> <root>/dist/...
    path.join(here, "..", "..", "..", "dist", "egress-proxy.js"),
  ];
  for (const file of candidates) {
    try {
      await fs.access(file);
      return { file, tried: candidates };
    } catch {
      /* try the next layout */
    }
  }
  return { file: null, tried: candidates };
}

/**
 * Poll until the proxy is actually accepting connections inside its container,
 * or give up. Uses the container's own node (the image is required to have one)
 * so no extra tooling is assumed. Returns false rather than throwing; the caller
 * turns that into the fail-closed refusal.
 */
export async function waitForProxyReady(
  exec: (file: string, args: string[]) => Promise<{ exitCode: number }>,
  containerId: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  const attempts = opts.attempts ?? 20;
  const delayMs = opts.delayMs ?? 250;
  for (let i = 0; i < attempts; i += 1) {
    const probe = await exec("docker", [
      "exec",
      containerId,
      "node",
      "-e",
      `require("net").connect(${EGRESS_PROXY_PORT},"127.0.0.1")` +
        `.on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))`,
    ]);
    if (probe.exitCode === 0) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** Is the Docker daemon reachable right now? (CLI present AND `docker info` ok.) */
export async function dockerAvailable(): Promise<boolean> {
  try {
    const r = await execa("docker", ["info", "--format", "{{.ServerVersion}}"], {
      reject: false,
      timeout: 15_000,
    });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

const UNAVAILABLE_MESSAGE =
  'execution.backend is "docker" but the Docker daemon is not reachable. ' +
  "Start Docker Desktop (or install it: https://docs.docker.com/get-docker/) and retry. " +
  'To allow falling back to host execution instead, set execution.container.onUnavailable: "degrade" ' +
  "(NOT recommended - the run then executes on the host without the container sandbox).";

export type DockerBackendDeps = {
  image: string;
  onUnavailable: "fail" | "degrade";
  /** Mount the container root read-only (writable = worktree + tmpfs). */
  readonlyRoot: boolean;
  /** Cap in-container process count (fork-bomb guard). */
  pidsLimit: number;
  /** Outbound network policy. Absent ⇒ open egress (the default posture). */
  egress?: EgressConfig;
  /** Test seam: override the credential file probe + the host env. */
  authFile?: string;
  hostEnv?: Record<string, string | undefined>;
  /** Test seam: capture `docker run` / `docker rm` instead of really running. */
  exec?: (file: string, args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  available?: () => Promise<boolean>;
};

async function realExec(
  file: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const r = await execa(file, args, { reject: false, timeout: 120_000 });
  return { exitCode: r.exitCode ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * Build the container backend. When Docker is unavailable it FAILS (default) or
 * degrades to the local-worktree path (opt-in) - it never reports a container
 * sandbox it didn't create.
 */
export function makeDockerBackend(deps: DockerBackendDeps): ExecutionBackend {
  const runExec = deps.exec ?? realExec;
  const available = deps.available ?? dockerAvailable;
  const authFile = deps.authFile ?? CODEX_AUTH_FILE;
  const hostEnv = deps.hostEnv ?? process.env;

  return {
    id: "docker",
    async prepareRun(input: PrepareRunInput): Promise<PreparedExecution> {
      // 1. The worktree is prepared on the host either way (git lives on host).
      const prep = await prepareWorktree({
        projectRoot: input.projectRoot,
        runId: input.runId,
        branchPrefix: input.branchPrefix,
        worktreeDir: input.worktreeDir,
        startPoint: input.mainBranch,
      });

      // 2. Preflight: fail-closed when Docker is down (never silent host run).
      if (!(await available())) {
        if (deps.onUnavailable === "degrade") {
          // Honest degrade: no exec strategy ⇒ runs on host, location stays host,
          // so the assurance posture will NOT claim a container.
          return prep;
        }
        throw new VibestrateError("DOCKER_UNAVAILABLE", UNAVAILABLE_MESSAGE);
      }

      // 3. Mounts: worktree RW (in run args) + codex auth RO when present.
      const roFileMounts: string[] = [];
      try {
        await fs.access(authFile);
        roFileMounts.push(authFile);
      } catch {
        /* no codex credential on disk - claude/env-auth providers pass via -e */
      }

      // 4. Egress confinement (opt-in). Everything here is FAIL-CLOSED: if the
      //    network or the proxy can't be created we throw, because the
      //    alternative is a run that executes with full outbound access while
      //    the config claims an allowlist. A silent fallback to open egress is
      //    exactly the theater this feature exists to avoid.
      const egressMode = deps.egress?.mode ?? "open";
      let egressNetwork: string | null = null;
      let proxyContainerId: string | null = null;
      let egressForRun: { networkName: string; proxyUrl: string } | undefined;

      if (egressMode === "allowlist") {
        const allow = [...DEFAULT_EGRESS_ALLOW, ...(deps.egress?.allow ?? [])];
        const networkName = `vibestrate-egress-${input.runId}`;
        const proxyName = `vibestrate-proxy-${input.runId}`;

        // A host process killed mid-run leaks its network (containers get reaped
        // by label, networks do not). Docker's default address pool is finite -
        // roughly 30 of these and `network create` starts failing, which,
        // because this path is fail-closed, would block every allowlist run with
        // an error pointing nowhere useful. Sweep unused ones first; `prune`
        // only removes networks with no attached containers, so a concurrent
        // run's network is never touched.
        await runExec("docker", [
          "network",
          "prune",
          "-f",
          "--filter",
          "label=vibestrate.managed=true",
        ]);

        // `--internal` = a bridge network with no route off it, so the internet
        // and cloud metadata are unreachable. On its own that is not quite
        // enough: `--internal` filters FORWARDed traffic, but the HOST still has
        // an address on the bridge, and packets to it go through INPUT instead -
        // so anything the user has bound to 0.0.0.0 (a database, a dev server)
        // stays reachable from inside the "confined" container.
        //
        // `inhibit_ipv4` is what closes that: the host side of the bridge gets
        // no IPv4 address at all, so there is nothing on this network to address
        // it by. Container-to-container traffic and Docker's embedded DNS are
        // unaffected, which is all the run container needs to reach the proxy.
        const net = await runExec("docker", [
          "network",
          "create",
          "--internal",
          "-o",
          "com.docker.network.bridge.inhibit_ipv4=true",
          "--label",
          "vibestrate.managed=true",
          networkName,
        ]);
        if (net.exitCode !== 0) {
          throw new VibestrateError(
            "DOCKER_EGRESS_NETWORK_FAILED",
            `execution.container.egress.mode is "allowlist" but the isolated Docker network could not be created: ${net.stderr.trim() || net.stdout.trim()}. ` +
              `This needs Docker Engine 25 or newer (for the host-address inhibit that keeps your own localhost services out of reach of the run). Refusing to run with open egress.`,
          );
        }
        egressNetwork = networkName;

        const proxyModule = await egressProxyModulePath();
        if (!proxyModule.file) {
          await runExec("docker", ["network", "rm", networkName]).catch(() => {});
          throw new VibestrateError(
            "DOCKER_EGRESS_PROXY_MISSING",
            `The egress proxy module was not found (looked in: ${proxyModule.tried.join(", ")}). ` +
              `In a source checkout, run \`pnpm build\` first. Refusing to run with open egress.`,
          );
        }

        const proxyStart = await runExec(
          "docker",
          buildEgressProxyRunArgs({
            containerName: proxyName,
            image: deps.image,
            networkName,
            proxyModulePath: proxyModule.file,
            allow,
            pidsLimit: deps.pidsLimit,
          }),
        );
        if (proxyStart.exitCode !== 0) {
          // `docker run` can fail AFTER creating the container, and a network
          // with a leftover endpoint refuses to be removed - so remove the
          // container by name first or both leak.
          await runExec("docker", ["rm", "-f", proxyName]);
          await runExec("docker", ["network", "rm", networkName]);
          throw new VibestrateError(
            "DOCKER_EGRESS_PROXY_FAILED",
            `execution.container.egress.mode is "allowlist" but the egress proxy container could not start: ${proxyStart.stderr.trim() || proxyStart.stdout.trim()}. The image "${deps.image}" must carry a node runtime. Refusing to run with open egress.`,
          );
        }
        proxyContainerId = proxyStart.stdout.trim() || proxyName;

        // Give ONLY the proxy a route to the internet. The run container stays
        // on the internal network, so the proxy is its single exit.
        const bridged = await runExec("docker", [
          "network",
          "connect",
          "bridge",
          proxyContainerId,
        ]);
        if (bridged.exitCode !== 0) {
          await runExec("docker", ["rm", "-f", proxyContainerId]).catch(() => {});
          await runExec("docker", ["network", "rm", networkName]).catch(() => {});
          throw new VibestrateError(
            "DOCKER_EGRESS_PROXY_FAILED",
            `The egress proxy could not be attached to an outbound network: ${bridged.stderr.trim() || bridged.stdout.trim()}. Refusing to run with open egress.`,
          );
        }

        // `docker run -d` returns at container CREATE, not at listen(): it exits
        // 0 for a proxy that starts and immediately dies (a bad node in a custom
        // image, EADDRINUSE, OOM), and it returns before the port is up even on
        // the happy path. Without this probe the run would start against a dead
        // or not-yet-ready single exit and fail opaquely at the first model call.
        const ready = await waitForProxyReady(runExec, proxyContainerId);
        if (!ready) {
          await runExec("docker", ["rm", "-f", proxyContainerId]);
          await runExec("docker", ["network", "rm", networkName]);
          throw new VibestrateError(
            "DOCKER_EGRESS_PROXY_FAILED",
            `The egress proxy container started but never listened on port ${EGRESS_PROXY_PORT}. Check that the image "${deps.image}" has a working node runtime (\`docker logs ${proxyName}\`). Refusing to run with open egress.`,
          );
        }

        egressForRun = {
          networkName,
          proxyUrl: `http://${proxyName}:${EGRESS_PROXY_PORT}`,
        };
      }

      /** Tear down anything already created, in reverse order. Used by the
       *  failure paths below and by the returned teardown. A network cannot be
       *  removed while a container is attached, so the proxy goes first. */
      const teardownEgress = async () => {
        if (proxyContainerId) {
          await runExec("docker", ["rm", "-f", proxyContainerId]);
        }
        if (egressNetwork) {
          await runExec("docker", ["network", "rm", egressNetwork]);
        }
      };

      // 5. Start the disposable container.
      const containerName = `vibestrate-${input.runId}`;
      const runArgs = buildDockerRunArgs({
        containerName,
        image: deps.image,
        worktreePath: prep.worktreePath,
        roFileMounts,
        readonlyRoot: deps.readonlyRoot,
        pidsLimit: deps.pidsLimit,
        egress: egressForRun,
      });
      const started = await runExec("docker", runArgs);
      if (started.exitCode !== 0) {
        // Couldn't start the container - fail closed (do NOT fall through to
        // host). `docker run` can fail after CREATING the container, and a
        // leftover endpoint blocks `network rm`, so remove it by name first.
        await runExec("docker", ["rm", "-f", containerName]);
        await teardownEgress();
        throw new VibestrateError(
          "DOCKER_RUN_FAILED",
          `Failed to start the run container from image "${deps.image}": ${started.stderr.trim() || started.stdout.trim()}. ` +
            `Ensure the image exists locally (docker pull ${deps.image}) and carries the provider CLI the run uses.`,
        );
      }
      const containerId = started.stdout.trim() || containerName;

      // Pre-flight: with a read-only root, a custom/non-root image whose $HOME
      // isn't the tmpfs we mounted (/root) would EROFS deep inside the first
      // provider turn with an opaque error. Probe $HOME writability now and fail
      // LOUDLY with the fix, instead of silently mid-turn.
      if (deps.readonlyRoot) {
        const probe = await runExec("docker", [
          "exec",
          containerId,
          "sh",
          "-c",
          'touch "$HOME/.vibestrate-write-probe" && rm -f "$HOME/.vibestrate-write-probe"',
        ]);
        if (probe.exitCode !== 0) {
          await runExec("docker", ["rm", "-f", containerId]).catch(() => {});
          await teardownEgress();
          throw new VibestrateError(
            "DOCKER_READONLY_HOME",
            `The run container's root filesystem is read-only (execution.container.readonlyRoot) but the image "${deps.image}" ` +
              `has a HOME that is not writable inside it (typically a non-root image whose HOME is not /root). ` +
              `The provider CLI would fail to write its config/cache. Fix: use a root image (HOME=/root), or set ` +
              `execution.container.readonlyRoot: false to disable the read-only root for this project.`,
          );
        }
      }

      const exec: ExecStrategy = {
        location: "container",
        wrap(spec: ExecSpec) {
          const envFlags = buildContainerEnvFlags(spec.env, hostEnv);
          const args = buildDockerExecArgv({
            containerId,
            cwd: spec.cwd,
            envFlags,
            command: spec.command,
            args: spec.args,
          });
          // The host process is the `docker` CLI; it gets the normal host env
          // (it needs PATH to find docker). The CONTAINER env is only the -e
          // allowlist flags above - process.env never crosses the wall.
          return { command: "docker", args, env: {} };
        },
      };

      return {
        ...prep,
        exec,
        teardown: async () => {
          await runExec("docker", ["rm", "-f", containerId]).catch(() => {});
          // The network can only be removed once its members are gone, so this
          // order matters: run container, then proxy, then network.
          await teardownEgress();
        },
      };
    },
    async cleanup(input: CleanupInput): Promise<void> {
      void input;
      /* teardown is returned from prepareRun and called by the orchestrator. */
    },
  };
}
