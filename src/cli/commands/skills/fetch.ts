import { detectProject } from "../../../project/project-detector.js";
import {
  installSkillFromUrl,
  assessSkill,
} from "../../../skills/skill-fetch.js";
import { color, indent, symbol } from "../../ui/format.js";

export async function runSkillsFetch(
  url: string,
  opts: { name?: string; assess?: boolean; profile?: string },
): Promise<number> {
  const { projectRoot } = await detectProject(process.cwd());

  if (opts.assess) {
    // Read-only AI overview before installing — fetch (guarded) then judge.
    const got = await installSkillFromUrl({
      projectRoot,
      url,
      name: opts.name,
      allowPrivateHosts: true,
    });
    // installSkillFromUrl already wrote the file; for --assess we also judge it.
    if (!got.ok) {
      console.error(`${symbol.fail()} ${got.reason}`);
      return 1;
    }
    try {
      const { loadConfig } = await import("../../../project/config-loader.js");
      const { readText } = await import("../../../utils/fs.js");
      const path = await import("node:path");
      const { projectSkillsDir } = await import("../../../utils/paths.js");
      const skillText = await readText(
        path.join(projectSkillsDir(projectRoot), `${got.name}.md`),
      );
      const loaded = await loadConfig(projectRoot);
      const verdict = await assessSkill({ projectRoot, skillText, loaded });
      console.log(`${symbol.ok()} Installed ${color.bold(got.name)} (${got.relPath}).`);
      const tone =
        verdict.verdict === "conflicting" ? symbol.warn() : symbol.bullet();
      console.log(`${tone} AI overview: ${color.bold(verdict.verdict)} — ${verdict.reason}`);
      if (verdict.overlaps && verdict.overlaps.length) {
        console.log(indent(color.dim(`overlaps: ${verdict.overlaps.join(", ")}`)));
      }
      return 0;
    } catch (err) {
      console.log(`${symbol.ok()} Installed ${color.bold(got.name)} (${got.relPath}).`);
      console.error(
        `${symbol.warn()} AI overview skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  const r = await installSkillFromUrl({
    projectRoot,
    url,
    name: opts.name,
    allowPrivateHosts: true,
  });
  if (!r.ok) {
    console.error(`${symbol.fail()} ${r.reason}`);
    return 1;
  }
  console.log(`${symbol.ok()} Installed ${color.bold(r.name)} → ${r.relPath}.`);
  if (r.redactedSecrets > 0) {
    console.log(indent(color.dim(`${r.redactedSecrets} secret token(s) redacted.`)));
  }
  console.log(indent(color.dim("Assign it: vibe skills assign <agent> " + r.name)));
  return 0;
}
