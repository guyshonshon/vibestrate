import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { color, symbol } from "../ui/format.js";
import { loadPolicySnapshot } from "../../policies/policy-store.js";
import { evaluatePatchAgainstPolicies } from "../../policies/policy-engine.js";
import { policySurfaceSchema } from "../../policies/policy-types.js";
import { loadConfig } from "../../project/config-loader.js";
import { setConfigValue } from "../../setup/config-update-service.js";
import { listPolicies } from "../../project/project-policy-service.js";
import { registerProjectPolicyCommands } from "./policies-rules.js";

export function buildPoliciesCommand(): Command {
  const cmd = new Command("policies").description(
    "The project's rule surface: owner-authored tiered policies (advise = reviewer-checked; block = deterministic merge-cap) plus the hard, fail-closed security gates in .vibestrate/policies/.",
  );

  // Owner project-policy verbs (add/remove/confirm/reject/migrate). Optional by
  // design - a plain `vibe run` needs none of this.
  registerProjectPolicyCommands(cmd);

  cmd
    .command("list")
    .description(
      "List the project's policies (owner-authored tiered rules) and the hard security gates in .vibestrate/policies/*.yml.",
    )
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const snap = await loadPolicySnapshot(process.cwd());
      const projectPolicies = await listPolicies(process.cwd()).catch(() => []);
      if (opts.json) {
        console.log(JSON.stringify({ projectPolicies, ...snap }, null, 2));
        return;
      }
      if (projectPolicies.length > 0) {
        console.log(color.bold("Project policies (owner-authored):"));
        for (const p of projectPolicies) {
          const status = p.confirmedAt ? color.dim("active") : color.dim("pending confirm");
          const tier = p.tier === "block" ? color.yellow("block") : color.dim("advise");
          console.log(`${color.bold(p.id)}  ${tier}  ${status}`);
          console.log(`  ${p.statement}${p.correction ? ` -> ${p.correction}` : ""}`);
          if (p.tier === "block" && p.matcher) console.log(color.dim(`  matcher: /${p.matcher}/`));
          if (p.scope.lenses.length > 0) console.log(color.dim(`  scope: ${p.scope.lenses.join(", ")}`));
        }
        console.log("");
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
      "Apply the loaded policy rules to a patch file (unified diff). Read-only - never applies, never executes.",
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

      console.log(`${color.bold("Vibestrate policies - doctor")}`);
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

  // ── Safety behavior toggles (the `policies.*` config block) ──────────────
  // Mirrors the dashboard's Advanced - Safety panel (UI⇄CLI parity).
  const boolOpt = (v: string): boolean => {
    if (v === "true" || v === "on" || v === "1") return true;
    if (v === "false" || v === "off" || v === "0") return false;
    throw new Error(`expected true|false, got "${v}"`);
  };
  cmd
    .command("config")
    .description(
      "Show or set the safety behavior toggles (strict apply-only, terminal, forbid-* guards).",
    )
    .option("--json", "emit JSON")
    .option("--strict-apply-only <bool>", "agents propose diffs; gateway applies", boolOpt)
    .option("--harden-read-only <bool>", "read-only claude seats run --permission-mode plan", boolOpt)
    .option("--allow-terminal <bool>", "enable the dashboard terminal panel", boolOpt)
    .option("--forbid-main-writes <bool>", "block writes to the main branch", boolOpt)
    .option("--forbid-secrets <bool>", "block reads/writes of secret files", boolOpt)
    .option("--forbid-push <bool>", "block auto-push", boolOpt)
    .option("--forbid-merge <bool>", "block auto-merge", boolOpt)
    .action(
      async (opts: {
        json?: boolean;
        strictApplyOnly?: boolean;
        hardenReadOnly?: boolean;
        allowTerminal?: boolean;
        forbidMainWrites?: boolean;
        forbidSecrets?: boolean;
        forbidPush?: boolean;
        forbidMerge?: boolean;
      }) => {
        const root = process.cwd();
        const writes: [string, boolean][] = [];
        if (opts.strictApplyOnly !== undefined)
          writes.push(["strictApplyOnly", opts.strictApplyOnly]);
        if (opts.hardenReadOnly !== undefined)
          writes.push(["hardenReadOnlySeats", opts.hardenReadOnly]);
        if (opts.allowTerminal !== undefined)
          writes.push(["allowInteractiveTerminal", opts.allowTerminal]);
        if (opts.forbidMainWrites !== undefined)
          writes.push(["forbidMainBranchWrites", opts.forbidMainWrites]);
        if (opts.forbidSecrets !== undefined)
          writes.push(["forbidSecretsAccess", opts.forbidSecrets]);
        if (opts.forbidPush !== undefined)
          writes.push(["forbidAutoPush", opts.forbidPush]);
        if (opts.forbidMerge !== undefined)
          writes.push(["forbidAutoMerge", opts.forbidMerge]);

        for (const [key, value] of writes) {
          await setConfigValue(root, `policies.${key}`, String(value));
        }

        const loaded = await loadConfig(root);
        const p = loaded.config.policies;
        if (opts.json) {
          console.log(JSON.stringify(p, null, 2));
          return;
        }
        if (writes.length > 0) {
          console.log(`${symbol.ok()} Updated ${writes.length} setting(s).`);
        }
        const onOff = (b: boolean) => (b ? color.green("on") : color.dim("off"));
        console.log(color.bold("Safety behavior:"));
        console.log(`  strict apply-only:        ${onOff(p.strictApplyOnly)}`);
        console.log(`  harden read-only seats:   ${onOff(p.hardenReadOnlySeats)}`);
        console.log(`  interactive terminal:     ${onOff(p.allowInteractiveTerminal)}`);
        console.log(`  forbid main-branch writes: ${onOff(p.forbidMainBranchWrites)}`);
        console.log(`  forbid secrets access:    ${onOff(p.forbidSecretsAccess)}`);
        console.log(`  forbid auto-push:         ${onOff(p.forbidAutoPush)}`);
        console.log(`  forbid auto-merge:        ${onOff(p.forbidAutoMerge)}`);
      },
    );

  return cmd;
}
