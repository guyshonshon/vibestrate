import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { LedgerStore, renderLedgerBrief } from "../../core/project-ledger.js";
import { color } from "../ui/format.js";

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
  return cmd;
}
