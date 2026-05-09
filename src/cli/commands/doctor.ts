import {
  runDoctor,
  applyDoctorFixes,
  type DoctorFinding,
} from "../../setup/doctor-service.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isAmacoError } from "../../utils/errors.js";

type DoctorOptions = {
  json?: boolean;
  fix?: boolean;
};

function severitySymbol(severity: DoctorFinding["severity"]): string {
  switch (severity) {
    case "ok":
      return symbol.ok();
    case "warn":
      return symbol.warn();
    case "fail":
      return symbol.fail();
  }
}

async function readPkgVersion(): Promise<string> {
  const candidates = [
    new URL("../../../package.json", import.meta.url),
    new URL("../package.json", import.meta.url),
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

export async function runDoctorCommand(opts: DoctorOptions = {}): Promise<number> {
  const cwd = process.cwd();
  let report;
  try {
    report = await runDoctor({ cwd });
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : String(err)}`,
    );
    return 1;
  }

  if (opts.fix) {
    const fixOutcome = await applyDoctorFixes({ projectRoot: report.projectRoot });
    // Re-run report after fixes.
    report = await runDoctor({ cwd });
    if (!opts.json) {
      console.log(header("Amaco Doctor — Fixes Applied"));
      console.log("");
      if (fixOutcome.applied.length === 0) {
        console.log(`${symbol.warn()} No safe fixes were applicable.`);
      } else {
        for (const a of fixOutcome.applied) {
          console.log(`${symbol.ok()} ${a}`);
        }
      }
      if (fixOutcome.skipped.length > 0) {
        console.log("");
        for (const s of fixOutcome.skipped) {
          console.log(`${symbol.warn()} ${s}`);
        }
      }
      console.log("");
    }
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          projectRoot: report.projectRoot,
          inGitRepo: report.inGitRepo,
          findings: report.findings,
          recommendedNextSteps: report.recommendedNextSteps,
        },
        null,
        2,
      ),
    );
    const failed = report.findings.some((f) => f.severity === "fail");
    return failed ? 1 : 0;
  }

  const version = await readPkgVersion();
  console.log(`${color.bold("Amaco Doctor")} ${color.dim(`v${version}`)}`);
  console.log("");
  for (const f of report.findings) {
    const head = `${severitySymbol(f.severity)} ${f.title}`;
    console.log(head);
    if (f.detail) console.log(indent(color.dim(f.detail)));
    if (f.severity !== "ok" && f.fixHint) {
      console.log(indent(`${symbol.arrow()} ${f.fixHint}`));
    }
  }

  if (report.recommendedNextSteps.length > 0) {
    console.log("");
    console.log(header("Next:"));
    for (const step of report.recommendedNextSteps) {
      console.log(indent(`${symbol.arrow()} ${step}`));
    }
  }

  const failed = report.findings.some((f) => f.severity === "fail");
  return failed ? 1 : 0;
}
