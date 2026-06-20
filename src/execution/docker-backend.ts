import { execa } from "execa";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { prepareWorktree } from "../git/worktree.js";
import { VibestrateError } from "../utils/errors.js";
import type {
  ExecutionBackend,
  ExecSpec,
  ExecStrategy,
  PrepareRunInput,
  PreparedExecution,
  CleanupInput,
} from "./execution-backend-schema.js";

// ── Container execution backend (T14 slice 2) ────────────────────────────────
//
// Runs each provider turn inside a disposable Docker container whose blast
// radius is the container - model-agnostic isolation a provider-native sandbox
// can't give. Security posture (Tier-2 reviewed):
//   - EXACTLY two mounts: the run's git worktree (RW, identical host path so the
//     host diff-gate/path-guard/attribution still resolve), and the codex auth
//     credential (RO, single file) when present. Nothing else - no docker socket,
//     no project root, no $HOME, no ~/.ssh / ~/.aws.
//   - The container env is built from a HARDCODED provider-auth allowlist, never
//     from the host process.env - so AWS_*/GITHUB_TOKEN never cross the wall.
//   - Hardened: --cap-drop=ALL, --security-opt=no-new-privileges, no --privileged.
//   - FAIL-CLOSED: if Docker is absent/down we REFUSE the run (with a "start/
//     install Docker" message) rather than silently run on the host while
//     reporting a sandbox. Host fallback is opt-in (`onUnavailable: "degrade"`).
//   - HONEST: the ExecStrategy.location is "container" only for commands that
//     actually ran via `docker exec`; the assurance posture keys off that.
//
// KNOWN V1 LIMITATIONS (documented, tracked): the `image` must carry the provider
// CLI (the host binary is the wrong arch); egress is OPEN (a credential read
// in-container can be exfiltrated - same data-plane risk as running the CLI, but
// the user is invited to point this at sketchier inputs, so backend=docker warns
// loudly); rootless/userns-remap is not yet the default (hardened-rootful here);
// MCP-config turns and in-container validation are out of scope for this slice.

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
    // Identical-path worktree mount (RW): the host diff-gate / path-guard /
    // attribution all read this absolute path off run state.
    "-v",
    `${input.worktreePath}:${input.worktreePath}`,
    "-w",
    input.worktreePath,
  ];
  for (const f of input.roFileMounts) {
    args.push("-v", `${f}:${f}:ro`);
  }
  args.push(input.image, "sleep", "infinity");
  return args;
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

      // 4. Start the disposable container.
      const containerName = `vibestrate-${input.runId}`;
      const runArgs = buildDockerRunArgs({
        containerName,
        image: deps.image,
        worktreePath: prep.worktreePath,
        roFileMounts,
      });
      const started = await runExec("docker", runArgs);
      if (started.exitCode !== 0) {
        // Couldn't start the container - fail closed (do NOT fall through to host).
        throw new VibestrateError(
          "DOCKER_RUN_FAILED",
          `Failed to start the run container from image "${deps.image}": ${started.stderr.trim() || started.stdout.trim()}. ` +
            `Ensure the image exists locally (docker pull ${deps.image}) and carries the provider CLI the run uses.`,
        );
      }
      const containerId = started.stdout.trim() || containerName;

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
        },
      };
    },
    async cleanup(input: CleanupInput): Promise<void> {
      void input;
      /* teardown is returned from prepareRun and called by the orchestrator. */
    },
  };
}
