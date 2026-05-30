import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { color, symbol } from "../ui/format.js";
import { loadPolicySnapshot } from "../../policies/policy-store.js";
import { evaluatePatchAgainstPolicies } from "../../policies/policy-engine.js";
import { policySurfaceSchema } from "../../policies/policy-types.js";

export function buildPoliciesCommand(): Command {
  const cmd = new Command("policies").description(
    "Inspect user policy rules in .vibestrate/policies/. Rules can refuse a suggestion/bundle apply; they never permit a patch that built-in safety already refused.",
  );

  cmd
    .command("list")
    .description(
      "List every rule loaded from .vibestrate/policies/*.yml (after schema + regex/glob validation).",
    )
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const snap = await loadPolicySnapshot(process.cwd());
      if (opts.json) {
        console.log(JSON.stringify(snap, null, 2));
        return;
      }
      if (
        snap.rules.length === 0 &&
        snap.actions.length === 0 &&
        snap.ruleFiles.length === 0
      ) {
        console.log(
          color.dim("No policy rule files in .vibestrate/policies/. Empty rule set."),
        );
        return;
      }
      for (const f of snap.ruleFiles) {
        const ids = f.ruleIds.length > 0 ? f.ruleIds.join(", ") : color.dim("(no rules)");
        const acts =
          f.actionIds.length > 0 ? `  actions: ${f.actionIds.join(", ")}` : "";
        console.log(`${color.bold(f.file)}  ${color.dim(`rules: ${ids}${acts}`)}`);
      }
      console.log("");
      for (const r of snap.rules) {
        const surfaces = r.appliesTo.join(", ");
        console.log(`${color.bold(r.id)}  ${color.dim(surfaces)}`);
        console.log(color.dim(`  ${r.description}`));
        if (r.matchTouchedFiles) {
          console.log(color.dim(`  touched-files glob: ${r.matchTouchedFiles.glob}`));
        }
        if (r.matchAddedContent) {
          const flags = r.matchAddedContent.flags ?? "";
          console.log(
            color.dim(
              `  added-content regex: /${r.matchAddedContent.regex}/${flags}`,
            ),
          );
        }
        console.log(color.dim(`  message: ${r.message}`));
      }
      if (snap.actions.length > 0) {
        console.log("");
        console.log(color.bold("Action policies (Action Broker):"));
        for (const a of snap.actions) {
          console.log(
            `${color.bold(a.id)}  ${color.dim(`${a.effect} on ${a.on.join(", ")}`)}`,
          );
          console.log(color.dim(`  ${a.description}`));
          const m = a.match;
          if (m?.providerId) console.log(color.dim(`  providerId: ${m.providerId}`));
          if (m?.commandRegex)
            console.log(
              color.dim(`  command regex: /${m.commandRegex}/${m.commandFlags ?? ""}`),
            );
          if (m?.pathGlob) console.log(color.dim(`  path glob: ${m.pathGlob}`));
          if (m?.status) console.log(color.dim(`  status: ${m.status}`));
          console.log(color.dim(`  message: ${a.message}`));
        }
      }
      if (snap.duplicateIds.length > 0) {
        console.log("");
        console.log(
          color.yellow(
            `${symbol.warn()} duplicate ids (first occurrence wins): ${snap.duplicateIds.join(", ")}`,
          ),
        );
      }
      if (snap.malformedFiles.length > 0) {
        console.log("");
        for (const m of snap.malformedFiles) {
          console.log(color.yellow(`${symbol.warn()} ${m.file}: ${m.reason}`));
        }
      }
    });

  cmd
    .command("check <patchFile>")
    .description(
      "Apply the loaded policy rules to a patch file (unified diff). Read-only — never applies, never executes.",
    )
    .option(
      "--surface <surface>",
      "which apply surface to simulate (suggestion-apply | bundle-apply)",
      "suggestion-apply",
    )
    .option("--json", "emit JSON")
    .action(async (patchFile: string, opts: { surface?: string; json?: boolean }) => {
      const surfaceParsed = policySurfaceSchema.safeParse(opts.surface ?? "suggestion-apply");
      if (!surfaceParsed.success) {
        console.error(
          color.red(
            `${symbol.fail()} --surface must be one of: suggestion-apply, bundle-apply`,
          ),
        );
        process.exit(2);
      }
      const abs = path.resolve(process.cwd(), patchFile);
      let patch: string;
      try {
        patch = await fs.readFile(abs, "utf8");
      } catch (err) {
        console.error(
          color.red(
            `${symbol.fail()} cannot read patch file: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exit(2);
      }
      const snap = await loadPolicySnapshot(process.cwd());
      const result = evaluatePatchAgainstPolicies(snap.rules, {
        patch,
        surface: surfaceParsed.data,
      });
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              surface: surfaceParsed.data,
              evaluatedRuleIds: result.evaluatedRuleIds,
              violations: result.violations,
            },
            null,
            2,
          ),
        );
        process.exit(result.violations.length === 0 ? 0 : 1);
      }
      console.log(
        `${color.dim(`scope=${surfaceParsed.data}, evaluated=${result.evaluatedRuleIds.length} rule(s)`)}`,
      );
      if (result.violations.length === 0) {
        console.log(`${symbol.ok()} No policy violations.`);
        return;
      }
      for (const v of result.violations) {
        console.log(
          color.yellow(
            `${symbol.warn()} ${v.message} (policy rule: ${v.ruleId})${v.matchedFile ? color.dim(`  · file: ${v.matchedFile}`) : ""}`,
          ),
        );
      }
      process.exit(1);
    });

  cmd
    .command("doctor")
    .description(
      "Validate rule YAML, list malformed files, surface duplicate ids and empty-rule files.",
    )
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const snap = await loadPolicySnapshot(process.cwd());
      const malformed = snap.malformedFiles;
      const dupes = snap.duplicateIds;
      const ruleCount = snap.rules.length;
      const actionCount = snap.actions.length;
      const fileCount = snap.ruleFiles.length;

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              ruleCount,
              actionCount,
              fileCount,
              malformedFiles: malformed,
              duplicateIds: dupes,
            },
            null,
            2,
          ),
        );
        process.exit(malformed.length === 0 && dupes.length === 0 ? 0 : 1);
      }

      console.log(`${color.bold("Vibestrate policies — doctor")}`);
      console.log("");
      console.log(
        `${symbol.ok()} ${fileCount} rule file(s), ${ruleCount} rule(s), ${actionCount} action policy(ies) loaded.`,
      );

      if (dupes.length > 0) {
        console.log(
          color.yellow(
            `${symbol.warn()} duplicate ids (first occurrence wins): ${dupes.join(", ")}`,
          ),
        );
      }
      if (malformed.length > 0) {
        for (const m of malformed) {
          console.log(color.red(`${symbol.fail()} ${m.file}: ${m.reason}`));
        }
      }
      if (dupes.length === 0 && malformed.length === 0) {
        console.log(`${symbol.ok()} No issues.`);
      } else {
        process.exit(1);
      }
    });

  return cmd;
}
