import { Command } from "commander";
import { color, symbol } from "../ui/format.js";
import {
  addOwnerPolicy,
  removePolicy,
  confirmPolicy,
  rejectPolicy,
  migratePersonaPreferences,
} from "../../project/project-policy-service.js";

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
        console.log(`${symbol.ok} Added project policy "${policy.id}" (active - ${how}).`);
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
          ? `${symbol.ok} Removed project policy "${policyId}".`
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
          ? `${symbol.ok} Confirmed project policy "${policyId}" (the reviewer checks it now).`
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
          ? `${symbol.ok} Rejected pending project policy "${policyId}".`
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
          ? `${symbol.ok} Migrated ${moved} persona preference(s) to project policies.`
          : color.dim("No persona preferences to migrate."),
      );
    });
}
