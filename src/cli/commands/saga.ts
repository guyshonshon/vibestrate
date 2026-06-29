import path from "node:path";
import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { color, indent, symbol } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";

async function svc() {
  const detected = await detectProject(process.cwd());
  return new RoadmapService(detected.projectRoot);
}

async function cmdCreate(
  title: string,
  opts: { description?: string; json?: boolean },
): Promise<number> {
  try {
    const s = await svc();
    await s.init();
    const task = await s.addTask({ title, description: opts.description, kind: "saga" });
    if (opts.json) { console.log(JSON.stringify(task, null, 2)); return 0; }
    console.log(`${symbol.ok()} Saga created.`);
    console.log(indent(`id: ${color.bold(task.id)}`));
    console.log(indent(`title: ${task.title}`));
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdAddStep(
  taskId: string,
  text: string,
  opts: { objective?: string; acceptance?: string; files?: string; json?: boolean },
): Promise<number> {
  try {
    const s = await svc();
    const { item } = await s.addChecklistItem(taskId, text, {
      objective: opts.objective,
      acceptanceCheck: opts.acceptance,
      fileHints: opts.files ? opts.files.split(",").map((f) => f.trim()).filter(Boolean) : [],
    });
    if (opts.json) { console.log(JSON.stringify(item, null, 2)); return 0; }
    console.log(`${symbol.ok()} Step added to ${color.bold(taskId)}.`);
    console.log(indent(`id: ${item.id}`));
    console.log(indent(`text: ${item.text}`));
    if (item.objective) console.log(indent(`objective: ${item.objective}`));
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdList(opts: { json?: boolean }): Promise<number> {
  try {
    const s = await svc();
    const sagas = (await s.listTasks()).filter((t) => t.kind === "saga");
    if (opts.json) { console.log(JSON.stringify(sagas, null, 2)); return 0; }
    if (sagas.length === 0) {
      console.log("No sagas yet. Create one with `vibe saga create <title>`.");
      return 0;
    }
    for (const t of sagas) {
      const done = t.checklist.filter((c) => c.status === "done").length;
      console.log(`${color.bold(t.id)}  ${t.title}  [${done}/${t.checklist.length} steps]`);
    }
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdShow(id: string, opts: { json?: boolean }): Promise<number> {
  try {
    const s = await svc();
    const task = await s.getTask(id);
    if (!task) { console.error(`${symbol.fail()} Saga "${id}" not found.`); return 1; }
    if (opts.json) { console.log(JSON.stringify(task, null, 2)); return 0; }
    console.log(`${color.bold(task.title)}  (${task.kind})`);
    if (task.description) console.log(indent(task.description));
    console.log(indent(`steps: ${task.checklist.length}`));
    task.checklist.forEach((c, i) => {
      console.log(indent(`${i + 1}. [${c.status}] ${c.text}`));
      if (c.objective) console.log(indent(`     objective: ${c.objective}`));
      if (c.acceptanceCheck) console.log(indent(`     accept: ${c.acceptanceCheck}`));
      if (c.fileHints.length) console.log(indent(`     files: ${c.fileHints.join(", ")}`));
    });
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
}

export function buildSagaCommand(): Command {
  const cmd = new Command("saga").description(
    "Author multi-step Saga tasks (kind=saga): one feature, coordinated steps.",
  );
  cmd
    .command("create <title>")
    .description("Create a new Saga task.")
    .option("-d, --description <text>", "longer description")
    .option("--json", "emit JSON")
    .action(async (title: string, opts) => process.exit(await cmdCreate(title, opts)));
  cmd
    .command("add-step <taskId> <text>")
    .description("Add a step to a Saga.")
    .option("--objective <text>", "the step's scoped goal")
    .option("--acceptance <text>", "done-when check for the step")
    .option("--files <list>", "comma-separated file hints")
    .option("--json", "emit JSON")
    .action(async (taskId: string, text: string, opts) =>
      process.exit(await cmdAddStep(taskId, text, opts)),
    );
  cmd
    .command("list")
    .description("List Saga tasks.")
    .option("--json", "emit JSON")
    .action(async (opts) => process.exit(await cmdList(opts)));
  cmd
    .command("show <id>")
    .description("Show a Saga and its steps.")
    .option("--json", "emit JSON")
    .action(async (id: string, opts) => process.exit(await cmdShow(id, opts)));
  return cmd;
}
