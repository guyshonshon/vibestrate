// Four findings that a documentation pass turned up and deferred: each was a
// comment describing behaviour the code did not have. One test per mechanism,
// each mutation-checked by restoring the original and confirming it fails.

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import { runInit } from "../src/project/init-template.js";
import { isSecretLikePath } from "../src/core/diff-service.js";
import { relativizeRoot } from "../src/utils/redact-paths.js";
import { GatewayRegistry } from "../src/notifications/gateways/gateway-registry.js";
import { cliGateway, setCliWriter } from "../src/notifications/gateways/cli-gateway.js";
import type {
  Notification,
  NotificationsConfig,
} from "../src/notifications/notification-types.js";

describe("a project name carrying a quote still produces parseable YAML", () => {
  it("quotes the name the same way it quotes validation commands", async () => {
    // The name comes from the repo's package.json, so it is not the operator's
    // to get right - a quote in it used to write a project.yml no command could
    // read, which fails at every later step instead of at the one that wrote it.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibestrate-quo"te-'));
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: 'demo" # not a comment' }),
    );
    await runInit({ projectRoot: dir });
    const raw = await fs.readFile(path.join(dir, ".vibestrate", "project.yml"), "utf8");
    const parsed = YAML.parse(raw) as { project: { name: string } };
    expect(parsed.project.name).toBe('demo" # not a comment');
  });
});

describe("secret-like paths are matched case-insensitively", () => {
  it("catches the uppercase spelling on a case-insensitive filesystem", () => {
    // macOS and Windows both default to case-insensitive, so ID_RSA and id_rsa
    // are the same file; only one of them was being refused.
    expect(isSecretLikePath("id_rsa")).toBe(true);
    expect(isSecretLikePath("ID_RSA")).toBe(true);
    expect(isSecretLikePath("keys/Id_Ed25519")).toBe(true);
    expect(isSecretLikePath("src/notes.md")).toBe(false);
  });
});

describe("error text leaving the server carries no absolute path", () => {
  it("replaces the project root and the home directory", () => {
    const root = "/Users/someone/code/demo";
    const msg = `ENOENT: no such file, open '${root}/.vibestrate/runs/x/state.json'`;
    const out = relativizeRoot(msg, root);
    expect(out).not.toContain(root);
    expect(out).toContain("<project>/.vibestrate/runs/x/state.json");
    expect(relativizeRoot(`open '${os.homedir()}/.ssh/config'`, root)).toBe(
      "open '~/.ssh/config'",
    );
  });

  // The two call sites - the 500 branch of the server's error handler and the
  // SSE tails' `error` frames - are wiring this does not exercise. The SSE one
  // was found by probing a running server, where an unguarded symlink answered
  // `event: error` with the absolute path of the file it failed to open.
});

describe("one broken gateway cannot fail the notification", () => {
  const notification = {
    id: "n1",
    severity: "info",
    category: "run",
    title: "t",
    body: "b",
    createdAt: new Date(0).toISOString(),
  } as unknown as Notification;

  const settings = {
    inApp: { enabled: true },
    cli: { enabled: true },
  } as unknown as NotificationsConfig;

  it("degrades a throwing CLI writer to a failed receipt", async () => {
    // The in-app and CLI gateways were bare awaits outside the try/catch, and
    // they are the only two the default registry ever contains - so the guarded
    // loop was empty and the whole of delivery was unguarded. The registry
    // calls the real cliGateway rather than anything registered under that id,
    // so this drives the production path through its caller-installed writer.
    setCliWriter(() => {
      throw new Error("writer went away");
    });
    try {
      const registry = new GatewayRegistry([cliGateway]);
      const receipts = await registry.deliver({
        notification,
        settings,
        gatewayConfigs: {
          cli: {
            enabled: true,
            url: null,
            token: null,
            target: null,
            minSeverity: "info",
            categories: [],
          },
        },
      });
      const cli = receipts.filter((r) => r.gatewayId === "cli");
      expect(cli).toHaveLength(1);
      expect(cli[0]!.status).toBe("failed");
      expect(cli[0]!.errorMessage).toContain("writer went away");
    } finally {
      setCliWriter(null);
    }
  });
});
