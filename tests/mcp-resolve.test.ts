import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  resolveMcpServers,
  readSkillMcpServers,
  buildMcpConfigFile,
} from "../src/providers/mcp/mcp-resolve.js";
import { writeMcpConfigFile } from "../src/providers/mcp/mcp-config-writer.js";
import {
  createActionBroker,
  readActionLog,
} from "../src/safety/action-broker.js";
import { mcpServerSchema } from "../src/providers/mcp/mcp-schema.js";

describe("mcpServerSchema", () => {
  it("accepts a plain argv command + args + env", () => {
    const parsed = mcpServerSchema.parse({
      command: "mcp-fs",
      args: ["--root", "/tmp"],
      env: { TOKEN: "x" },
    });
    expect(parsed.command).toBe("mcp-fs");
    expect(parsed.args).toEqual(["--root", "/tmp"]);
  });

  it("defaults args + env to empty when omitted", () => {
    const parsed = mcpServerSchema.parse({ command: "mcp-fs" });
    expect(parsed.args).toEqual([]);
    expect(parsed.env).toEqual({});
  });

  it("refuses shell metacharacters in command or args", () => {
    expect(() => mcpServerSchema.parse({ command: "mcp-fs; rm -rf /" })).toThrow();
    expect(() =>
      mcpServerSchema.parse({ command: "mcp-fs", args: ["a|b"] }),
    ).toThrow();
  });
});

describe("resolveMcpServers", () => {
  const a = { command: "a" };
  const b = { command: "b" };
  const c = { command: "c" };

  it("merges agent + skill servers and tags their source", () => {
    const r = resolveMcpServers({
      roleServers: { fs: { command: "a", args: [], env: {} } },
      skills: [{ name: "sec", servers: { sec: { command: "b", args: [], env: {} } } }],
    });
    expect(r.servers.map((s) => s.name).sort()).toEqual(["fs", "sec"]);
    expect(r.servers.find((s) => s.name === "fs")?.source).toBe("agent");
    expect(r.servers.find((s) => s.name === "sec")?.source).toBe("skill:sec");
    expect(r.collisions).toHaveLength(0);
  });

  it("gives the agent precedence over a skill on a name collision", () => {
    const r = resolveMcpServers({
      roleServers: { fs: { command: "a", args: [], env: {} } },
      skills: [{ name: "sec", servers: { fs: { command: "b", args: [], env: {} } } }],
    });
    expect(r.servers).toHaveLength(1);
    expect(r.servers[0]?.source).toBe("agent");
    expect(r.servers[0]?.config.command).toBe("a");
    expect(r.collisions).toEqual([
      { name: "fs", keptSource: "agent", ignoredSource: "skill:sec" },
    ]);
  });

  it("earlier-listed skill wins over later skill on the same name", () => {
    const r = resolveMcpServers({
      roleServers: undefined,
      skills: [
        { name: "first", servers: { fs: { command: "a", args: [], env: {} } } },
        { name: "second", servers: { fs: { command: "b", args: [], env: {} } } },
      ],
    });
    expect(r.servers).toHaveLength(1);
    expect(r.servers[0]?.source).toBe("skill:first");
    expect(r.collisions).toEqual([
      { name: "fs", keptSource: "skill:first", ignoredSource: "skill:second" },
    ]);
  });

  it("buildMcpConfigFile produces the `.mcp.json` shape", () => {
    const r = resolveMcpServers({
      roleServers: { fs: { command: "a", args: ["x"], env: {} } },
      skills: [],
    });
    const file = buildMcpConfigFile(r.servers);
    expect(file).toEqual({
      mcpServers: { fs: { command: "a", args: ["x"], env: {} } },
    });
  });

  // Suppress unused-variable warnings for the test fixture trio.
  void [a, b, c];
});

describe("readSkillMcpServers", () => {
  it("returns {} when no .mcp.json sits next to SKILL.md", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mcp-"));
    const skillFile = path.join(dir, "SKILL.md");
    await fs.writeFile(skillFile, "# skill\n");
    expect(await readSkillMcpServers(skillFile)).toEqual({});
  });

  it("loads valid .mcp.json", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mcp-"));
    const skillFile = path.join(dir, "SKILL.md");
    await fs.writeFile(skillFile, "# skill\n");
    await fs.writeFile(
      path.join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: { fs: { command: "mcp-fs", args: ["--root", "/tmp"] } },
      }),
    );
    const out = await readSkillMcpServers(skillFile);
    expect(Object.keys(out)).toEqual(["fs"]);
    expect(out.fs?.command).toBe("mcp-fs");
  });

  it("throws on malformed JSON or schema violations", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mcp-"));
    const skillFile = path.join(dir, "SKILL.md");
    await fs.writeFile(skillFile, "# skill\n");
    await fs.writeFile(path.join(dir, ".mcp.json"), "{ not json");
    await expect(readSkillMcpServers(skillFile)).rejects.toThrow(/not valid JSON/);
  });
});

describe("writeMcpConfigFile", () => {
  /** A broker with no policies (default-allow) over a scratch project root. */
  async function scratchBroker() {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mcp-root-"));
    const runId = "run-mcp";
    return {
      projectRoot,
      runId,
      broker: createActionBroker(projectRoot, runId, { evaluatorLoader: async () => [] }),
    };
  }

  it("returns null and writes nothing when there are no servers", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mcp-"));
    const { broker, runId } = await scratchBroker();
    const out = await writeMcpConfigFile({ dir, servers: [], broker, runId });
    expect(out).toBeNull();
    const entries = await fs.readdir(dir);
    expect(entries).toEqual([]);
  });

  it("materializes resolved servers to <dir>/mcp.json", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mcp-"));
    const { broker, runId } = await scratchBroker();
    const file = await writeMcpConfigFile({
      dir,
      broker,
      runId,
      servers: [
        {
          name: "fs",
          source: "agent",
          config: { command: "mcp-fs", args: ["--root", "/tmp"], env: {} },
        },
      ],
    });
    expect(file).toBe(path.join(dir, "mcp.json"));
    const parsed = JSON.parse(await fs.readFile(file!, "utf8"));
    expect(parsed.mcpServers.fs.command).toBe("mcp-fs");
  });

  // The broker is a REQUIRED parameter precisely so this can't be skipped: an
  // mcp.json can carry server tokens, so the write has to appear in the audit
  // log by construction rather than because the caller remembered to pass one.
  it("records the write through the action broker, with no server body", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mcp-"));
    const { broker, runId, projectRoot } = await scratchBroker();
    await writeMcpConfigFile({
      dir,
      broker,
      runId,
      servers: [
        {
          name: "fs",
          source: "agent",
          config: { command: "mcp-fs", args: [], env: { TOKEN: "s3cret-value" } },
        },
      ],
    });
    const log = await readActionLog(projectRoot, runId);
    const write = log.find((r) => r.request.kind === "file.write");
    expect(write, "the mcp.json write must cross the broker").toBeDefined();
    expect(write!.request.subject.purpose).toBe("mcp.json");
    expect(write!.evidence?.ok).toBe(true);
    // Path + count only - the record must never carry the server env.
    expect(JSON.stringify(write)).not.toContain("s3cret-value");
  });

  it("refuses the write when a policy denies file.write", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mcp-"));
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mcp-root-"));
    const broker = createActionBroker(projectRoot, "run-deny", {
      evaluatorLoader: async () => [
        (req) =>
          req.kind === "file.write"
            ? { effect: "deny" as const, ruleIds: ["no-mcp"], reason: "blocked" }
            : null,
      ],
    });
    await expect(
      writeMcpConfigFile({
        dir,
        broker,
        runId: "run-deny",
        servers: [
          {
            name: "fs",
            source: "agent",
            config: { command: "mcp-fs", args: [], env: {} },
          },
        ],
      }),
    ).rejects.toThrow(/deny file\.write/);
    expect(await fs.readdir(dir)).toEqual([]);
  });
});
