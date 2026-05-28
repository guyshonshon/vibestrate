import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  detectFullProject,
  detectPackageManager,
  detectProjectType,
  suggestValidationCommands,
} from "../src/project/project-detector.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-projdet-"));
}

describe("package manager detection", () => {
  it("detects pnpm", async () => {
    const dir = await tempProject();
    await fs.writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
    expect(await detectPackageManager(dir)).toBe("pnpm");
  });
  it("detects npm", async () => {
    const dir = await tempProject();
    await fs.writeFile(path.join(dir, "package-lock.json"), "{}");
    expect(await detectPackageManager(dir)).toBe("npm");
  });
  it("detects yarn", async () => {
    const dir = await tempProject();
    await fs.writeFile(path.join(dir, "yarn.lock"), "");
    expect(await detectPackageManager(dir)).toBe("yarn");
  });
  it("detects bun via bun.lockb", async () => {
    const dir = await tempProject();
    await fs.writeFile(path.join(dir, "bun.lockb"), "");
    expect(await detectPackageManager(dir)).toBe("bun");
  });
  it("detects bun via bun.lock", async () => {
    const dir = await tempProject();
    await fs.writeFile(path.join(dir, "bun.lock"), "");
    expect(await detectPackageManager(dir)).toBe("bun");
  });
  it("returns unknown when no lockfile", async () => {
    const dir = await tempProject();
    expect(await detectPackageManager(dir)).toBe("unknown");
  });
});

describe("project type detection", () => {
  it("detects nextjs", async () => {
    const dir = await tempProject();
    await fs.writeFile(path.join(dir, "next.config.js"), "");
    expect(await detectProjectType(dir)).toBe("nextjs");
  });
  it("detects vite", async () => {
    const dir = await tempProject();
    await fs.writeFile(path.join(dir, "vite.config.ts"), "");
    expect(await detectProjectType(dir)).toBe("vite");
  });
  it("detects typescript", async () => {
    const dir = await tempProject();
    await fs.writeFile(path.join(dir, "tsconfig.json"), "{}");
    expect(await detectProjectType(dir)).toBe("typescript");
  });
  it("detects node", async () => {
    const dir = await tempProject();
    await fs.writeFile(path.join(dir, "package.json"), "{}");
    expect(await detectProjectType(dir)).toBe("node");
  });
  it("falls back to generic", async () => {
    const dir = await tempProject();
    expect(await detectProjectType(dir)).toBe("generic");
  });
});

describe("suggestValidationCommands", () => {
  it("only suggests scripts that exist, in priority order", () => {
    const out = suggestValidationCommands("pnpm", {
      typecheck: "tsc --noEmit",
      test: "vitest run",
      lint: "eslint .",
    });
    expect(out).toEqual(["pnpm lint", "pnpm typecheck", "pnpm test"]);
  });
  it("does not invent scripts", () => {
    expect(suggestValidationCommands("pnpm", {})).toEqual([]);
  });
  it("uses npm run for npm", () => {
    const out = suggestValidationCommands("npm", { test: "x", lint: "y" });
    expect(out).toEqual(["npm run lint", "npm run test"]);
  });
  it("uses yarn for yarn", () => {
    const out = suggestValidationCommands("yarn", { test: "x" });
    expect(out).toEqual(["yarn test"]);
  });
  it("uses bun run for bun", () => {
    const out = suggestValidationCommands("bun", { test: "x" });
    expect(out).toEqual(["bun run test"]);
  });
  it("returns nothing for unknown package manager", () => {
    expect(suggestValidationCommands("unknown", { test: "x" })).toEqual([]);
  });
});

describe("detectFullProject", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await tempProject();
  });

  it("falls back to folder name if no package.json", async () => {
    const detected = await detectFullProject(dir);
    expect(detected.name).toBe(path.basename(dir));
    expect(detected.hasPackageJson).toBe(false);
    expect(detected.suggestedValidationCommands).toEqual([]);
  });

  it("uses package.json name when present", async () => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "my-pkg", scripts: { test: "vitest" } }),
    );
    await fs.writeFile(path.join(dir, "pnpm-lock.yaml"), "x");
    const detected = await detectFullProject(dir);
    expect(detected.name).toBe("my-pkg");
    expect(detected.packageManager).toBe("pnpm");
    expect(detected.suggestedValidationCommands).toEqual(["pnpm test"]);
  });
});
