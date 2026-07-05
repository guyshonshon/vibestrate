import { describe, it, expect, beforeAll, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  buildContainerEnvFlags,
  buildDockerExecArgv,
  buildDockerRunArgs,
  dockerAvailable,
  makeDockerBackend,
} from "../src/execution/docker-backend.js";
import { VibestrateError } from "../src/utils/errors.js";

// ── P3 container backend ─────────────────────────────────────────────────────
// The pure arg/env builders carry the security guarantees; they run anywhere.
// The real-container smoke runs only when the Docker daemon is up.

describe("container arg + env builders (pure, daemon-free)", () => {
  it("env flags = ONLY the provider-auth allowlist (no host secrets cross)", () => {
    const flags = buildContainerEnvFlags(
      { ANTHROPIC_BASE_URL: "https://api.anthropic.com", VIBESTRATE_FLAGS: "x", RANDOM: "nope" },
      { ANTHROPIC_API_KEY: "sk-test", AWS_ACCESS_KEY_ID: "LEAK", GITHUB_TOKEN: "LEAK", HOME: "/Users/x" },
    );
    const joined = flags.join(" ");
    expect(joined).toContain("ANTHROPIC_API_KEY=sk-test");
    expect(joined).toContain("ANTHROPIC_BASE_URL=https://api.anthropic.com");
    expect(joined).toContain("VIBESTRATE_FLAGS=x");
    // The reviewer's hard gate: no ambient host secret may become a -e flag.
    expect(joined).not.toContain("AWS_ACCESS_KEY_ID");
    expect(joined).not.toContain("GITHUB_TOKEN");
    expect(joined).not.toContain("RANDOM");
    expect(joined).not.toContain("HOME=");
  });

  it("spec env wins over host env for an allowlisted key; empty values are dropped", () => {
    const flags = buildContainerEnvFlags(
      { ANTHROPIC_API_KEY: "from-spec", OPENAI_API_KEY: "" },
      { ANTHROPIC_API_KEY: "from-host" },
    );
    expect(flags.join(" ")).toContain("ANTHROPIC_API_KEY=from-spec");
    expect(flags.join(" ")).not.toContain("OPENAI_API_KEY");
  });

  it("docker run args: worktree RW (identical path), auth :ro, hardened, no socket/privileged", () => {
    const wt = "/private/tmp/wt/brave-otter";
    const args = buildDockerRunArgs({
      containerName: "vibestrate-brave-otter",
      image: "node:22-bookworm-slim",
      worktreePath: wt,
      roFileMounts: ["/Users/x/.codex/auth.json"],
      readonlyRoot: true,
      pidsLimit: 512,
    });
    const j = args.join(" ");
    expect(j).toContain(`-v ${wt}:${wt}`);
    expect(j).toContain("-v /Users/x/.codex/auth.json:/Users/x/.codex/auth.json:ro");
    expect(j).toContain("--cap-drop=ALL");
    expect(j).toContain("--security-opt=no-new-privileges");
    // Hardening flags.
    expect(j).toContain("--pids-limit=512");
    expect(j).toContain("--read-only");
    expect(j).toContain("--tmpfs /tmp:rw,nosuid,nodev,size=1g");
    expect(j).toContain("--tmpfs /root:rw,nosuid,nodev,size=256m");
    expect(j).not.toContain("--privileged");
    expect(j).not.toContain("docker.sock");
    expect(j).not.toContain("--network=host");
    // No host root / $HOME / ssh / aws mounts.
    expect(j).not.toContain("-v /:/");
    expect(args.slice(-3)).toEqual(["node:22-bookworm-slim", "sleep", "infinity"]);
  });

  it("readonlyRoot:false drops --read-only/tmpfs but keeps --pids-limit and caps", () => {
    const args = buildDockerRunArgs({
      containerName: "vibestrate-c",
      image: "node:22-bookworm-slim",
      worktreePath: "/private/tmp/wt/c",
      roFileMounts: [],
      readonlyRoot: false,
      pidsLimit: 256,
    });
    const j = args.join(" ");
    expect(j).not.toContain("--read-only");
    expect(j).not.toContain("--tmpfs");
    expect(j).toContain("--pids-limit=256");
    expect(j).toContain("--cap-drop=ALL");
  });

  it("docker exec argv: -i -w cwd <envFlags> containerId command args", () => {
    const argv = buildDockerExecArgv({
      containerId: "abc123",
      cwd: "/private/tmp/wt/x",
      envFlags: ["-e", "ANTHROPIC_API_KEY=k"],
      command: "codex",
      args: ["exec", "--json"],
    });
    expect(argv).toEqual([
      "exec", "-i", "-w", "/private/tmp/wt/x",
      "-e", "ANTHROPIC_API_KEY=k",
      "abc123", "codex", "exec", "--json",
    ]);
  });
});

// A temp git project so prepareWorktree (run on the host) succeeds. Under /tmp so
// Docker Desktop can bind-mount the worktree (its default file sharing covers it).
async function tempGitProject(): Promise<{ projectRoot: string; worktreeDir: string }> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-p3-proj-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: projectRoot });
  await execa("git", ["config", "user.email", "x@x"], { cwd: projectRoot });
  await execa("git", ["config", "user.name", "x"], { cwd: projectRoot });
  await fs.writeFile(path.join(projectRoot, "README.md"), "p3\n");
  await execa("git", ["add", "."], { cwd: projectRoot });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: projectRoot });
  const worktreeDir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-p3-wt-"));
  return { projectRoot, worktreeDir };
}

describe("container backend fail-closed (git only, no daemon needed)", () => {
  it("backend=docker + daemon down + onUnavailable=fail => REFUSES (no host fallback)", async () => {
    const { projectRoot, worktreeDir } = await tempGitProject();
    let ranDocker = false;
    const backend = makeDockerBackend({
      image: "busybox",
      onUnavailable: "fail",
      readonlyRoot: true,
      pidsLimit: 512,
      available: async () => false,
      exec: async () => {
        ranDocker = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });
    await expect(
      backend.prepareRun({
        projectRoot,
        runId: "lone-finch",
        branchPrefix: "vibe",
        worktreeDir,
        mainBranch: "main",
      }),
    ).rejects.toBeInstanceOf(VibestrateError);
    expect(ranDocker).toBe(false); // never tried to run/exec anything
  });

  it("onUnavailable=degrade => host fallback with NO exec strategy (honest, not a sandbox)", async () => {
    const { projectRoot, worktreeDir } = await tempGitProject();
    const backend = makeDockerBackend({
      image: "busybox",
      onUnavailable: "degrade",
      readonlyRoot: true,
      pidsLimit: 512,
      available: async () => false,
    });
    const prep = await backend.prepareRun({
      projectRoot,
      runId: "calm-yak",
      branchPrefix: "vibe",
      worktreeDir,
      mainBranch: "main",
    });
    expect(prep.exec).toBeUndefined(); // host: location never reports "container"
    expect(prep.worktreePath).toContain("calm-yak");
  });

  it("readonlyRoot + non-writable HOME => fails LOUDLY at start (diagnosable, not a silent mid-turn EROFS)", async () => {
    const { projectRoot, worktreeDir } = await tempGitProject();
    const backend = makeDockerBackend({
      image: "custom-nonroot",
      onUnavailable: "fail",
      readonlyRoot: true,
      pidsLimit: 512,
      available: async () => true,
      // `docker run` succeeds; the HOME write-probe fails (non-root HOME on the
      // read-only rootfs); teardown `rm -f` succeeds.
      exec: async (_file, args) => {
        if (args[0] === "run") return { exitCode: 0, stdout: "container-xyz", stderr: "" };
        if (args.includes("$HOME/.vibestrate-write-probe") || args.join(" ").includes("write-probe")) {
          return { exitCode: 1, stdout: "", stderr: "touch: /home/appuser/.x: Read-only file system" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });
    await expect(
      backend.prepareRun({
        projectRoot,
        runId: "spry-vole",
        branchPrefix: "vibe",
        worktreeDir,
        mainBranch: "main",
      }),
    ).rejects.toThrow(/read-only|readonlyRoot/i);
  });
});

let dockerUp = false;

// The real-container smoke needs a working Linux-container Docker daemon and is
// environment-fragile (image pull + identical-path mount on the runner). It is
// OPT-IN via VIBESTRATE_DOCKER_SMOKE=1 so normal CI stays deterministic, mirroring
// the VIBESTRATE_HUB_LIVE live-contract gate. Run it locally with the env var set.
const dockerSmoke = process.env.VIBESTRATE_DOCKER_SMOKE === "1";

describe.skipIf(!dockerSmoke)("container backend smoke (real Docker)", () => {
  const created: string[] = [];
  beforeAll(async () => {
    dockerUp = await dockerAvailable();
  });
  afterEach(async () => {
    for (const id of created.splice(0)) {
      await execa("docker", ["rm", "-f", id], { reject: false });
    }
  });

  it("runs a turn in a container; the write lands in the mounted worktree; writes outside don't reach the host", async () => {
    if (!dockerUp) {
      // Honest skip: the daemon is down, so the real container path can't run.
      expect(dockerUp).toBe(false);
      return;
    }
    const { projectRoot, worktreeDir } = await tempGitProject();
    const backend = makeDockerBackend({ image: "busybox", onUnavailable: "fail", readonlyRoot: true, pidsLimit: 512 });
    const prep = await backend.prepareRun({
      projectRoot,
      runId: "brisk-otter",
      branchPrefix: "vibe",
      worktreeDir,
      mainBranch: "main",
    });
    expect(prep.exec?.location).toBe("container");

    // 1. A command run via the strategy WRITES into the worktree -> host sees it.
    const writeIn = prep.exec!.wrap({
      command: "sh",
      args: ["-c", `echo CONTAINER_WROTE > ${prep.worktreePath}/from-container.txt`],
      cwd: prep.worktreePath,
      env: {},
    });
    const r1 = await execa(writeIn.command, writeIn.args, { reject: false });
    expect(r1.exitCode).toBe(0);
    const hostSaw = await fs.readFile(path.join(prep.worktreePath, "from-container.txt"), "utf8");
    expect(hostSaw.trim()).toBe("CONTAINER_WROTE");

    // 2. A write OUTSIDE the worktree stays in the container - it must NOT appear
    //    on the host (process+filesystem isolation, the whole point).
    const outsidePath = "/tmp/vibestrate-container-only-brisk-otter.txt";
    await fs.rm(outsidePath, { force: true });
    const writeOut = prep.exec!.wrap({
      command: "sh",
      args: ["-c", `echo SHOULD_NOT_ESCAPE > ${outsidePath}`],
      cwd: prep.worktreePath,
      env: {},
    });
    await execa(writeOut.command, writeOut.args, { reject: false });
    await expect(fs.access(outsidePath)).rejects.toBeTruthy(); // host never saw it

    // 3. The container env carried NO host secret (allowlist proof, live).
    const envDump = prep.exec!.wrap({
      command: "sh",
      args: ["-c", "env"],
      cwd: prep.worktreePath,
      env: {},
    });
    const r3 = await execa(envDump.command, envDump.args, { reject: false });
    expect(r3.stdout).not.toContain("AWS_");
    expect(r3.stdout).not.toContain("GITHUB_TOKEN");

    // 4. Teardown removes the container.
    const idRes = await execa("docker", ["ps", "-aqf", "name=vibestrate-brisk-otter"], { reject: false });
    if (idRes.stdout.trim()) created.push(idRes.stdout.trim());
    await prep.teardown!();
    const after = await execa("docker", ["ps", "-aqf", "name=vibestrate-brisk-otter"], { reject: false });
    expect(after.stdout.trim()).toBe("");
  }, 120_000);
});
