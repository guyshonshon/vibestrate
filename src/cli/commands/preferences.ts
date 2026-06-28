import { Command } from "commander";
import { color, symbol } from "../ui/format.js";
import {
  addOwnerPreference,
  listPreferences,
  removePreference,
} from "../../project/preferences-service.js";

// `vibe preferences` (alias `prefs`): owner-explicit capture for the rules the
// reviewer checks (preference-gates.ts). Optional by design - a plain `vibe run`
// needs none of this. Parity sibling of `vibe policies` / the UI preferences panel.
export function buildPreferencesCommand(): Command {
  const cmd = new Command("preferences")
    .alias("prefs")
    .description(
      "Owner preferences the reviewer checks for (e.g. \"use a hyphen, not an em-dash\"). Optional - a plain run needs none.",
    );

  cmd
    .command("list <personaId>")
    .description("List a persona's preferences.")
    .option("--json", "emit JSON")
    .action(async (personaId: string, opts: { json?: boolean }) => {
      const list = await listPreferences(process.cwd(), personaId);
      if (opts.json) {
        console.log(JSON.stringify(list, null, 2));
        return;
      }
      if (list.length === 0) {
        console.log(color.dim(`No preferences on "${personaId}".`));
        return;
      }
      for (const p of list) {
        const status = p.confirmedAt ? color.dim("active") : color.dim("pending confirm");
        console.log(`${color.bold(p.id)}  ${status}`);
        console.log(`  ${p.statement}${p.correction ? ` -> ${p.correction}` : ""}`);
        if (p.scope.lenses.length > 0) {
          console.log(color.dim(`  scope: ${p.scope.lenses.join(", ")}`));
        }
      }
    });

  cmd
    .command("add <personaId> <id> <statement>")
    .description("Add an owner preference (active immediately).")
    .option("--fix <text>", "the correction the reviewer should name")
    .option("--lens <lenses...>", "scope to one or more review lenses (default: all reviewer turns)")
    .action(
      async (
        personaId: string,
        id: string,
        statement: string,
        opts: { fix?: string; lens?: string[] },
      ) => {
        const pref = await addOwnerPreference(
          process.cwd(),
          {
            personaId,
            id,
            statement,
            correction: opts.fix ?? null,
            scopeLenses: opts.lens ?? [],
          },
          new Date().toISOString(),
        );
        console.log(`${symbol.ok} Added "${pref.id}" to ${personaId} (active - the reviewer checks it now).`);
      },
    );

  cmd
    .command("remove <personaId> <preferenceId>")
    .alias("rm")
    .description("Remove a preference.")
    .action(async (personaId: string, preferenceId: string) => {
      const { removed } = await removePreference(process.cwd(), personaId, preferenceId);
      console.log(
        removed
          ? `${symbol.ok} Removed "${preferenceId}" from ${personaId}.`
          : color.dim(`No preference "${preferenceId}" on ${personaId}.`),
      );
    });

  return cmd;
}
