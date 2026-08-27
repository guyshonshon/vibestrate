import { describe, it, expect } from "vitest";
import { buildServiceUnit, defaultPlatform } from "../src/scheduler/service-unit.js";

/**
 * The one piece of always-on that was missing: surviving a reboot.
 *
 * The scheduler already self-heals - queueing work spawns it, spawns and exits
 * are recorded, liveness is derived rather than assumed. But it is a child of
 * whoever started it, so a restart ends it. This is the unit that brings it
 * back, and the tests are mostly about NOT doing too much: no install, no
 * infinite respawn, and an off-switch given every time the on-switch is.
 */
const base = {
  projectRoot: "/Users/x/code/my-project",
  binPath: "/usr/local/bin/vibe",
  home: "/Users/x",
};

describe("picking a platform", () => {
  it("maps the two it covers", () => {
    expect(defaultPlatform("darwin")).toBe("launchd");
    expect(defaultPlatform("linux")).toBe("systemd");
  });

  it("returns null rather than guessing on Windows", () => {
    // A Scheduled Task needs an XML schema and an elevated registration.
    // Shipping one untested would be worse than saying it is not covered.
    expect(defaultPlatform("win32")).toBeNull();
  });
});

describe("the launchd unit", () => {
  const unit = buildServiceUnit({ ...base, platform: "launchd" });

  it("runs `queue run` in the project, at load", () => {
    expect(unit.contents).toContain("<string>queue</string>");
    expect(unit.contents).toContain("<string>run</string>");
    expect(unit.contents).toContain(`<key>WorkingDirectory</key><string>${base.projectRoot}</string>`);
    // RunAtLoad is what makes it come back after a reboot.
    expect(unit.contents).toContain("<key>RunAtLoad</key><true/>");
  });

  it("does NOT set KeepAlive", () => {
    // The scheduler self-heals when work is queued. A hard KeepAlive would
    // respawn it in a tight loop against a project whose config stopped
    // parsing, turning one broken config into a busy machine.
    // The KEY, not the word: the plist carries a comment explaining why it is
    // absent, which is worth shipping to whoever opens the file later.
    expect(unit.contents).not.toContain("<key>KeepAlive</key>");
    expect(unit.contents).toContain("KeepAlive is deliberately NOT set");
  });

  it("is labelled per project, so two projects do not collide", () => {
    const other = buildServiceUnit({
      ...base,
      platform: "launchd",
      projectRoot: "/Users/x/code/other-project",
    });
    expect(unit.suggestedPath).not.toBe(other.suggestedPath);
    expect(unit.contents).toContain("my-project");
    expect(other.contents).toContain("other-project");
  });

  it("gives the off-switch alongside the on-switch", () => {
    expect(unit.loadCommand).toContain("launchctl load");
    expect(unit.unloadCommand).toContain("launchctl unload");
  });
});

describe("the systemd unit", () => {
  const unit = buildServiceUnit({ ...base, platform: "systemd" });

  it("restarts on failure, not always", () => {
    // `Restart=always` would hide a project whose config stopped parsing behind
    // an endless respawn.
    expect(unit.contents).toContain("Restart=on-failure");
    expect(unit.contents).not.toContain("Restart=always");
  });

  it("is a USER unit, needing no root", () => {
    expect(unit.suggestedPath).toContain(".config/systemd/user");
    expect(unit.loadCommand).toContain("--user");
    expect(unit.unloadCommand).toContain("--user");
  });

  it("waits long enough between restarts to not spin", () => {
    expect(unit.contents).toMatch(/RestartSec=\d+/);
  });
});

describe("what it does not do", () => {
  it("only ever describes a path - it never writes to one", async () => {
    // Installing changes how the machine boots. Same line the Homebrew tap
    // draws: prepare it, hand it over.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/scheduler/service-unit.ts", "utf8");
    for (const f of ["writeFile", "mkdir", "execa", "spawn("]) {
      expect(src, `service-unit.ts calls ${f} - it must only build a string`).not.toContain(f);
    }
  });
});

describe("paths describe the target system, not the host", () => {
  // Windows CI caught this: `path.join` emits backslashes there, so a unit
  // generated on Windows named a path no launchd or systemd would resolve. That
  // is a wrong FILE, not just a failing assertion - and it is the third time
  // this separator class has bitten in one session. These run on every host, so
  // the next one is caught wherever it is introduced.
  const winStyle = {
    projectRoot: "C:\\Users\\x\\code\\my-project",
    binPath: "C:\\Program Files\\nodejs\\vibe",
    home: "C:\\Users\\x",
  };

  it("never puts a backslash in a path it constructs", () => {
    for (const platform of ["launchd", "systemd"] as const) {
      const unit = buildServiceUnit({ ...winStyle, platform });
      expect(unit.suggestedPath, `${platform} suggestedPath`).not.toContain("\\");
      expect(unit.loadCommand, `${platform} loadCommand`).not.toContain("\\");
      expect(unit.unloadCommand, `${platform} unloadCommand`).not.toContain("\\");
    }
  });

  it("keeps the POSIX shape a launchd/systemd path must have", () => {
    // Asserted as a whole path rather than a substring: a substring check is
    // exactly what passed on macOS while the real output was wrong.
    expect(buildServiceUnit({ ...winStyle, platform: "systemd" }).suggestedPath).toBe(
      "C:/Users/x/.config/systemd/user/com.vibestrate.scheduler.my-project.service",
    );
    expect(buildServiceUnit({ ...winStyle, platform: "launchd" }).suggestedPath).toBe(
      "C:/Users/x/Library/LaunchAgents/com.vibestrate.scheduler.my-project.plist",
    );
  });

  it("writes forward-slash log paths into the plist itself", () => {
    const unit = buildServiceUnit({ ...winStyle, platform: "launchd" });
    const logLine = unit.contents.split("\n").find((l) => l.includes("StandardOutPath"))!;
    expect(logLine).not.toContain("\\");
    expect(logLine).toContain("/.vibestrate/scheduler/service.log");
  });
});
