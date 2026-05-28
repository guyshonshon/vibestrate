import { Command } from "commander";
import { color, symbol } from "../ui/format.js";
import { TerminalSessionStore } from "../../terminal/terminal-store.js";
import { loadConfig } from "../../project/config-loader.js";
import { loadNodePtyDriver } from "../../terminal/terminal-driver.js";
import { TerminalService } from "../../terminal/terminal-service.js";
import { TerminalError } from "../../terminal/terminal-types.js";

export function buildTerminalCommand(): Command {
  const cmd = new Command("terminal").description(
    "Inspect and close dashboard terminal sessions. Sessions are user-launched from the dashboard; this CLI never spawns one.",
  );

  cmd
    .command("list")
    .description("List every terminal session ever opened in this project (live + closed).")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const store = new TerminalSessionStore(process.cwd());
      const all = await store.readAll();
      if (opts.json) {
        console.log(JSON.stringify({ sessions: all }, null, 2));
        return;
      }
      if (all.length === 0) {
        console.log(color.dim("No terminal sessions recorded."));
        return;
      }
      for (const s of all) {
        const stateTag = s.closedAt
          ? color.dim(`closed @ ${s.closedAt}`)
          : color.green("live");
        console.log(
          `${color.bold(s.id)}  ${stateTag}  ${color.dim(s.runId)}  ${color.dim(s.shell)}  ${color.dim(s.cwd)}`,
        );
      }
    });

  cmd
    .command("close <sessionId>")
    .description(
      "Mark a terminal session as closed. Only affects live sessions in the running dashboard process; closed sessions are already terminal.",
    )
    .action(async (sessionId: string) => {
      // Even from the CLI, we don't have a live driver to attach to (those
      // live in the dashboard server process). The best we can do without
      // an IPC channel is mark the persisted record closed if it isn't
      // already.
      try {
        await loadConfig(process.cwd());
      } catch {
        console.error(color.red("Project not initialised. Run `vibestrate init`."));
        process.exit(2);
      }
      const driver = await loadNodePtyDriver();
      const service = new TerminalService(process.cwd(), driver);
      try {
        const session = await service.close(sessionId);
        console.log(
          `${symbol.ok()} ${color.bold(session.id)} closed${session.closedAt ? ` @ ${session.closedAt}` : ""}.`,
        );
      } catch (err) {
        if (err instanceof TerminalError) {
          console.error(color.red(`${symbol.fail()} ${err.message}`));
          process.exit(err.statusCode === 404 ? 2 : 1);
        }
        throw err;
      }
    });

  return cmd;
}
