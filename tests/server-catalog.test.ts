import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { addProvider } from "../src/setup/provider-setup-service.js";
import type { ProviderCapabilities } from "../src/providers/provider-catalog.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cat-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: noProvider });
  return project;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("GET /api/providers/catalog", () => {
  it("surfaces a configured http-api provider's real knobs under its own id", async () => {
    const project = await makeProject();
    await addProvider(project, {
      id: "myopenai",
      config: {
        type: "http-api",
        api: "openai",
        baseUrl: "https://api.openai.com",
        model: "gpt-5.5",
        apiKey: "env:OPENAI_KEY",
      } as never,
    });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/providers/catalog`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { catalog: Record<string, ProviderCapabilities> };

    // The static well-known providers are still present...
    expect(body.catalog.claude!.powerLevels).toContain("medium");
    // ...and the user's http-api provider surfaces its real effort knob by id.
    const mine = body.catalog.myopenai!;
    expect(mine).toBeDefined();
    expect(mine.modelEnabled).toBe(true);
    expect(mine.powerLevels).toEqual(["minimal", "low", "medium", "high"]);
  });

  it("reflects the project's providers-catalog.yml overlay", async () => {
    const project = await makeProject();
    // built-in gemini has no effort; the overlay declares one.
    await fs.writeFile(
      path.join(project, ".vibestrate", "providers-catalog.yml"),
      [
        "cli:",
        "  gemini:",
        "    effort:",
        "      levels: [think, deep]",
        "      apply: { kind: flag, flag: --reason }",
      ].join("\n"),
    );
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/providers/catalog`);
    const body = (await res.json()) as {
      catalog: Record<string, ProviderCapabilities>;
      overlay: { present: boolean; path: string };
      sources: Record<string, "overlay" | "built-in">;
    };
    expect(body.catalog.gemini!.powerLevels).toEqual(["think", "deep"]);
    // overlay status + per-provider source surface for the UI (parity with CLI)
    expect(body.overlay.present).toBe(true);
    expect(body.overlay.path).toMatch(/providers-catalog\.yml$/);
    expect(body.sources.gemini).toBe("overlay");
    expect(body.sources.codex).toBe("built-in");
  });
});

describe("POST /api/providers/catalog/refresh", () => {
  it("probes a CLI provider's --help and writes the overlay (parity with the CLI)", async () => {
    const project = await makeProject();
    // An executable fake CLI that prints help with a --effort flag.
    const fakeCli = path.join(project, "fakecli.js");
    await fs.writeFile(
      fakeCli,
      "#!/usr/bin/env node\nprocess.stdout.write('Options:\\n  --model <id>\\n  --effort <eco|turbo>\\n');\n",
    );
    await fs.chmod(fakeCli, 0o755);
    await addProvider(project, {
      id: "mycli",
      config: { type: "cli", command: fakeCli, input: "stdin" } as never,
    });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/providers/catalog/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: "mycli" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      wrote: boolean;
      findings: { providerId: string; status: string; effort?: { levels: string[] } }[];
    };
    expect(body.wrote).toBe(true);
    const f = body.findings.find((x) => x.providerId === "mycli");
    expect(f?.status).toBe("added");
    expect(f?.effort?.levels).toEqual(["eco", "turbo"]);

    // And the catalog now reflects it.
    const cat = (await (
      await fetch(`${server.url}/api/providers/catalog`)
    ).json()) as { catalog: Record<string, ProviderCapabilities> };
    expect(cat.catalog.mycli!.powerLevels).toEqual(["eco", "turbo"]);
  });
});
