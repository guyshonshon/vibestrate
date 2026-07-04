import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  searchCodebaseContent,
  listCodebaseFiles,
} from "../src/core/codebase-search-service.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })),
  );
});

async function initRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-search-"));
  dirs.push(dir);
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  return dir;
}

/** Write a file (creating parent dirs) but do NOT commit yet. */
async function writeFile(
  dir: string,
  file: string,
  content: string,
): Promise<void> {
  const full = path.join(dir, file);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

/** Stage everything and commit. */
async function commitAll(dir: string, msg = "c"): Promise<void> {
  await execa("git", ["add", "-A"], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", msg], { cwd: dir });
}

/** A non-git temp dir (no repo). */
async function nonGitDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-nogit-"));
  dirs.push(dir);
  return dir;
}

describe("searchCodebaseContent", () => {
  it("1. fixed-string match returns the right file, line, snippet, matchCount", async () => {
    const dir = await initRepo();
    await writeFile(
      dir,
      "src/app.ts",
      "const x = 1;\nconst needle = 42;\nconst y = 2;\n",
    );
    await writeFile(dir, "src/other.ts", "nothing here\n");
    await commitAll(dir);

    const res = await searchCodebaseContent({ projectRoot: dir, query: "needle" });

    expect(res.available).toBe(true);
    expect(res.error).toBeNull();
    expect(res.totalFiles).toBe(1);
    expect(res.totalMatches).toBe(1);
    const file = res.files[0]!;
    expect(file.path).toBe("src/app.ts");
    expect(file.matchCount).toBe(1);
    expect(file.matchesTruncated).toBe(false);
    expect(file.matches).toHaveLength(1);
    expect(file.matches[0]!.line).toBe(2);
    expect(file.matches[0]!.text).toContain("needle");
  });

  it("2. regex:true matches handle[A-Z][a-z]+; the same pattern with regex:false (fixed -F) does not", async () => {
    const dir = await initRepo();
    await writeFile(
      dir,
      "src/handlers.ts",
      "export function handleLogin() {}\n",
    );
    await commitAll(dir);

    // POSIX ERE (git grep -E); avoid PCRE-only escapes like \w. This proves -E
    // is in effect (the character classes match), and case-sensitive so the
    // [A-Z] genuinely requires the capital in handleLogin.
    const pattern = "handle[A-Z][a-z]+";
    const rx = await searchCodebaseContent({
      projectRoot: dir,
      query: pattern,
      regex: true,
      caseSensitive: true,
    });
    expect(rx.regex).toBe(true);
    expect(rx.totalMatches).toBe(1);
    expect(rx.files[0]!.path).toBe("src/handlers.ts");

    // Same pattern as a literal string: there is no literal "handle[A-Z][a-z]+"
    // in the source, so -F finds nothing.
    const fixed = await searchCodebaseContent({
      projectRoot: dir,
      query: pattern,
      regex: false,
      caseSensitive: true,
    });
    expect(fixed.regex).toBe(false);
    expect(fixed.totalMatches).toBe(0);
    expect(fixed.files).toHaveLength(0);
    expect(fixed.error).toBeNull();
  });

  it("3. caseSensitive:false finds 'Login' when searching 'login'; caseSensitive:true does not", async () => {
    const dir = await initRepo();
    await writeFile(dir, "src/auth.ts", "function Login() {}\n");
    await commitAll(dir);

    const insensitive = await searchCodebaseContent({
      projectRoot: dir,
      query: "login",
      caseSensitive: false,
    });
    expect(insensitive.totalMatches).toBe(1);

    const sensitive = await searchCodebaseContent({
      projectRoot: dir,
      query: "login",
      caseSensitive: true,
    });
    expect(sensitive.totalMatches).toBe(0);
    expect(sensitive.error).toBeNull();
  });

  it("4a. include glob src/** excludes a match living in docs/", async () => {
    const dir = await initRepo();
    await writeFile(dir, "src/app.ts", "marker here\n");
    await writeFile(dir, "docs/guide.md", "marker here too\n");
    await commitAll(dir);

    const scoped = await searchCodebaseContent({
      projectRoot: dir,
      query: "marker",
      include: "src/**",
    });
    expect(scoped.totalFiles).toBe(1);
    expect(scoped.files[0]!.path).toBe("src/app.ts");
    expect(scoped.files.some((f) => f.path.startsWith("docs/"))).toBe(false);
  });

  it("4b. exclude glob drops matches in the excluded path", async () => {
    const dir = await initRepo();
    await writeFile(dir, "src/app.ts", "marker here\n");
    await writeFile(dir, "docs/guide.md", "marker here too\n");
    await commitAll(dir);

    const unscoped = await searchCodebaseContent({ projectRoot: dir, query: "marker" });
    expect(unscoped.totalFiles).toBe(2);

    const excluded = await searchCodebaseContent({
      projectRoot: dir,
      query: "marker",
      exclude: "docs/**",
    });
    expect(excluded.totalFiles).toBe(1);
    expect(excluded.files[0]!.path).toBe("src/app.ts");
  });

  it("5a. a secret-like PATH (.env) containing the term is never returned", async () => {
    const dir = await initRepo();
    await writeFile(dir, ".env", "API_TOKEN=needle-value\n");
    await writeFile(dir, "src/app.ts", "// needle in normal file\n");
    await commitAll(dir);

    const res = await searchCodebaseContent({ projectRoot: dir, query: "needle" });
    // Only the normal file comes back; the .env match is dropped.
    expect(res.files.map((f) => f.path)).toEqual(["src/app.ts"]);
    expect(res.files.some((f) => f.path === ".env")).toBe(false);
  });

  it("5b. a secret token on the same line as a match is redacted, redactedCount > 0", async () => {
    const dir = await initRepo();
    // Real AWS access key id shape: AKIA + 16 uppercase-alnum. Placed on the
    // same line as the search term "awsKey" in a normally-named file.
    const secret = "AKIAIOSFODNN7EXAMPLE";
    await writeFile(dir, "config.ts", `export const awsKey = "${secret}";\n`);
    await commitAll(dir);

    const res = await searchCodebaseContent({ projectRoot: dir, query: "awsKey" });
    expect(res.totalMatches).toBe(1);
    const snippet = res.files[0]!.matches[0]!.text;
    expect(snippet).toContain("[REDACTED:");
    expect(snippet).not.toContain(secret);
    expect(res.redactedCount).toBeGreaterThan(0);
  });

  it("5c. display-tier: a DB connection string credential is redacted in the snippet", async () => {
    const dir = await initRepo();
    // A prefix-less credential the strict patch redactor deliberately skips -
    // the display redactor must still scrub it out of a search preview.
    await writeFile(dir, "db.ts", `const conn = "postgres://admin:hunter2@prod-db:5432/app";\n`);
    await commitAll(dir);

    const res = await searchCodebaseContent({ projectRoot: dir, query: "postgres://" });
    expect(res.totalMatches).toBe(1);
    const snippet = res.files[0]!.matches[0]!.text;
    expect(snippet).toContain("[REDACTED:credential]");
    expect(snippet).not.toContain("hunter2");
    expect(res.redactedCount).toBeGreaterThan(0);
  });

  it("5d. regex \\w works (PCRE -P) where POSIX -E would not", async () => {
    const dir = await initRepo();
    await writeFile(dir, "a.ts", "const handleLogin = 1;\n");
    await commitAll(dir);
    const res = await searchCodebaseContent({
      projectRoot: dir,
      query: "handle\\w+",
      regex: true,
    });
    expect(res.totalMatches).toBe(1);
    expect(res.files[0]!.matches[0]!.text).toContain("handleLogin");
  });

  it("6. no match: available true, empty files, totalMatches 0, no error (git grep exit 1)", async () => {
    const dir = await initRepo();
    await writeFile(dir, "src/app.ts", "hello world\n");
    await commitAll(dir);

    const res = await searchCodebaseContent({
      projectRoot: dir,
      query: "definitely-not-present-anywhere",
    });
    expect(res.available).toBe(true);
    expect(res.error).toBeNull();
    expect(res.files).toEqual([]);
    expect(res.totalMatches).toBe(0);
    expect(res.totalFiles).toBe(0);
  });

  it("7. non-git dir: available false with an error message", async () => {
    const dir = await nonGitDir();
    await writeFile(dir, "app.ts", "needle\n");

    const res = await searchCodebaseContent({ projectRoot: dir, query: "needle" });
    expect(res.available).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.files).toEqual([]);
  });

  it("8. empty query returns an empty result, available true, no error", async () => {
    const dir = await initRepo();
    await writeFile(dir, "src/app.ts", "content\n");
    await commitAll(dir);

    const res = await searchCodebaseContent({ projectRoot: dir, query: "   " });
    expect(res.available).toBe(true);
    expect(res.error).toBeNull();
    expect(res.files).toEqual([]);
    expect(res.totalMatches).toBe(0);
    expect(res.query).toBe("");
  });

  it("9. caps: a file with >20 matching lines is truncated at MAX_MATCHES_PER_FILE (20)", async () => {
    const dir = await initRepo();
    const lines = Array.from({ length: 30 }, (_, i) => `hit line ${i}`).join("\n");
    await writeFile(dir, "src/many.ts", lines + "\n");
    await commitAll(dir);

    const res = await searchCodebaseContent({ projectRoot: dir, query: "hit" });
    const file = res.files[0]!;
    expect(file.matchCount).toBe(30);
    expect(file.matches.length).toBe(20);
    expect(file.matchesTruncated).toBe(true);
  });
});

describe("listCodebaseFiles", () => {
  it("10a. returns tracked paths and filters out a .env file", async () => {
    const dir = await initRepo();
    await writeFile(dir, "src/app.ts", "x\n");
    await writeFile(dir, "README.md", "y\n");
    await writeFile(dir, ".env", "SECRET=1\n");
    await commitAll(dir);

    const res = await listCodebaseFiles({ projectRoot: dir });
    expect(res.available).toBe(true);
    expect(res.error).toBeNull();
    expect(res.paths).toContain("src/app.ts");
    expect(res.paths).toContain("README.md");
    expect(res.paths).not.toContain(".env");
  });

  it("10b. include/exclude globs scope the list", async () => {
    const dir = await initRepo();
    await writeFile(dir, "src/app.ts", "x\n");
    await writeFile(dir, "docs/guide.md", "y\n");
    await commitAll(dir);

    const included = await listCodebaseFiles({ projectRoot: dir, include: "src/**" });
    expect(included.paths).toEqual(["src/app.ts"]);

    const excluded = await listCodebaseFiles({ projectRoot: dir, exclude: "docs/**" });
    expect(excluded.paths).toContain("src/app.ts");
    expect(excluded.paths.some((p) => p.startsWith("docs/"))).toBe(false);
  });

  it("10c. non-git dir -> available false", async () => {
    const dir = await nonGitDir();
    await writeFile(dir, "app.ts", "x\n");

    const res = await listCodebaseFiles({ projectRoot: dir });
    expect(res.available).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.paths).toEqual([]);
  });
});
