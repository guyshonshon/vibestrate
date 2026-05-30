import { Command } from "commander";
import { runSkillsList } from "./list.js";
import { runSkillsShow } from "./show.js";
import { runSkillsAssign, runSkillsUnassign } from "./assign.js";

export function buildSkillsCommand(): Command {
  const cmd = new Command("skills").description(
    "List, inspect, and assign skills (.vibestrate/skills and .claude/skills).",
  );

  cmd
    .command("list")
    .description("Show every discovered skill and which agents use it.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const code = await runSkillsList({ json: opts.json });
      process.exit(code);
    });

  cmd
    .command("show <name>")
    .description("Print a skill's full SKILL.md body.")
    .action(async (name: string) => {
      const code = await runSkillsShow(name);
      process.exit(code);
    });

  cmd
    .command("assign <agent> <skill>")
    .description("Attach a skill to an agent (writes to .vibestrate/project.yml).")
    .action(async (agent: string, skill: string) => {
      const code = await runSkillsAssign(agent, skill);
      process.exit(code);
    });

  cmd
    .command("unassign <agent> <skill>")
    .description("Remove a skill from an agent.")
    .action(async (agent: string, skill: string) => {
      const code = await runSkillsUnassign(agent, skill);
      process.exit(code);
    });

  cmd
    .command("fetch <url>")
    .description(
      "Fetch a skill markdown from an http(s) URL into .vibestrate/skills/ (guarded + secret-redacted).",
    )
    .option("--name <name>", "skill filename (default: derived from the URL)")
    .option("--assess", "read-only AI overview: helpful / already-present / conflicting")
    .action(async (url: string, opts: { name?: string; assess?: boolean }) => {
      const { runSkillsFetch } = await import("./fetch.js");
      process.exit(await runSkillsFetch(url, opts));
    });

  return cmd;
}
