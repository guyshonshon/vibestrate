import { describe, it, expect, vi } from "vitest";
import {
  killProcessTree,
  detachedSpawnOptions,
} from "../src/platform/process-control.js";

describe("killProcessTree", () => {
  it("signals the process group with a negative pid on POSIX", () => {
    const kill = vi.fn();
    const runTaskkill = vi.fn();
    killProcessTree(4321, "SIGTERM", { platform: "linux", kill, runTaskkill });
    expect(kill).toHaveBeenCalledWith(-4321, "SIGTERM");
    expect(runTaskkill).not.toHaveBeenCalled();
  });

  it("forwards SIGKILL to the process group on POSIX", () => {
    const kill = vi.fn();
    killProcessTree(50, "SIGKILL", {
      platform: "darwin",
      kill,
      runTaskkill: vi.fn(),
    });
    expect(kill).toHaveBeenCalledWith(-50, "SIGKILL");
  });

  it("runs taskkill /T /F on Windows for SIGKILL and never process.kill", () => {
    const kill = vi.fn();
    const runTaskkill = vi.fn();
    killProcessTree(4321, "SIGKILL", { platform: "win32", kill, runTaskkill });
    expect(runTaskkill).toHaveBeenCalledWith(4321, true);
    expect(kill).not.toHaveBeenCalled();
  });

  it("runs taskkill /T without /F on Windows for SIGTERM", () => {
    const runTaskkill = vi.fn();
    killProcessTree(99, "SIGTERM", {
      platform: "win32",
      kill: vi.fn(),
      runTaskkill,
    });
    expect(runTaskkill).toHaveBeenCalledWith(99, false);
  });
});

describe("detachedSpawnOptions", () => {
  it("detaches on POSIX so a process group exists to signal", () => {
    expect(detachedSpawnOptions("linux")).toEqual({ detached: true });
  });

  it("does not detach on Windows and hides the console window", () => {
    expect(detachedSpawnOptions("win32")).toEqual({
      detached: false,
      windowsHide: true,
    });
  });
});
