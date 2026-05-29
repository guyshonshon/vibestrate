import path from "node:path";
import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { ProposalService } from "../../roadmap/proposal-service.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { getCrew, rolesFillingSeat } from "../../crews/crew-registry.js";
import { isVibestrateError } from "../../utils/errors.js";

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
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
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
      `  ${symbol.arrow()} Add one: ${color.bold("vibe roadmap add \"Build onboarding\"")}`,
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
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
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
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdInit(): Promise<number> {
  const s = await svc();
  await s.init();
  console.log(`${symbol.ok()} Roadmap directory ready under ${color.bold(".vibestrate/roadmap")}.`);
  return 0;
}

export function buildRoadmapCommand(): Command {
  const cmd = new Command("roadmap").description(
    "Manage local roadmap items (.vibestrate/roadmap/roadmap.json).",
  );

  cmd
    .command("init")
    .description("Create the .vibestrate/roadmap/ scaffold if missing.")
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

  // ─── proposal sub-tree ────────────────────────────────────────────────────

  cmd
    .command("proposals")
    .description("List roadmap proposals stored in .vibestrate/roadmap/proposals/.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const code = await cmdProposalsList(opts);
      process.exit(code);
    });

  const proposalCmd = cmd
    .command("proposal")
    .description("Inspect, parse, and accept individual proposals.");

  proposalCmd
    .command("show <id>")
    .description("Print a proposal's raw Markdown body.")
    .action(async (id: string) => {
      const code = await cmdProposalShow(id);
      process.exit(code);
    });

  proposalCmd
    .command("parse <id>")
    .description("Parse a proposal and print the typed preview.")
    .option("--json", "emit JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      const code = await cmdProposalParse(id, opts);
      process.exit(code);
    });

  cmd
    .command("accept <id>")
    .description(
      "Accept a parsed proposal (creates roadmap items + tasks atomically).",
    )
    .option("--dry-run", "preview without writing")
    .option(
      "--allow-unresolved-dependencies",
      "skip DEPENDS_ON entries that point at unknown task titles instead of failing",
    )
    .option("--json", "emit JSON")
    .action(
      async (
        id: string,
        opts: {
          dryRun?: boolean;
          allowUnresolvedDependencies?: boolean;
          json?: boolean;
        },
      ) => {
        const code = await cmdProposalAccept(id, opts);
        process.exit(code);
      },
    );

  cmd
    .command("plan <goal...>")
    .description(
      "Run the configured local planner provider on a broad goal and save the output as a proposal draft.",
    )
    .option("--id <proposalId>", "explicit proposal id; default is timestamp + slug")
    .option("--provider <providerId>", "override the provider id (default: planner agent's provider)")
    .action(async (goalParts: string[], opts) => {
      const code = await cmdRoadmapPlan(goalParts.join(" ").trim(), opts);
      process.exit(code);
    });

  return cmd;
}

// ─── proposal command bodies ───────────────────────────────────────────────

async function cmdProposalsList(opts: { json?: boolean }): Promise<number> {
  const detected = await detectProject(process.cwd());
  const ps = new ProposalService(detected.projectRoot);
  const list = await ps.listProposals();
  if (opts.json) {
    console.log(JSON.stringify(list, null, 2));
    return 0;
  }
  if (list.length === 0) {
    console.log("No proposals yet.");
    console.log(
      `  ${symbol.arrow()} Create one: ${color.bold('vibe roadmap plan "<broad goal>"')}`,
    );
    return 0;
  }
  console.log(header("Proposals"));
  console.log("");
  for (const p of list) {
    const status = p.accepted ? color.green("accepted") : color.dim("draft");
    console.log(`${color.bold(p.id)}  ${status}`);
    console.log(indent(color.dim(`modified: ${p.modifiedAt}`)));
    if (p.acceptedAt) console.log(indent(color.dim(`accepted: ${p.acceptedAt}`)));
    console.log("");
  }
  return 0;
}

async function cmdProposalShow(id: string): Promise<number> {
  const detected = await detectProject(process.cwd());
  const ps = new ProposalService(detected.projectRoot);
  try {
    const text = await ps.getProposalText(id);
    if (text === null) {
      console.error(`${symbol.fail()} Proposal "${id}" not found.`);
      return 1;
    }
    console.log(text);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdProposalParse(
  id: string,
  opts: { json?: boolean },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const ps = new ProposalService(detected.projectRoot);
  try {
    const parsed = await ps.parseProposalById(id);
    if (!parsed) {
      console.error(`${symbol.fail()} Proposal "${id}" not found.`);
      return 1;
    }
    if (opts.json) {
      // rawText is bulky; drop it.
      const { rawText: _omit, ...rest } = parsed;
      void _omit;
      console.log(JSON.stringify(rest, null, 2));
      return 0;
    }
    console.log(header(`Proposal ${id}`));
    console.log(
      indent(
        `roadmap items: ${parsed.roadmapItems.length} · tasks: ${parsed.tasks.length} · dependency edges: ${parsed.dependencyEdges.length}`,
      ),
    );
    if (parsed.errors.length > 0) {
      console.log("");
      console.log(`${symbol.fail()} Errors:`);
      for (const e of parsed.errors) console.log(indent(`- ${e.message}`));
    }
    if (parsed.warnings.length > 0) {
      console.log("");
      console.log(`${symbol.warn()} Warnings:`);
      for (const w of parsed.warnings) console.log(indent(`- ${w.message}`));
    }
    if (parsed.needsClarification) {
      console.log("");
      console.log(`${symbol.warn()} Planner asked: ${parsed.needsClarification}`);
    }
    return parsed.errors.length > 0 ? 1 : 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdProposalAccept(
  id: string,
  opts: {
    dryRun?: boolean;
    allowUnresolvedDependencies?: boolean;
    json?: boolean;
  },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const ps = new ProposalService(detected.projectRoot);
  try {
    if (opts.dryRun) {
      const preview = await ps.dryRun({
        proposalId: id,
        allowUnresolvedDependencies: opts.allowUnresolvedDependencies,
      });
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              willCreate: preview.willCreate,
              warnings: preview.warnings,
              errors: preview.errors,
              cycle: preview.cycle,
              alreadyAccepted: preview.alreadyAccepted,
            },
            null,
            2,
          ),
        );
        return preview.errors.length > 0 ? 1 : 0;
      }
      console.log(header(`Dry-run accept: ${id}`));
      if (preview.alreadyAccepted) {
        console.log(`${symbol.warn()} Already accepted previously.`);
      }
      console.log("");
      console.log("Would create:");
      for (const r of preview.willCreate.roadmapItems) {
        console.log(indent(`+ roadmap: ${color.bold(r.title)} (${r.priority})`));
      }
      for (const t of preview.willCreate.tasks) {
        const deps = t.dependencies.length > 0 ? ` ← ${t.dependencies.join(", ")}` : "";
        console.log(
          indent(
            `+ task: ${color.bold(t.title)} (${t.priority}, risk ${t.riskLevel})${deps}`,
          ),
        );
      }
      console.log("");
      console.log(
        `${preview.willCreate.dependencyEdges.length} dependency edge(s) would be linked.`,
      );
      if (preview.warnings.length > 0) {
        console.log("");
        for (const w of preview.warnings) console.log(`${symbol.warn()} ${w.message}`);
      }
      if (preview.errors.length > 0) {
        console.log("");
        for (const e of preview.errors) console.log(`${symbol.fail()} ${e.message}`);
        console.log("");
        console.log(color.dim("No files were written."));
        return 1;
      }
      console.log("");
      console.log(color.dim("No files were written. Re-run without --dry-run to apply."));
      return 0;
    }

    const result = await ps.accept({
      proposalId: id,
      options: {
        allowUnresolvedDependencies: opts.allowUnresolvedDependencies,
      },
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    console.log(`${symbol.ok()} Accepted proposal ${color.bold(id)}.`);
    console.log(
      indent(
        `${result.createdRoadmapItemIds.length} roadmap item(s), ${result.createdTaskIds.length} task(s), ${result.dependencyCount} dependency edge(s).`,
      ),
    );
    console.log(
      indent(
        `audit: ${path.relative(process.cwd(), result.auditFilePath)}`,
      ),
    );
    if (result.warnings.length > 0) {
      console.log("");
      for (const w of result.warnings) console.log(`${symbol.warn()} ${w.message}`);
    }
    console.log("");
    console.log(`${symbol.arrow()} ${color.bold("vibe tasks list")}`);
    console.log(`${symbol.arrow()} ${color.bold("vibe ui")} → board`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdRoadmapPlan(
  goal: string,
  opts: { id?: string; provider?: string },
): Promise<number> {
  if (!goal) {
    console.error(`${symbol.fail()} A goal is required.`);
    console.error(
      `  ${symbol.arrow()} ${color.bold('vibe roadmap plan "Build first public beta experience"')}`,
    );
    return 1;
  }
  const detected = await detectProject(process.cwd());
  // Lazily import to avoid pulling provider-runner into the CLI module graph
  // when the user only uses non-plan commands.
  const [{ loadConfig, loadRolePrompt }, { runProvider }, { fileURLToPath }, fs] =
    await Promise.all([
      import("../../project/config-loader.js"),
      import("../../providers/provider-runner.js"),
      import("node:url"),
      import("node:fs/promises"),
    ]);

  let loaded;
  try {
    loaded = await loadConfig(detected.projectRoot);
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("vibe init")} first.`,
    );
    return 1;
  }

  // Pick a provider for the ad-hoc roadmap planning call: the default crew's
  // role that fills the "planner" seat (via its Profile), else any profile.
  const { crew } = getCrew(loaded.config);
  const plannerRole =
    rolesFillingSeat(crew, "planner")[0]?.role ??
    Object.values(crew.roles)[0];
  const plannerProvider = plannerRole
    ? loaded.config.profiles[plannerRole.profile]?.provider
    : Object.values(loaded.config.profiles)[0]?.provider;
  if (!plannerProvider) {
    console.error(
      `${symbol.fail()} No planner role/provider configured. Run ${color.bold("vibe init --force")} or ${color.bold("vibe provider setup")}.`,
    );
    return 1;
  }
  const providerId = opts.provider ?? plannerProvider;
  if (!loaded.config.providers[providerId]) {
    console.error(
      `${symbol.fail()} Provider "${providerId}" is not configured.`,
    );
    return 1;
  }

  // Build the planner prompt by appending the user's goal to the
  // roadmap-planner default prompt. This is intentionally a small wrapper —
  // the agent does the heavy lifting from the canonical prompt.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", "..", "..", "src", "agents", "default-prompts", "roadmap-planner.md"),
    path.resolve(here, "..", "..", "src", "agents", "default-prompts", "roadmap-planner.md"),
    path.resolve(here, "default-prompts", "roadmap-planner.md"),
  ];
  let template = "";
  for (const c of candidates) {
    try {
      template = await fs.readFile(c, "utf8");
      break;
    } catch {
      // try next
    }
  }
  if (!template) {
    console.error(
      `${symbol.fail()} Could not locate the roadmap-planner prompt template.`,
    );
    return 1;
  }
  const prompt = `${template}\n\n# Broad goal\n\n${goal}\n`;

  console.log(
    `${symbol.bullet()} Planning a roadmap for: ${color.bold(goal)}`,
  );
  console.log(
    `  ${color.dim(`provider: ${providerId} (${loaded.config.providers[providerId]!.command})`)}`,
  );
  let result;
  try {
    result = await runProvider(loaded.config.providers, {
      providerId,
      prompt,
      cwd: detected.projectRoot,
    });
  } catch (err) {
    console.error(
      `${symbol.fail()} Planner failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    console.error(
      `  ${symbol.arrow()} Make sure ${color.bold(loaded.config.providers[providerId]!.command)} is installed (\`vibe provider detect\`).`,
    );
    return 1;
  }

  if (result.exitCode !== 0) {
    console.error(
      `${symbol.fail()} Planner exited with code ${result.exitCode}.`,
    );
    if (result.stderr.trim()) console.error(indent(result.stderr.trim()));
    return 1;
  }

  // Save raw output as a proposal.
  const ps = new ProposalService(detected.projectRoot);
  await ps.init();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  // slug is best-effort; the proposal id is path-safe.
  const slug = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const id = (opts.id ?? `${ts}-${slug}`).replace(/^-+|-+$/g, "");
  try {
    const target = await ps.writeProposalText(id, result.stdout);
    console.log(`${symbol.ok()} Saved proposal ${color.bold(id)}.`);
    console.log(indent(`path: ${path.relative(process.cwd(), target)}`));
    console.log("");
    console.log(`${symbol.arrow()} Review: ${color.bold(`vibe roadmap proposal show ${id}`)}`);
    console.log(`${symbol.arrow()} Preview: ${color.bold(`vibe roadmap accept ${id} --dry-run`)}`);
    console.log(`${symbol.arrow()} Accept:  ${color.bold(`vibe roadmap accept ${id}`)}`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} Could not save proposal: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
}
