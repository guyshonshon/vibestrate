import path from "node:path";
import { execa } from "execa";
import { detectProject } from "../../project/project-detector.js";
import { configExists, loadConfig } from "../../project/config-loader.js";
import { isGitAvailable } from "../../git/git.js";
import { pathExists } from "../../utils/fs.js";

type CheckResult = {
  name: string;
  status: "ok" | "warn" | "fail";
  detail?: string;
};

const ENV_FILES = [".env", ".env.local", ".env.development", ".env.production"];

async function checkProvider(command: string): Promise<boolean> {
  try {
    const result = await execa(command, ["--version"], { reject: false, timeout: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function runDoctorCommand(): Promise<number> {
  const cwd = process.cwd();
  const detected = await detectProject(cwd);
  const checks: CheckResult[] = [];

  checks.push({
    name: "git available",
    status: (await isGitAvailable()) ? "ok" : "fail",
  });
  checks.push({
    name: "inside git repo",
    status: detected.isGitRepo ? "ok" : "fail",
    detail: detected.gitRoot ?? cwd,
  });

  const hasConfig = await configExists(detected.projectRoot);
  checks.push({
    name: ".amaco/project.yml present",
    status: hasConfig ? "ok" : "fail",
    detail: path.join(".amaco", "project.yml"),
  });

  if (hasConfig) {
    try {
      const loaded = await loadConfig(detected.projectRoot);
      checks.push({ name: "project config valid", status: "ok" });

      if (loaded.config.commands.validate.length === 0) {
        checks.push({
          name: "validation commands configured",
          status: "warn",
          detail: "commands.validate is empty",
        });
      } else {
        checks.push({
          name: "validation commands configured",
          status: "ok",
          detail: `${loaded.config.commands.validate.length} commands`,
        });
      }

      for (const [providerId, provider] of Object.entries(loaded.config.providers)) {
        const ok = await checkProvider(provider.command);
        checks.push({
          name: `provider "${providerId}" available`,
          status: ok ? "ok" : "warn",
          detail: provider.command,
        });
      }
    } catch (err) {
      checks.push({
        name: "project config valid",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const envFile of ENV_FILES) {
    const candidate = path.join(detected.projectRoot, envFile);
    if (await pathExists(candidate)) {
      checks.push({
        name: `${envFile} exists`,
        status: "warn",
        detail: "Amaco will not read its contents into prompts.",
      });
    }
  }

  const version = await readPkgVersion();
  console.log(`amaco v${version}`);
  console.log("");
  let exitCode = 0;
  for (const c of checks) {
    const symbol = c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗";
    const detail = c.detail ? ` — ${c.detail}` : "";
    console.log(`  [${symbol}] ${c.name}${detail}`);
    if (c.status === "fail") exitCode = 1;
  }
  return exitCode;
}

async function readPkgVersion(): Promise<string> {
  const candidates = [
    new URL("../../../package.json", import.meta.url), // src/cli/commands/doctor.ts -> pkg root
    new URL("../package.json", import.meta.url), // dist/index.js -> pkg root
  ];
  const fs = await import("node:fs/promises");
  for (const url of candidates) {
    try {
      const raw = await fs.readFile(url, "utf8");
      const json = JSON.parse(raw) as { version?: unknown };
      if (typeof json.version === "string") return json.version;
    } catch {
      // try next
    }
  }
  return "0.0.0";
}
