import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  codebaseMapMarkdownPath,
  codebaseMapJsonPath,
  extractCodebaseMap,
  renderCodebaseMap,
  writeCodebaseMap,
  loadCodebaseMap,
  renderCodebaseMapForPrompt,
} from "../src/project/codebase-map.js";

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-codebase-map-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });

  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "demo-project",
        main: "src/index.ts",
        scripts: {
          build: "tsc -p .",
          test: "vitest run",
          lint: "eslint .",
        },
      },
      null,
      2,
    ),
  );
  await fs.mkdir(path.join(dir, "src", "server"), { recursive: true });
  await fs.writeFile(path.join(dir, "src", "index.ts"), "export const main = () => {};\n");
  await fs.writeFile(
    path.join(dir, "src", "server", "app.ts"),
    [
      'import express from "express";',
      "const app = express();",
      'app.get("/api/health", (req, res) => res.send("ok"));',
      'app.post("/api/widgets", (req, res) => res.send("created"));',
      "export default app;",
      "",
    ].join("\n"),
  );
  await fs.writeFile(path.join(dir, "vitest.config.ts"), "export default {};\n");
  // Real `vibe init` writes a starter .gitignore that excludes `.vibestrate/`
  // (it is machine-owned state, never source). Mirror that so a `vibe learn`
  // run's own output doesn't get picked up as new untracked files by the next run.
  await fs.writeFile(path.join(dir, ".gitignore"), ".vibestrate/\n");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

describe("extractCodebaseMap", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeProject();
  });

  it("detects stack, scripts, layout, routes, and tooling", async () => {
    const map = await extractCodebaseMap(projectRoot, "2026-07-10T00:00:00.000Z");

    expect(map.schemaVersion).toBe(1);
    expect(map.project.name).toBe("demo-project");
    expect(map.project.scripts.build).toBe("tsc -p .");
    expect(map.project.scripts.test).toBe("vitest run");
    expect(map.rev).toMatch(/^[0-9a-f]{40}$/);

    expect(map.layout.some((l) => l.dir === "src")).toBe(true);
    expect(map.languages.some((l) => l.ext === ".ts")).toBe(true);
    expect(map.entryPoints).toContain("src/index.ts");

    expect(map.httpRoutes.detected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "GET", route: "/api/health" }),
        expect.objectContaining({ method: "POST", route: "/api/widgets" }),
      ]),
    );

    expect(map.tooling).toContain("vitest");
    expect(map.totalTrackedFiles).toBeGreaterThan(0);
  });

  it("includes a declared main/bin entry that exists on disk but is gitignored, and excludes a missing one", async () => {
    const pkgPath = path.join(projectRoot, "package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
    pkg.main = "./dist/index.js"; // built output - exists on disk, not tracked
    pkg.bin = { demo: "./dist/cli.js" }; // never built - should not be claimed as real
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
    await fs.writeFile(path.join(projectRoot, ".gitignore"), ".vibestrate/\ndist/\n");
    await fs.mkdir(path.join(projectRoot, "dist"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "dist", "index.js"), "module.exports = {};\n");
    await execa("git", ["add", "."], { cwd: projectRoot });
    await execa("git", ["commit", "-q", "-m", "add dist build"], { cwd: projectRoot });

    const map = await extractCodebaseMap(projectRoot, "2026-07-10T00:00:00.000Z");
    expect(map.entryPoints).toContain("dist/index.js");
    expect(map.entryPoints).not.toContain("dist/cli.js");
  });

  it("captures Next.js src/app route handlers and ignores pages and routes named in markdown", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-codebase-map-next-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "next-demo", scripts: { build: "next build" } }, null, 2),
    );
    await fs.mkdir(path.join(dir, "src", "app", "api", "widgets", "[id]"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "src", "app", "api", "widgets", "route.ts"),
      "export function GET() {}\n",
    );
    await fs.writeFile(
      path.join(dir, "src", "app", "api", "widgets", "[id]", "route.ts"),
      "export function POST() {}\n",
    );
    // A page, not a route handler - must never be counted as an HTTP route.
    await fs.mkdir(path.join(dir, "src", "app", "dashboard"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "src", "app", "dashboard", "page.tsx"),
      "export default function Page() { return null; }\n",
    );
    // A markdown doc that quotes an express call - documentation, not a route.
    await fs.writeFile(path.join(dir, "NOTES.md"), 'Example: `app.get("/from/docs", handler)`\n');
    await fs.writeFile(path.join(dir, ".gitignore"), ".vibestrate/\n");
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });

    const map = await extractCodebaseMap(dir, "2026-07-10T00:00:00.000Z");

    expect(map.httpRoutes.conventionFiles).toEqual(
      expect.arrayContaining([
        "src/app/api/widgets/route.ts",
        "src/app/api/widgets/[id]/route.ts",
      ]),
    );
    expect(map.httpRoutes.conventionFiles).not.toContain("src/app/dashboard/page.tsx");
    expect(map.httpRoutes.detected.every((r) => !r.route.includes("/from/docs"))).toBe(true);
  });

  it("degrades honestly for a non-git directory without throwing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-codebase-map-nogit-"));
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "no-git" }));

    const map = await extractCodebaseMap(dir, "2026-07-10T00:00:00.000Z");

    expect(map.rev).toBeNull();
    expect(map.layout).toEqual([]);
    expect(map.truncated).toBe(true);
    expect(map.notes.some((n) => n.toLowerCase().includes("not a git repository"))).toBe(true);
  });
});

describe("renderCodebaseMap", () => {
  it("includes the machine-owned banner and labels routes as best effort", async () => {
    const projectRoot = await makeProject();
    const map = await extractCodebaseMap(projectRoot, "2026-07-10T00:00:00.000Z");
    const rendered = renderCodebaseMap(map);

    expect(rendered).toContain("# Codebase map (auto-derived)");
    expect(rendered).toContain("Machine-owned: regenerated by `vibe learn`");
    expect(rendered).toContain("Do not hand-edit");
    expect(rendered).toContain("## HTTP routes (best effort)");
    expect(rendered).toContain("GET /api/health");
  });
});

describe("writeCodebaseMap / loadCodebaseMap", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeProject();
  });

  it("writes both artifacts and is idempotent for the same generatedAt", async () => {
    const generatedAt = "2026-07-10T00:00:00.000Z";
    const first = await writeCodebaseMap(projectRoot, generatedAt);
    expect(first.markdownPath).toBe(codebaseMapMarkdownPath(projectRoot));

    const mdExists = await fs
      .access(codebaseMapMarkdownPath(projectRoot))
      .then(() => true)
      .catch(() => false);
    const jsonExists = await fs
      .access(codebaseMapJsonPath(projectRoot))
      .then(() => true)
      .catch(() => false);
    expect(mdExists).toBe(true);
    expect(jsonExists).toBe(true);

    const mdBefore = await fs.readFile(codebaseMapMarkdownPath(projectRoot), "utf8");
    const jsonBefore = await fs.readFile(codebaseMapJsonPath(projectRoot), "utf8");

    await writeCodebaseMap(projectRoot, generatedAt);

    const mdAfter = await fs.readFile(codebaseMapMarkdownPath(projectRoot), "utf8");
    const jsonAfter = await fs.readFile(codebaseMapJsonPath(projectRoot), "utf8");
    expect(mdAfter).toBe(mdBefore);
    expect(jsonAfter).toBe(jsonBefore);
  });

  it("round-trips through loadCodebaseMap and reports staleness after a new commit", async () => {
    await writeCodebaseMap(projectRoot, "2026-07-10T00:00:00.000Z");

    const loaded = await loadCodebaseMap(projectRoot);
    expect(loaded.present).toBe(true);
    expect(loaded.map?.schemaVersion).toBe(1);
    expect(loaded.stale).toBe(false);

    await fs.writeFile(path.join(projectRoot, "NOTES.md"), "more work\n");
    await execa("git", ["add", "."], { cwd: projectRoot });
    await execa("git", ["commit", "-q", "-m", "more work"], { cwd: projectRoot });

    const loadedAfter = await loadCodebaseMap(projectRoot);
    expect(loadedAfter.present).toBe(true);
    expect(loadedAfter.stale).toBe(true);
  });

  it("reports absent for a project with no map yet", async () => {
    const loaded = await loadCodebaseMap(projectRoot);
    expect(loaded).toEqual({ present: false, map: null, stale: false });
  });

  it("redacts a secret-shaped script value in both written artifacts", async () => {
    const pkgPath = path.join(projectRoot, "package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
    pkg.scripts.deploy = "aws s3 sync --key AKIAIOSFODNN7EXAMPLE .";
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
    await execa("git", ["add", "."], { cwd: projectRoot });
    await execa("git", ["commit", "-q", "-m", "add deploy script"], { cwd: projectRoot });

    await writeCodebaseMap(projectRoot, "2026-07-10T00:00:00.000Z");

    const md = await fs.readFile(codebaseMapMarkdownPath(projectRoot), "utf8");
    const json = await fs.readFile(codebaseMapJsonPath(projectRoot), "utf8");
    expect(md).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(json).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(md).toContain("REDACTED");
    expect(json).toContain("REDACTED");
    // The redacted JSON must still be valid JSON.
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("returns a map matching the redacted disk artifact, never the raw pre-redaction one", async () => {
    const pkgPath = path.join(projectRoot, "package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
    pkg.scripts.deploy = "aws s3 sync --key AKIAIOSFODNN7EXAMPLE .";
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
    await execa("git", ["add", "."], { cwd: projectRoot });
    await execa("git", ["commit", "-q", "-m", "add deploy script"], { cwd: projectRoot });

    const { map } = await writeCodebaseMap(projectRoot, "2026-07-10T00:00:00.000Z");

    expect(JSON.stringify(map)).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(map.project.scripts.deploy).toContain("REDACTED");
  });
});

describe("renderCodebaseMapForPrompt", () => {
  it("bounds output to maxBytes and marks truncation on a line boundary", async () => {
    const projectRoot = await makeProject();
    const map = await extractCodebaseMap(projectRoot, "2026-07-10T00:00:00.000Z");

    const full = renderCodebaseMapForPrompt(map);
    expect(Buffer.byteLength(full, "utf8")).toBeLessThanOrEqual(4096);
    expect(full).not.toContain("Do not hand-edit");
    expect(full).toContain("# Codebase map (auto-derived)");

    const bounded = renderCodebaseMapForPrompt(map, { maxBytes: 200 });
    expect(Buffer.byteLength(bounded, "utf8")).toBeLessThanOrEqual(200);
    expect(bounded).toContain("-- truncated --");
  });

  it("adds a staleness warning when stale is passed", async () => {
    const projectRoot = await makeProject();
    const map = await extractCodebaseMap(projectRoot, "2026-07-10T00:00:00.000Z");
    const rendered = renderCodebaseMapForPrompt(map, { stale: true });
    expect(rendered).toContain("generated at an older commit");
  });

  it("curates a large project into a bounded, prioritized projection", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-codebase-map-big-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    const scripts: Record<string, string> = {
      build: "next build",
      dev: "next dev",
      test: "vitest run",
      lint: "eslint .",
      "check:tenant-isolation": "node scripts/tenant.mjs",
      "check:route-protection": "node scripts/route.mjs",
    };
    // Add noise scripts that should be summarized away, not dumped.
    for (let i = 0; i < 20; i += 1) scripts[`chore-${i}`] = `echo ${i}`;
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "big-app", scripts }, null, 2),
    );
    for (const area of ["activity", "auth", "billing"]) {
      await fs.mkdir(path.join(dir, "src", "app", "api", area), { recursive: true });
      await fs.writeFile(
        path.join(dir, "src", "app", "api", area, "route.ts"),
        "export function GET() {}\n",
      );
    }
    await fs.writeFile(path.join(dir, "vitest.config.ts"), "export default {};\n");
    await fs.writeFile(path.join(dir, "playwright.config.ts"), "export default {};\n");
    await fs.writeFile(path.join(dir, ".gitignore"), ".vibestrate/\n");
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });

    const map = await extractCodebaseMap(dir, "2026-07-10T00:00:00.000Z");
    const block = renderCodebaseMapForPrompt(map);

    // Fits the budget without truncation - curation, not a byte-cut dump.
    expect(Buffer.byteLength(block, "utf8")).toBeLessThanOrEqual(4096);
    expect(block).not.toContain("-- truncated --");
    // High-signal sections all survive.
    expect(block).toContain("## Tooling");
    expect(block).toContain("playwright");
    expect(block).toContain("## HTTP routes");
    // Routes are summarized (count + areas), not dumped as raw file paths.
    expect(block).toContain("areas:");
    expect(block).not.toContain("src/app/api/activity/route.ts");
    // Invariant-signaling scripts are prioritized over chore noise.
    expect(block).toContain("check:tenant-isolation");
    expect(block).not.toContain("chore-0");
    expect(block).toMatch(/more scripts/);
  });
});
