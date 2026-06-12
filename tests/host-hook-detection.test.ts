import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  hookEventsOf,
  summarizeHostHooks,
  detectHostHooks,
  hostHookSettingsPaths,
} from "../src/providers/host-hook-detection.js";

describe("hookEventsOf (pure)", () => {
  it("returns sorted event names for non-empty hook configs", () => {
    expect(
      hookEventsOf({
        hooks: {
          UserPromptSubmit: [{ hooks: [{ type: "command", command: "x" }] }],
          Stop: [{ hooks: [] }],
        },
      }),
    ).toEqual(["Stop", "UserPromptSubmit"]);
  });

  it("ignores empty/absent hook entries and non-objects", () => {
    expect(hookEventsOf({ hooks: { UserPromptSubmit: [] } })).toEqual([]);
    expect(hookEventsOf({ hooks: {} })).toEqual([]);
    expect(hookEventsOf({})).toEqual([]);
    expect(hookEventsOf(null)).toEqual([]);
    expect(hookEventsOf("nope")).toEqual([]);
  });

  it("counts an object-shaped hook map with keys as non-empty", () => {
    expect(
      hookEventsOf({ hooks: { PreToolUse: { Bash: ["x"] } } }),
    ).toEqual(["PreToolUse"]);
  });
});

describe("summarizeHostHooks (pure)", () => {
  it("keeps only files that actually declare hooks", () => {
    const out = summarizeHostHooks([
      { path: "~/.claude/settings.json", json: { hooks: { Stop: [{ a: 1 }] } } },
      { path: "proj/.claude/settings.json", json: { permissions: {} } },
    ]);
    expect(out).toEqual([
      { path: "~/.claude/settings.json", events: ["Stop"] },
    ]);
  });
});

describe("detectHostHooks (filesystem)", () => {
  let home: string;
  let proj: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "hh-home-"));
    proj = await fs.mkdtemp(path.join(os.tmpdir(), "hh-proj-"));
    origHome = process.env.HOME;
    process.env.HOME = home; // os.homedir() honors $HOME on POSIX
  });
  afterEach(async () => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(proj, { recursive: true, force: true });
  });

  it("finds hooks in both the user home and the project .claude settings", async () => {
    await fs.mkdir(path.join(home, ".claude"), { recursive: true });
    await fs.writeFile(
      path.join(home, ".claude", "settings.json"),
      JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ command: "x" }] }] } }),
    );
    await fs.mkdir(path.join(proj, ".claude"), { recursive: true });
    await fs.writeFile(
      path.join(proj, ".claude", "settings.local.json"),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash" }] } }),
    );
    const sources = await detectHostHooks(proj);
    const events = sources.flatMap((s) => s.events).sort();
    expect(events).toEqual(["PreToolUse", "UserPromptSubmit"]);
    // The home path is shown ~-relative, never the absolute home.
    expect(sources.some((s) => s.path.startsWith("~/"))).toBe(true);
  });

  it("returns nothing when no hooks are configured", async () => {
    expect(await detectHostHooks(proj)).toEqual([]);
  });

  it("skips a malformed settings.json instead of throwing", async () => {
    await fs.mkdir(path.join(home, ".claude"), { recursive: true });
    await fs.writeFile(path.join(home, ".claude", "settings.json"), "{ not json");
    await expect(detectHostHooks(proj)).resolves.toEqual([]);
  });

  it("the candidate path list covers home + project .claude settings", () => {
    const paths = hostHookSettingsPaths(proj);
    expect(paths.some((p) => p.includes(path.join(".claude", "settings.json")))).toBe(
      true,
    );
    expect(
      paths.some((p) => p.includes(path.join(".claude", "settings.local.json"))),
    ).toBe(true);
  });
});
