import { Command } from "commander";
import { detectProject } from "../../../project/project-detector.js";
import { loadConfig } from "../../../project/config-loader.js";
import {
  createProfile,
  deleteProfile,
  setProfileFields,
} from "../../../setup/config-update-service.js";
import { rolesUsingProfile } from "../../../agents/profile-usage.js";
import { color, header, indent, symbol } from "../../ui/format.js";

type FieldOpts = {
  provider?: string;
  label?: string;
  model?: string;
  power?: string;
  maxTokens?: string;
  timeout?: string;
};

function fieldsFromOpts(opts: FieldOpts): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (opts.provider) f.provider = opts.provider;
  if (opts.label) f.label = opts.label;
  if (opts.model) f.model = opts.model;
  if (opts.power) f.power = opts.power;
  if (opts.maxTokens) f.maxTokens = Number(opts.maxTokens);
  if (opts.timeout) f.timeoutMs = Number(opts.timeout);
  return f;
}

function fieldOptions(cmd: Command): Command {
  return cmd
    .option("--label <label>", "human label")
    .option("--model <model>", "provider model id (e.g. sonnet, opus)")
    .option("--power <level>", "provider-specific power/effort (e.g. balanced)")
    .option("--max-tokens <n>", "hard cap on output tokens per turn")
    .option("--timeout <ms>", "per-turn wall-clock timeout (ms)");
}

export function buildProfilesCommand(): Command {
  const cmd = new Command("profile").description(
    "Runtime presets (provider + model/power) that Crew roles run on.",
  );

  cmd
    .command("list")
    .description("List profiles, grouped by provider, with how many roles use each.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const { config } = await loadConfig(projectRoot);
      const entries = Object.entries(config.profiles);
      if (opts.json) {
        console.log(
          JSON.stringify(
            entries.map(([id, p]) => ({
              id,
              ...p,
              usedBy: rolesUsingProfile(config, id),
            })),
            null,
            2,
          ),
        );
        return;
      }
      if (entries.length === 0) {
        console.log("No profiles yet. Add one: vibe profile add <id> --provider <p>.");
        return;
      }
      console.log(header(`Profiles (${entries.length})`));
      console.log("");
      for (const [id, p] of entries) {
        const used = rolesUsingProfile(config, id);
        const bits = [p.model, p.power].filter(Boolean).join(" · ");
        console.log(
          `${color.bold(id)} ${color.dim(`@${p.provider}`)}${bits ? `  ${color.dim(bits)}` : ""}`,
        );
        console.log(
          indent(
            color.dim(
              used.length
                ? `used by ${used.map((u) => `${u.crewId}/${u.roleId}`).join(", ")}`
                : "unused",
            ),
          ),
        );
      }
    });

  fieldOptions(
    cmd
      .command("add <id>")
      .description("Create a new profile.")
      .requiredOption("--provider <id>", "raw provider id this profile runs on"),
  ).action(async (id: string, opts: FieldOpts) => {
    const { projectRoot } = await detectProject(process.cwd());
    try {
      await createProfile(projectRoot, id, fieldsFromOpts(opts));
      console.log(`${symbol.ok()} Created profile ${color.bold(id)}.`);
    } catch (err) {
      console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

  fieldOptions(
    cmd.command("set <id>").description("Edit an existing profile's fields."),
  )
    .option("--provider <id>", "move the profile to a different provider")
    .action(async (id: string, opts: FieldOpts) => {
      const { projectRoot } = await detectProject(process.cwd());
      const fields = fieldsFromOpts(opts);
      if (Object.keys(fields).length === 0) {
        console.error(`${symbol.fail()} Pass at least one field to set.`);
        process.exit(1);
      }
      try {
        await setProfileFields(projectRoot, id, fields);
        console.log(`${symbol.ok()} Updated profile ${color.bold(id)}.`);
      } catch (err) {
        console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  cmd
    .command("duplicate <id> <newId>")
    .description("Copy a profile under a new id (e.g. claude -> claude-cheap).")
    .action(async (id: string, newId: string) => {
      const { projectRoot } = await detectProject(process.cwd());
      const { config } = await loadConfig(projectRoot);
      const src = config.profiles[id];
      if (!src) {
        console.error(`${symbol.fail()} No profile "${id}".`);
        process.exit(1);
      }
      try {
        await createProfile(projectRoot, newId, {
          provider: src.provider,
          label: newId,
          model: src.model ?? undefined,
          power: src.power ?? undefined,
          maxTokens: src.maxTokens ?? undefined,
          timeoutMs: src.timeoutMs ?? undefined,
        });
        console.log(`${symbol.ok()} Duplicated ${color.bold(id)} -> ${color.bold(newId)}.`);
      } catch (err) {
        console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  cmd
    .command("remove <id>")
    .description("Delete a profile (refuses if a role uses it, unless --force).")
    .option("--force", "delete even if roles still reference it")
    .action(async (id: string, opts: { force?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const { config } = await loadConfig(projectRoot);
      if (!config.profiles[id]) {
        console.error(`${symbol.fail()} No profile "${id}".`);
        process.exit(1);
      }
      const used = rolesUsingProfile(config, id);
      if (used.length > 0 && !opts.force) {
        console.error(
          `${symbol.fail()} "${id}" is used by ${used
            .map((u) => `${u.crewId}/${u.roleId}`)
            .join(", ")}. Reassign or pass --force.`,
        );
        process.exit(1);
      }
      try {
        await deleteProfile(projectRoot, id);
        console.log(`${symbol.ok()} Deleted profile ${color.bold(id)}.`);
      } catch (err) {
        console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  return cmd;
}
