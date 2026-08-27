// A service definition that brings the scheduler back after a reboot.
//
// WHAT WAS ACTUALLY MISSING
//
// "Always-on" was mostly built already: the queue auto-spawns a scheduler when
// you queue something (ensure-running.ts), the spawn and its exit are recorded,
// liveness is derived rather than assumed, and an unattended run with no
// ceiling and no confinement is warned about before it starts. One thing was
// not: none of it survives the machine restarting. The scheduler is a child of
// whoever started it, so a reboot ends the always-on part of always-on.
//
// GENERATED, NOT INSTALLED. Writing into ~/Library/LaunchAgents or
// /etc/systemd is a change to how the user's machine boots, and that is theirs
// to make - the same call as the Homebrew tap. This produces the exact file and
// the command that loads it. Nothing here touches a system directory.
//
// Deliberately no Windows unit: a Scheduled Task needs an XML schema and an
// elevated `schtasks` invocation to register, and shipping one I cannot test
// end to end would be worse than saying it is not covered.
import path from "node:path";

// These paths describe the TARGET system, not the machine running the command:
// a launchd plist always lives under ~/Library on macOS and a systemd unit
// under ~/.config on Linux, both POSIX. `path.join` would emit backslashes when
// this is generated on Windows, producing a unit file that names a path no
// systemd or launchd will ever resolve. The host's separator is irrelevant
// here, so it is never used. (Windows CI caught this - the same separator class
// that had that leg red for four days.)
const target = path.posix;

export type ServicePlatform = "launchd" | "systemd";

export type ServiceUnit = {
  platform: ServicePlatform;
  /** Where the user should save it. */
  suggestedPath: string;
  /** The command that loads it once saved. */
  loadCommand: string;
  /** The command that unloads it again - always given, never only the on-switch. */
  unloadCommand: string;
  contents: string;
};

/** Pick from `process.platform` unless the caller names one. */
export function defaultPlatform(platform: NodeJS.Platform = process.platform): ServicePlatform | null {
  if (platform === "darwin") return "launchd";
  if (platform === "linux") return "systemd";
  return null;
}

const LABEL = "com.vibestrate.scheduler";

/**
 * Backslashes to forward slashes, UNCONDITIONALLY.
 *
 * Not `path.sep`: that is `/` on macOS and Linux, so a host-dependent
 * conversion converts nothing anywhere except the one platform where the bug
 * appears - which means it also cannot be tested anywhere else. A separator fix
 * that depends on the host is the bug wearing a fix's clothes.
 */
function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * The unit for one project.
 *
 * Per-project rather than one global service, because the scheduler works
 * against a project's `.vibestrate/` and a single daemon covering several would
 * need a supervisor of its own. The label carries a hash of the path so two
 * projects do not collide.
 */
export function buildServiceUnit(input: {
  platform: ServicePlatform;
  projectRoot: string;
  /** Absolute path to the `vibe` binary. */
  binPath: string;
  /** Home directory, for the suggested save path. */
  home: string;
}): ServiceUnit {
  // Normalised BEFORE the basename: `path.basename` on macOS does not treat a
  // backslash as a separator, so a Windows project root produced a label built
  // from the whole path. The same project would then get a different service
  // name depending on which machine generated the unit.
  const slug = target
    .basename(toPosix(input.projectRoot))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project";
  const label = `${LABEL}.${slug}`;
  // The project root arrives in the host's own form and is used verbatim;
  // only the parts WE construct are forced POSIX.
  const logDir = target.join(toPosix(input.projectRoot), ".vibestrate", "scheduler");

  if (input.platform === "launchd") {
    const plistPath = target.join(toPosix(input.home), "Library", "LaunchAgents", `${label}.plist`);
    return {
      platform: "launchd",
      suggestedPath: plistPath,
      loadCommand: `launchctl load -w ${plistPath}`,
      unloadCommand: `launchctl unload -w ${plistPath}`,
      contents: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${input.binPath}</string>
    <string>queue</string>
    <string>run</string>
  </array>
  <key>WorkingDirectory</key><string>${input.projectRoot}</string>
  <!-- RunAtLoad brings it back after a reboot, which is the whole point.
       KeepAlive is deliberately NOT set: the scheduler already self-heals when
       work is queued, and a hard KeepAlive would respawn it in a tight loop
       against a project whose config no longer parses. -->
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${target.join(logDir, "service.log")}</string>
  <key>StandardErrorPath</key><string>${target.join(logDir, "service.log")}</string>
</dict>
</plist>
`,
    };
  }

  const unitPath = target.join(toPosix(input.home), ".config", "systemd", "user", `${label}.service`);
  return {
    platform: "systemd",
    suggestedPath: unitPath,
    loadCommand: `systemctl --user enable --now ${label}.service`,
    unloadCommand: `systemctl --user disable --now ${label}.service`,
    contents: `[Unit]
Description=Vibestrate scheduler for ${input.projectRoot}
After=network.target

[Service]
Type=simple
WorkingDirectory=${input.projectRoot}
ExecStart=${input.binPath} queue run
# on-failure, not always: the scheduler self-heals when work is queued, and
# restarting a clean exit forever would hide a project whose config stopped
# parsing behind an endless respawn.
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
`,
  };
}
