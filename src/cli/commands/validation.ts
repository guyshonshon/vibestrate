import { Command } from "commander";
import { color, symbol } from "../ui/format.js";
import { loadConfig } from "../../project/config-loader.js";
import {
  listValidationProfiles,
  resolveValidationProfile,
  ValidationProfileError,
} from "../../core/validation-profile-service.js";

export function buildValidationCommand(): Command {
  const cmd = new Command("validation").description(
    "Inspect validation profiles configured under commands.validationProfiles.",
  );

  cmd
    .command("profiles")
    .description("List the implicit default + every named validation profile.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const cfg = await loadConfig(process.cwd()).catch(() => null);
      if (!cfg) {
        console.error(color.red("Project not initialised. Run `amaco init`."));
        process.exit(2);
      }
      const profiles = listValidationProfiles(cfg.config);
      if (opts.json) {
        console.log(JSON.stringify(profiles, null, 2));
        return;
      }
      for (const p of profiles) {
        const tag =
          p.source === "default"
            ? color.dim("default")
            : color.cyan(`named`);
        const ok = p.hasCommands ? symbol.ok() : color.yellow("!");
        console.log(`${ok} ${color.bold(p.profileName)} ${tag}`);
        if (p.description) console.log(color.dim(`    ${p.description}`));
        if (p.commands.length === 0) {
          console.log(color.dim("    (no commands)"));
        } else {
          for (const c of p.commands) {
            console.log(color.dim(`    ${c}`));
          }
        }
      }
    });

  cmd
    .command("profile show <name>")
    .description(
      "Show the resolved commands for a named profile (or 'default').",
    )
    .option("--json", "emit JSON")
    .action(async (name: string, opts: { json?: boolean }) => {
      const cfg = await loadConfig(process.cwd()).catch(() => null);
      if (!cfg) {
        console.error(color.red("Project not initialised. Run `amaco init`."));
        process.exit(2);
      }
      try {
        const resolved = resolveValidationProfile(cfg.config, name);
        if (opts.json) {
          console.log(JSON.stringify(resolved, null, 2));
          return;
        }
        console.log(`${color.bold(resolved.profileName)} ${color.dim(resolved.source)}`);
        if (resolved.description) {
          console.log(color.dim(resolved.description));
        }
        if (resolved.commands.length === 0) {
          console.log(
            color.yellow(
              '! No commands. The default profile is empty — set commands.validate \'["pnpm test"]\' or a named profile.',
            ),
          );
        } else {
          for (const c of resolved.commands) console.log(`  ${c}`);
        }
      } catch (err) {
        if (err instanceof ValidationProfileError) {
          console.error(color.red(`${symbol.fail()} ${err.message}`));
          process.exit(err.statusCode === 404 ? 2 : 1);
        }
        throw err;
      }
    });

  return cmd;
}
