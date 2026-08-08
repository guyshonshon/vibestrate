import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  getDiffSnapshot,
  getFileDiff,
  isSecretLikePath,
  redactSecretsInText,
} from "../src/core/diff-service.js";

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-diff-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "README.md"), "hello\n");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

describe("isSecretLikePath", () => {
  it("flags .env and variants", () => {
    expect(isSecretLikePath(".env")).toBe(true);
    expect(isSecretLikePath(".env.local")).toBe(true);
    expect(isSecretLikePath("packages/app/.env.production")).toBe(true);
  });
  it("flags pem/key/p12 files", () => {
    expect(isSecretLikePath("certs/server.pem")).toBe(true);
    expect(isSecretLikePath("private.key")).toBe(true);
    expect(isSecretLikePath("certs/cert.p12")).toBe(true);
  });
  it("does not flag normal files", () => {
    expect(isSecretLikePath("src/index.ts")).toBe(false);
    expect(isSecretLikePath("README.md")).toBe(false);
  });

  // The prefix-only pattern matched `.env*` and nothing else, so direnv's
  // `.envrc` and the equally common `prod.env` suffix form were read, diffed and
  // rendered like ordinary source. This flag is the only protection on the
  // surfaces that do no content redaction (file-view-service, getFileDiff).
  it("catches the suffix and direnv spellings, not just the dot-prefixed one", () => {
    expect(isSecretLikePath(".envrc")).toBe(true);
    expect(isSecretLikePath("prod.env")).toBe(true);
    expect(isSecretLikePath("config/production.env")).toBe(true);
    expect(isSecretLikePath(".env-prod")).toBe(true);
  });

  it("does not over-match ordinary files that merely contain 'env'", () => {
    expect(isSecretLikePath("src/environment.ts")).toBe(false);
    expect(isSecretLikePath("src/env.ts")).toBe(false);
    expect(isSecretLikePath("env/config.json")).toBe(false);
  });
});

describe("redactSecretsInText", () => {
  it("still redacts the known vendor token shapes", () => {
    const r = redactSecretsInText('const k = "AKIAIOSFODNN7EXAMPLE";');
    expect(r.redacted).toContain("[REDACTED:AWS access key id]");
    expect(r.redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts novel-shaped secret assignments, preserving the key name", () => {
    for (const line of [
      "DB_PASS=hunter2longstring",
      'client_secret: "abc123def456ghi789"',
      "MY_API_KEY = s3cr3t-value-here",
      "auth_token='longlivedtokenvalue123'",
      "APIKEY=abcdef0123456789",
      "MY_API_KEY=abcdef0123456789",
    ]) {
      const r = redactSecretsInText(line);
      expect(r.redacted, line).toContain("[REDACTED:secret assignment]");
      expect(r.count, line).toBeGreaterThan(0);
    }
    // The key name survives (context preserved), the value does not.
    const r = redactSecretsInText("DB_PASS=hunter2longstring");
    expect(r.redacted).toContain("DB_PASS=");
    expect(r.redacted).not.toContain("hunter2longstring");
  });

  it("leaves non-secret VALUES untouched (env-ref/interp/path/placeholder)", () => {
    for (const line of [
      "password = env:DB_PASSWORD", // an env-ref, not a literal
      'api_key = "${VITE_API_KEY}"', // interpolation
      "secret_path = ./secrets/dev", // a path (key also non-secret)
      'token = "changeme"', // placeholder (also < 8)
      "clientSecret = process.env.CLIENT_SECRET",
      'AUTH_TOKEN = "your_token_here"',
    ]) {
      const r = redactSecretsInText(line);
      expect(r.redacted, line).toBe(line);
      expect(r.count, line).toBe(0);
    }
  });

  it("does NOT fire when the secret word is not the trailing key segment (the FP class)", () => {
    // Every one of these has 'secret'/'token'/'key'/'pass' as a substring or
    // non-trailing segment, and a long value - the exact false positives the
    // security review reproduced. None may be redacted.
    for (const line of [
      'tokenizer = "SentencePieceBPE1"',
      'access_key_header = "X-Amz-Access-Key"',
      'client_secret_field_name = "clientsecretfield"',
      'authTokenHeader = "Authorization1"',
      'password_hint = "mothersmaidenname"',
      "privateKeyPath = getConfigDirectory",
      'keyboard_shortcut = "ctrl-shift-k-x-1"',
      'compass = "northeastbearing12"',
      'passenger_name = "Jonathanappleseed"',
      'bypass_cache = "enabledforever123"',
      'username = "a-very-long-username-value"',
    ]) {
      const r = redactSecretsInText(line);
      expect(r.redacted, line).toBe(line);
      expect(r.count, line).toBe(0);
    }
  });

  it("does not over-grab trailing punctuation on unquoted values", () => {
    const r = redactSecretsInText("token = abcdef0123; // trailing comment");
    expect(r.redacted).toContain("[REDACTED:secret assignment]");
    expect(r.redacted).toContain("; // trailing comment"); // the ; and comment survive
  });

  it("is ReDoS-safe: a pathological keyword run redacts in bounded time", () => {
    const evil = "token_".repeat(20000) + " end"; // ~120 KB, no assignment
    const start = performance.now();
    const r = redactSecretsInText(evil);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(500); // was 28s with the old unbounded regex
    expect(r.count).toBe(0);
  });
});

describe("redactSecretsInText - PEM private keys", () => {
  const BODY = ["MIIEowIBAAKCAQEA3Tz2mr7SZiAMfQyuvBjM9O", "kI7bXkQVMHfhOxLKmJUvXhLQ=="];

  // Matching only the BEGIN line replaced the header and left the key. The
  // marker then sat directly on top of the base64 body, signposting the secret
  // it had failed to remove.
  it("removes the key body, not just the header", () => {
    const key = `-----BEGIN RSA PRIVATE KEY-----\n${BODY.join("\n")}\n-----END RSA PRIVATE KEY-----`;
    const r = redactSecretsInText(key);
    for (const line of BODY) {
      expect(r.redacted, `body line must not survive: ${line}`).not.toContain(line);
    }
    expect(r.redacted).not.toContain("-----END RSA PRIVATE KEY-----");
    expect(r.redacted).toContain("[REDACTED:PEM private key block]");
  });

  it("removes the body of a block truncated before its END line", () => {
    const truncated = `some context\n-----BEGIN PRIVATE KEY-----\n${BODY.join("\n")}\n`;
    const r = redactSecretsInText(truncated);
    for (const line of BODY) {
      expect(r.redacted).not.toContain(line);
    }
    // Surrounding content is preserved; only the key is taken.
    expect(r.redacted).toContain("some context");
  });

  it("stays linear on adversarial input", () => {
    const started = Date.now();
    redactSecretsInText(`-----BEGIN RSA PRIVATE KEY-----${"\nAAAA".repeat(20000)}`);
    redactSecretsInText(`-----BEGIN RSA PRIVATE KEY-----\n${"A".repeat(200000)}`);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("getDiffSnapshot", () => {
  let repo: string;
  beforeEach(async () => {
    repo = await makeRepo();
  });

  it("reports modified files with insertions/deletions", async () => {
    await fs.writeFile(path.join(repo, "README.md"), "hello\nworld\n");
    const snap = await getDiffSnapshot({ worktreePath: repo });
    expect(snap.totals.files).toBeGreaterThanOrEqual(1);
    const readme = snap.files.find((f) => f.path === "README.md");
    expect(readme).toBeDefined();
    expect(readme!.insertions).toBe(1);
    expect(readme!.deletions).toBe(0);
  });

  it("counts added lines for a brand-new (untracked) file", async () => {
    // Regression: `git diff --numstat HEAD` omits untracked files, so a
    // newly-created file used to show +0. It should report its real lines.
    await fs.writeFile(
      path.join(repo, "hello.txt"),
      "line one\nline two\nline three\n",
    );
    const snap = await getDiffSnapshot({ worktreePath: repo });
    const hello = snap.files.find((f) => f.path === "hello.txt");
    expect(hello).toBeDefined();
    expect(hello!.status).toBe("untracked");
    expect(hello!.insertions).toBe(3);
    expect(snap.totals.insertions).toBeGreaterThanOrEqual(3);
  });

  it("flags secret-like paths and marks diffRedacted", async () => {
    await fs.writeFile(path.join(repo, ".env"), "API_KEY=topsecret123\n");
    const snap = await getDiffSnapshot({ worktreePath: repo });
    const env = snap.files.find((f) => f.path === ".env");
    expect(env).toBeDefined();
    expect(env!.isSecretLike).toBe(true);
    expect(env!.diffRedacted).toBe(true);
    expect(snap.totals.redactedFiles).toBeGreaterThanOrEqual(1);
  });

  it("returns empty snapshot for non-existent worktree", async () => {
    const snap = await getDiffSnapshot({
      worktreePath: "/tmp/definitely-does-not-exist-vibestrate-xyz",
    });
    expect(snap.files).toEqual([]);
  });
});

describe("getFileDiff", () => {
  let repo: string;
  beforeEach(async () => {
    repo = await makeRepo();
  });

  it("returns redacted entry for .env contents", async () => {
    await fs.writeFile(path.join(repo, ".env"), "API_KEY=hunter2\n");
    const diff = await getFileDiff({ worktreePath: repo, filePath: ".env" });
    expect(diff.redacted).toBe(true);
    expect(diff.body).toBe("");
    expect(diff.redactionReason).toMatch(/secret/i);
  });

  it("refuses path traversal", async () => {
    const diff = await getFileDiff({
      worktreePath: repo,
      filePath: "../../etc/passwd",
    });
    expect(diff.redacted).toBe(true);
    expect(diff.redactionReason).toMatch(/escape|traversal|outside/i);
  });

  it("returns body for normal files", async () => {
    await fs.writeFile(path.join(repo, "README.md"), "hello\nworld\n");
    const diff = await getFileDiff({ worktreePath: repo, filePath: "README.md" });
    expect(diff.redacted).toBe(false);
    expect(diff.body).toContain("+world");
  });
});
