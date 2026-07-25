import { Command } from "commander";
import { z } from "zod";
import { detectProject } from "../../project/project-detector.js";
import {
  LedgerStore,
  renderLedgerBrief,
  appendManualLedgerEntry,
} from "../../core/context/project-ledger.js";
import { color, indent, symbol } from "../ui/format.js";

/**
 * `vibe ledger` - the project continuity brief: a deterministic "here's
 * where the project stands" assembled from the append-only ledger - recently
 * shipped, open intents, follow-ups, mentions, decisions. The thing a new
 * session reads instead of re-deriving the project state from scratch.
 */
export function buildLedgerCommand(): Command {
  const cmd = new Command("ledger");
  cmd
    .description("Show the project continuity brief (what shipped, what's open).")
    .option("--json", "emit the structured ledger state as JSON")
    .option("--limit <n>", "max entries per section (default 5)", (v) => parseInt(v, 10))
    .action(async (opts: { json?: boolean; limit?: number }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const store = new LedgerStore(projectRoot);
      const state = await store.state();
      if (opts.json) {
        console.log(JSON.stringify(state, null, 2));
        return;
      }
      const brief = renderLedgerBrief(state, { limit: opts.limit });
      // Light heading colorization for the terminal.
      console.log(
        brief
          .split("\n")
          .map((l) => (l.startsWith("## ") ? color.bold(l.slice(3)) : l))
          .join("\n"),
      );
    });

  cmd
    .command("add")
    .description(
      "Hand-add a ledger entry - the same write path the dashboard's " +
        "\"Add entry\" form uses.",
    )
    .requiredOption(
      "--kind <kind>",
      "shipped | intent | decision | mention | residual",
    )
    .requiredOption("--title <text>", "entry title (max 300 chars)")
    .option("--detail <text>", "optional longer detail (max 4000 chars)")
    .option("--tags <list>", "comma-separated tags")
    .option("--status <status>", "open | shipped | abandoned")
    .option("--json", "emit the created entry as JSON")
    .action(async (opts: {
      kind: string;
      title: string;
      detail?: string;
      tags?: string;
      status?: string;
      json?: boolean;
    }) => {
      const code = await cmdAdd(opts);
      process.exit(code);
    });

  return cmd;
}

async function cmdAdd(opts: {
  kind: string;
  title: string;
  detail?: string;
  tags?: string;
  status?: string;
  json?: boolean;
}): Promise<number> {
  try {
    const { projectRoot } = await detectProject(process.cwd());
    const tags = opts.tags
      ? opts.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;
    const entry = await appendManualLedgerEntry(
      projectRoot,
      { kind: opts.kind, title: opts.title, detail: opts.detail, status: opts.status, tags },
      new Date().toISOString(),
    );
    if (opts.json) {
      console.log(JSON.stringify(entry, null, 2));
      return 0;
    }
    console.log(`${symbol.ok()} Ledger entry added.`);
    console.log(indent(`id: ${color.bold(entry.id)}`));
    console.log(indent(`kind: ${entry.kind}`));
    console.log(indent(`title: ${entry.title}`));
    return 0;
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? (err.issues[0]?.message ?? "Invalid ledger entry.")
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`${symbol.fail()} ${message}`);
    return 1;
  }
}
