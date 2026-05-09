import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isAmacoError } from "../../utils/errors.js";

async function svc() {
  const detected = await detectProject(process.cwd());
  return new RoadmapService(detected.projectRoot);
}

async function cmdAdd(
  title: string,
  opts: { description?: string; priority?: string; json?: boolean },
): Promise<number> {
  try {
    const s = await svc();
    await s.init();
    const item = await s.addRoadmapItem({
      title,
      description: opts.description,
      priority:
        opts.priority === "low" || opts.priority === "high"
          ? opts.priority
          : "medium",
    });
    if (opts.json) {
      console.log(JSON.stringify(item, null, 2));
      return 0;
    }
    console.log(`${symbol.ok()} Roadmap item added.`);
    console.log(indent(`id: ${color.bold(item.id)}`));
    console.log(indent(`title: ${item.title}`));
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdList(opts: { json?: boolean }): Promise<number> {
  const s = await svc();
  await s.init();
  const items = await s.listRoadmapItems();
  if (opts.json) {
    console.log(JSON.stringify(items, null, 2));
    return 0;
  }
  if (items.length === 0) {
    console.log("No roadmap items yet.");
    console.log(
      `  ${symbol.arrow()} Add one: ${color.bold("amaco roadmap add \"Build onboarding\"")}`,
    );
    return 0;
  }
  console.log(header("Roadmap"));
  console.log("");
  for (const i of items) {
    const status =
      i.status === "done"
        ? color.green(i.status)
        : i.status === "blocked"
          ? color.yellow(i.status)
          : color.dim(i.status);
    console.log(`${color.bold(i.title)} ${color.dim(`(${i.id})`)}`);
    console.log(indent(`${status} · priority: ${i.priority} · linked tasks: ${i.linkedTaskIds.length}`));
    if (i.description) console.log(indent(color.dim(i.description)));
    console.log("");
  }
  return 0;
}

async function cmdShow(id: string, opts: { json?: boolean }): Promise<number> {
  const s = await svc();
  const item = await s.getRoadmapItem(id);
  if (!item) {
    console.error(`${symbol.fail()} Roadmap item "${id}" not found.`);
    return 1;
  }
  if (opts.json) {
    console.log(JSON.stringify(item, null, 2));
    return 0;
  }
  console.log(header(item.title));
  console.log(indent(`id: ${item.id}`));
  console.log(indent(`status: ${item.status} · priority: ${item.priority}`));
  if (item.description) {
    console.log("");
    console.log(item.description);
  }
  if (item.linkedTaskIds.length > 0) {
    console.log("");
    console.log(`Linked tasks: ${item.linkedTaskIds.join(", ")}`);
  }
  return 0;
}

async function cmdUpdate(
  id: string,
  opts: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
  },
): Promise<number> {
  const s = await svc();
  try {
    const updated = await s.updateRoadmapItem(id, {
      title: opts.title,
      description: opts.description,
      status: opts.status as never,
      priority: opts.priority as never,
    });
    console.log(`${symbol.ok()} Updated ${color.bold(updated.id)}.`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdArchive(id: string): Promise<number> {
  const s = await svc();
  try {
    await s.archiveRoadmapItem(id);
    console.log(`${symbol.ok()} Archived ${color.bold(id)}.`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdInit(): Promise<number> {
  const s = await svc();
  await s.init();
  console.log(`${symbol.ok()} Roadmap directory ready under ${color.bold(".amaco/roadmap")}.`);
  return 0;
}

export function buildRoadmapCommand(): Command {
  const cmd = new Command("roadmap").description(
    "Manage local roadmap items (.amaco/roadmap/roadmap.json).",
  );

  cmd
    .command("init")
    .description("Create the .amaco/roadmap/ scaffold if missing.")
    .action(async () => {
      const code = await cmdInit();
      process.exit(code);
    });

  cmd
    .command("add <title>")
    .description("Add a roadmap item.")
    .option("-d, --description <text>", "longer description")
    .option("-p, --priority <level>", "low | medium | high", "medium")
    .option("--json", "emit JSON")
    .action(async (title: string, opts) => {
      const code = await cmdAdd(title, opts);
      process.exit(code);
    });

  cmd
    .command("list")
    .description("List roadmap items.")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const code = await cmdList(opts);
      process.exit(code);
    });

  cmd
    .command("show <id>")
    .description("Show a single roadmap item.")
    .option("--json", "emit JSON")
    .action(async (id: string, opts) => {
      const code = await cmdShow(id, opts);
      process.exit(code);
    });

  cmd
    .command("update <id>")
    .description("Update a roadmap item.")
    .option("--title <text>")
    .option("--description <text>")
    .option("--status <s>")
    .option("--priority <p>")
    .action(async (id: string, opts) => {
      const code = await cmdUpdate(id, opts);
      process.exit(code);
    });

  cmd
    .command("archive <id>")
    .description("Archive a roadmap item (keeps history).")
    .action(async (id: string) => {
      const code = await cmdArchive(id);
      process.exit(code);
    });

  return cmd;
}
