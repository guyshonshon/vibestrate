import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { color, symbol } from "../ui/format.js";
import {
  addOwnerPolicy,
  removePolicy,
  confirmPolicy,
  rejectPolicy,
  migratePersonaPreferences,
  listPolicies,
} from "../../project/project-policy-service.js";
import {
  draftPolicyFromDescription,
  suggestPoliciesFromRuns,
  testPolicyRule,
  type PolicyDraft,
} from "../../policies/policy-assist.js";

// Project-policy owner verbs, registered onto `vibe policies`
// (docs/design/policy-consolidation.md). The owner authors tiered rules here so
// they never hand-edit YAML. Optional by design - a plain `vibe run` needs none.
// Parity sibling of the dashboard Project Policies page.
export function registerProjectPolicyCommands(cmd: Command): void {
  cmd
    .command("add <id> <statement>")
    .description("Add a project policy (active immediately). advise by default; --block for a deterministic merge-cap.")
    .option("--fix <text>", "the correction the reviewer should name (advise)")
    .option("--lens <lenses...>", "scope an advise rule to review lenses (default: every run)")
    .option("--block", "make this a deterministic hard merge-block (requires --matcher)")
    .option("--matcher <regex>", "regex matched against added diff lines (block only)")
    .action(
      async (
        id: string,
        statement: string,
        opts: { fix?: string; lens?: string[]; block?: boolean; matcher?: string },
      ) => {
        const policy = await addOwnerPolicy(
          process.cwd(),
          {
            id,
            statement,
            correction: opts.fix ?? null,
            scopeLenses: opts.lens ?? [],
            tier: opts.block ? "block" : "advise",
            matcher: opts.matcher ?? null,
          },
          new Date().toISOString(),
        );
        const how =
          policy.tier === "block"
            ? "blocks the merge when its matcher matches"
            : "the reviewer checks it now";
        console.log(`${symbol.ok()} Added project policy "${policy.id}" (active - ${how}).`);
      },
    );

  cmd
    .command("remove <policyId>")
    .alias("rm")
    .description("Remove a project policy.")
    .action(async (policyId: string) => {
      const { removed } = await removePolicy(process.cwd(), policyId);
      console.log(
        removed
          ? `${symbol.ok()} Removed project policy "${policyId}".`
          : color.dim(`No project policy "${policyId}".`),
      );
    });

  cmd
    .command("confirm <policyId>")
    .description("Confirm a pending (supervisor-proposed) policy - it goes live.")
    .action(async (policyId: string) => {
      const { confirmed } = await confirmPolicy(
        process.cwd(),
        policyId,
        new Date().toISOString(),
      );
      console.log(
        confirmed
          ? `${symbol.ok()} Confirmed project policy "${policyId}" (the reviewer checks it now).`
          : color.dim(`No project policy "${policyId}".`),
      );
    });

  cmd
    .command("reject <policyId>")
    .description("Reject a pending (supervisor-proposed) policy - removes it.")
    .action(async (policyId: string) => {
      const { rejected } = await rejectPolicy(process.cwd(), policyId);
      console.log(
        rejected
          ? `${symbol.ok()} Rejected pending project policy "${policyId}".`
          : color.dim(`No pending project policy "${policyId}".`),
      );
    });

  cmd
    .command("migrate")
    .description("Lift legacy persona-scoped preferences into project policies and remove the old keys.")
    .action(async () => {
      const { moved } = await migratePersonaPreferences(process.cwd());
      console.log(
        moved > 0
          ? `${symbol.ok()} Migrated ${moved} persona preference(s) to project policies.`
          : color.dim("No persona preferences to migrate."),
      );
    });

  registerPolicyAssistCommands(cmd);
}

/** Print an editable draft. Draft only - the owner still runs `policies add`
 *  (or edits) to commit; nothing here writes a policy. */
function printDraft(d: PolicyDraft): void {
  console.log(`  ${color.bold("statement")}  ${d.statement}`);
  const tier = d.suggestedTier === "block" ? color.yellow("block") : color.dim("advise");
  console.log(`  ${color.bold("suggested tier")}  ${tier}`);
  if (d.message) console.log(`  ${color.bold("message")}  ${d.message}`);
  if (d.matcher) {
    console.log(color.dim(`  matcher: /${d.matcher.regex}/${d.matcher.flags}`));
  }
  if (d.glob) console.log(color.dim(`  glob: ${d.glob}`));
  console.log(color.dim(`  applies to: ${d.appliesTo.join(", ")}`));
}

/**
 * Supervisor-assisted authoring + dry-run over the SHARED policy-assist service
 * (parity with the dashboard's /draft, /suggest, /test). Draft/suggest hit the
 * model (input redacted at the source) and NEVER write - they emit an editable
 * draft the owner adopts with `policies add`. Test is deterministic + read-only.
 */
function registerPolicyAssistCommands(cmd: Command): void {
  cmd
    .command("draft <description>")
    .description(
      "Turn an English rule into an editable policy draft (supervisor-assisted). Draft only - never writes; adopt it with `policies add`.",
    )
    .option("--json", "emit JSON")
    .action(async (description: string, opts: { json?: boolean }) => {
      const { draft } = await draftPolicyFromDescription({
        projectRoot: process.cwd(),
        description,
      });
      if (opts.json) {
        console.log(JSON.stringify({ draft }, null, 2));
        return;
      }
      console.log(color.bold("Draft policy (edit, then adopt with `policies add`):"));
      printDraft(draft);
    });

  cmd
    .command("suggest")
    .description(
      "Propose candidate policies from recent runs' diffs (supervisor-assisted). Draft only - never writes.",
    )
    .option("--limit <n>", "how many recent runs to scan (1-10)", (v) => parseInt(v, 10))
    .option("--json", "emit JSON")
    .action(async (opts: { limit?: number; json?: boolean }) => {
      const { drafts, runsScanned } = await suggestPoliciesFromRuns({
        projectRoot: process.cwd(),
        limit: opts.limit,
      });
      if (opts.json) {
        console.log(JSON.stringify({ drafts, runsScanned }, null, 2));
        return;
      }
      if (drafts.length === 0) {
        console.log(color.dim(`No policy suggestions (${runsScanned} run(s) scanned).`));
        return;
      }
      console.log(
        color.bold(`${drafts.length} suggested polic(ies) from ${runsScanned} run(s):`),
      );
      drafts.forEach((d, i) => {
        console.log("");
        console.log(color.dim(`[${i + 1}]`));
        printDraft(d);
      });
      console.log("");
      console.log(color.dim("Adopt any with `policies add <id> \"<statement>\" [--block --matcher ...]`."));
    });

  cmd
    .command("test [policyId]")
    .description(
      "Dry-run a matcher against a diff snippet or recent runs (read-only). Give an existing block-policy id, or --regex.",
    )
    .option("--regex <pattern>", "regex to test (instead of a policy id)")
    .option("--flags <flags>", "regex flags (subset of gimsuy)")
    .option("--glob <glob>", "touched-file glob to test")
    .option("--snippet <file>", "path to a diff/patch file to test against")
    .option("--recent", "test against recent runs' diffs")
    .option("--limit <n>", "recent runs to scan (1-10)", (v) => parseInt(v, 10))
    .option("--surface <surface>", "apply surface (suggestion-apply | bundle-apply)", "suggestion-apply")
    .option("--json", "emit JSON")
    .action(
      async (
        policyId: string | undefined,
        opts: {
          regex?: string;
          flags?: string;
          glob?: string;
          snippet?: string;
          recent?: boolean;
          limit?: number;
          surface?: string;
          json?: boolean;
        },
      ) => {
        const surfaceParsed = policySurfaceForCli(opts.surface);
        // Resolve the matcher: an existing project block-policy id, or --regex/--glob.
        let regex = opts.regex;
        let flags = opts.flags;
        const glob = opts.glob;
        if (policyId) {
          const policies = await listPolicies(process.cwd());
          const target = policies.find((p) => p.id === policyId);
          if (!target) {
            console.error(color.red(`${symbol.fail()} No project policy "${policyId}".`));
            process.exit(2);
          }
          if (!target.matcher) {
            console.error(
              color.red(
                `${symbol.fail()} Policy "${policyId}" has no matcher (only block-tier policies do). Use --regex to test an ad-hoc pattern.`,
              ),
            );
            process.exit(2);
          }
          regex = target.matcher;
          flags = undefined;
        }
        if (!regex && !glob) {
          console.error(
            color.red(`${symbol.fail()} Provide a policy id, --regex, or --glob to test.`),
          );
          process.exit(2);
        }

        // Resolve the source: a snippet file, or recent runs.
        let source:
          | { kind: "snippet"; patch: string }
          | { kind: "recent"; limit?: number };
        if (opts.snippet) {
          const abs = path.resolve(process.cwd(), opts.snippet);
          let patch: string;
          try {
            patch = await fs.readFile(abs, "utf8");
          } catch (err) {
            console.error(
              color.red(
                `${symbol.fail()} cannot read snippet file: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
            process.exit(2);
          }
          source = { kind: "snippet", patch };
        } else {
          // Default (and --recent): scan recent runs.
          source = { kind: "recent", limit: opts.limit };
        }

        const result = await testPolicyRule({
          projectRoot: process.cwd(),
          rule: { regex, flags, glob, appliesTo: [surfaceParsed] },
          source,
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          process.exit(result.matches.length === 0 ? 0 : 1);
        }
        console.log(
          color.dim(
            `evaluated ${result.evaluatedCount} source(s); ${result.matches.length} match(es)`,
          ),
        );
        if (result.matches.length === 0) {
          console.log(`${symbol.ok()} No matches - this rule would flag nothing here.`);
          return;
        }
        for (const m of result.matches) {
          const where = [m.runId ? `run ${m.runId}` : null, m.file].filter(Boolean).join(" · ");
          console.log(
            color.yellow(`${symbol.warn()} ${where || "(match)"}`) +
              (m.line ? color.dim(`  ${m.line}`) : ""),
          );
        }
        process.exit(1);
      },
    );
}

/** Validate the --surface flag for the assist test command, exit(2) on a bad value. */
function policySurfaceForCli(surface: string | undefined): "suggestion-apply" | "bundle-apply" {
  const s = surface ?? "suggestion-apply";
  if (s === "suggestion-apply" || s === "bundle-apply") return s;
  console.error(
    color.red(`${symbol.fail()} --surface must be one of: suggestion-apply, bundle-apply`),
  );
  process.exit(2);
}
