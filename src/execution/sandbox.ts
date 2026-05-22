// Per-stage filesystem sandbox for the executor. Wraps the provider
// CLI invocation with a platform-native
// sandbox so a hallucinating or hostile model can only write inside
// the run's worktree + a fresh /tmp scratch dir. Everything else is
// read-only.
//
// Designs by platform:
//
//   macOS  — sandbox-exec with a write-restriction profile.
//            Shipped on every supported macOS (it's deprecated by
//            Apple in the user-facing sense but still present and
//            functional as of macOS 14/15).
//
//   Linux  — bubblewrap (`bwrap`). User installs it via their
//            package manager (`apt install bubblewrap`, etc.).
//            When missing we surface a clear hint instead of
//            silently running unsandboxed.
//
//   Others — not supported. Caller is told to disable the option.
//
// Honest limitations:
//   * macOS sandbox-exec relies on a man-7-ish profile language
//     Apple has never officially documented. We bias toward "block
//     writes outside the worktree" which is the smallest reliable
//     surface — not a hardened-against-determined-attacker shell.
//   * Linux bwrap requires user namespaces. Some hardened distros
//     disable them; the sandbox `prepare` function detects that and
//     returns an actionable error instead of crashing the run.

import { existsSync } from "node:fs";
import path from "node:path";

export type SandboxPlatform = "darwin" | "linux" | "unsupported";

export type SandboxRequest = {
  /** The original argv the orchestrator wants to run.
   *  We never invoke this directly when sandboxing — we re-spawn it
   *  via the wrapper, passing the sandbox tool as argv[0]. */
  command: string;
  args: string[];
  /** The run's git worktree — the one writable path inside the box. */
  worktreePath: string;
  /** Project root, mounted read-only so the agent can read source
   *  files outside the worktree (rare but happens, eg cross-package
   *  reads in a monorepo). */
  projectRoot: string;
};

export type SandboxPrepared =
  | {
      ok: true;
      platform: SandboxPlatform;
      /** Wrapped command — argv[0] is the sandbox tool. */
      command: string;
      args: string[];
      /** Any cleanup the caller should do after the child exits
       *  (eg unlink a temp profile file). Safe to skip. */
      cleanup: () => Promise<void>;
    }
  | {
      ok: false;
      platform: SandboxPlatform;
      reason: string;
      hint: string;
    };

export function detectSandboxPlatform(): SandboxPlatform {
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "linux") return "linux";
  return "unsupported";
}

/** Build the sandbox-exec profile body for macOS. Pure — easy to test. */
export function macosProfile(input: {
  worktreePath: string;
  projectRoot: string;
}): string {
  // (allow default) → start permissive (so Node bootstrapping, DNS,
  // process forking, etc. all work without an exhaustive allow list).
  // Then (deny file-write*) and re-enable writes only for the
  // worktree + standard scratch dirs.
  const writeLiterals = [
    "/dev/null",
    "/dev/tty",
    "/dev/random",
    "/dev/urandom",
    "/dev/stdin",
    "/dev/stdout",
    "/dev/stderr",
    "/dev/fd",
  ];
  // /tmp on macOS is a symlink to /private/tmp; resolve both so the
  // agent's expected scratch path works.
  const writeSubpaths = [
    input.worktreePath,
    "/tmp",
    resolveTmpRoot(),
    "/private/tmp",
  ];
  const lines: string[] = [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    ...writeLiterals.map(
      (l) => `(allow file-write-data (literal "${quote(l)}"))`,
    ),
    ...writeSubpaths.map(
      (p) => `(allow file-write* (subpath "${quote(p)}"))`,
    ),
  ];
  return lines.join("\n");
}

/** Build the bwrap argv prefix for Linux. Pure. */
export function linuxBwrapArgs(input: {
  worktreePath: string;
  projectRoot: string;
}): string[] {
  return [
    // Mount root read-only.
    "--ro-bind", "/", "/",
    // Fresh tmpfs for /tmp + /var/tmp so the agent has scratch space.
    "--tmpfs", "/tmp",
    "--tmpfs", "/var/tmp",
    // Standard kernel filesystems.
    "--proc", "/proc",
    "--dev", "/dev",
    // The one writable bind: the run's worktree.
    "--bind", input.worktreePath, input.worktreePath,
    // Project root stays read-only (no extra bind needed, --ro-bind /
    // already covers it).
    // Networking shared with host — provider CLIs need it.
    "--share-net",
    // Die-with-parent: when the orchestrator exits, the sandbox dies
    // too (no zombie children).
    "--die-with-parent",
    // Don't let signals from inside the sandbox propagate to the
    // shell session that launched us.
    "--new-session",
    // Drop privileges if accidentally setuid.
    "--unshare-user-try",
    "--unshare-ipc",
    "--unshare-pid",
    "--unshare-uts",
    "--unshare-cgroup-try",
  ];
}

export async function prepareSandbox(
  req: SandboxRequest,
): Promise<SandboxPrepared> {
  const platform = detectSandboxPlatform();
  if (platform === "unsupported") {
    return {
      ok: false,
      platform,
      reason: `sandboxing not supported on ${process.platform}`,
      hint: "Run without --sandbox, or use a Linux / macOS host.",
    };
  }

  if (platform === "darwin") {
    if (!existsSync("/usr/bin/sandbox-exec")) {
      return {
        ok: false,
        platform,
        reason: "/usr/bin/sandbox-exec not found",
        hint: "sandbox-exec ships with macOS. If your system removed it, disable --sandbox.",
      };
    }
    const profile = macosProfile({
      worktreePath: req.worktreePath,
      projectRoot: req.projectRoot,
    });
    // Write the profile to a temp file rather than passing inline so
    // we don't bump the argv size limit on long worktree paths.
    const fs = await import("node:fs/promises");
    const profilePath = path.join(
      resolveTmpRoot(),
      `amaco-sandbox-${process.pid}-${Date.now()}.sb`,
    );
    await fs.writeFile(profilePath, profile, "utf8");
    return {
      ok: true,
      platform,
      command: "/usr/bin/sandbox-exec",
      args: ["-f", profilePath, req.command, ...req.args],
      cleanup: async () => {
        await fs.unlink(profilePath).catch(() => undefined);
      },
    };
  }

  // linux
  if (!commandExists("bwrap")) {
    return {
      ok: false,
      platform,
      reason: "bwrap (bubblewrap) is not installed",
      hint: "Install bubblewrap (apt/dnf/pacman package `bubblewrap`) and retry, or disable --sandbox.",
    };
  }
  // Verify user namespaces are enabled — bwrap fails with a cryptic
  // error otherwise on hardened distros.
  // The check is cheap (read sysctl).
  if (existsSync("/proc/sys/kernel/unprivileged_userns_clone")) {
    const v = await readSmallFile(
      "/proc/sys/kernel/unprivileged_userns_clone",
    );
    if (v?.trim() === "0") {
      return {
        ok: false,
        platform,
        reason: "kernel.unprivileged_userns_clone is 0 on this host",
        hint: "Enable it (`sudo sysctl -w kernel.unprivileged_userns_clone=1`) or disable --sandbox.",
      };
    }
  }
  const args = [
    ...linuxBwrapArgs({
      worktreePath: req.worktreePath,
      projectRoot: req.projectRoot,
    }),
    "--",
    req.command,
    ...req.args,
  ];
  return {
    ok: true,
    platform,
    command: "bwrap",
    args,
    cleanup: async () => undefined,
  };
}

function commandExists(cmd: string): boolean {
  const PATH = process.env.PATH ?? "";
  for (const dir of PATH.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, cmd);
    if (existsSync(candidate)) return true;
  }
  return false;
}

function resolveTmpRoot(): string {
  return process.env.TMPDIR?.replace(/\/$/, "") ?? "/tmp";
}

async function readSmallFile(p: string): Promise<string | null> {
  try {
    const fs = await import("node:fs/promises");
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

function quote(s: string): string {
  // sandbox-exec uses TinyScheme-like syntax. Backslashes and
  // double-quotes inside string literals need escaping.
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
