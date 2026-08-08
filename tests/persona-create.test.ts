import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPersona, setDefaultPersona } from "../src/supervisor/persona-service.js";
import { runInit } from "../src/project/init-template.js";
import { ConfigError } from "../src/utils/errors.js";

let root: string;

const VALID = {
  label: "Perf hawk",
  description: "Hot paths and allocations first.",
  riskSignals: ["cache", "hot path"],
  prefersFlows: ["panel-review"],
  reviewerProfile: null,
  prefersPosture: null,
};

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "vibe-persona-"));
  await runInit({ projectRoot: root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createPersona", () => {
  it("writes a validated persona into project.yml", async () => {
    const r = await createPersona(root, "perf-hawk", VALID);
    expect(r.id).toBe("perf-hawk");
    const yml = await readFile(path.join(root, ".vibestrate", "project.yml"), "utf8");
    expect(yml).toContain("perf-hawk");
    expect(yml).toContain("Perf hawk");
  });

  // The regex on persona ids allows underscores, so these all satisfy it. Writing
  // one would put a persona behind a key inherited from Object.prototype.
  it.each(["__proto__", "constructor", "prototype"])(
    "refuses the reserved id %s",
    async (id) => {
      await expect(createPersona(root, id, VALID)).rejects.toThrow(ConfigError);
    },
  );

  it("refuses to shadow a built-in supervisor", async () => {
    await expect(createPersona(root, "staff-engineer", VALID)).rejects.toThrow(
      /built-in/i,
    );
    await expect(createPersona(root, "security", VALID)).rejects.toThrow(/built-in/i);
  });

  it("refuses to silently overwrite an existing supervisor", async () => {
    await createPersona(root, "perf-hawk", VALID);
    await expect(createPersona(root, "perf-hawk", VALID)).rejects.toThrow(
      /already exists/i,
    );
    // ...but an explicit overwrite is allowed.
    await expect(
      createPersona(root, "perf-hawk", { ...VALID, label: "Renamed" }, { overwrite: true }),
    ).resolves.toEqual({ id: "perf-hawk" });
    const yml = await readFile(path.join(root, ".vibestrate", "project.yml"), "utf8");
    expect(yml).toContain("Renamed");
  });

  it("rejects a malformed definition rather than coercing it", async () => {
    await expect(createPersona(root, "bad-label", { label: "" })).rejects.toThrow(
      ConfigError,
    );
    await expect(
      createPersona(root, "bad-posture", { ...VALID, prefersPosture: "not-a-posture" }),
    ).rejects.toThrow(ConfigError);
    await expect(
      createPersona(root, "bad-signals", { ...VALID, riskSignals: "not-an-array" }),
    ).rejects.toThrow(ConfigError);
  });

  it("rejects an id the name schema forbids", async () => {
    await expect(createPersona(root, "has spaces", VALID)).rejects.toThrow(ConfigError);
    await expect(createPersona(root, "default", VALID)).rejects.toThrow(ConfigError);
  });

  it("produces a persona the default-setter accepts", async () => {
    await createPersona(root, "perf-hawk", VALID);
    await expect(setDefaultPersona(root, "perf-hawk")).resolves.toBeTruthy();
  });
});
