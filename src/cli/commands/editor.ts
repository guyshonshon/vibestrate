import { Command } from "commander";
import { detectEditors, isSafeCommandName, openInEditor, validateEditorConfig } from "../../core/editor-service.js";
import { loadConfig } from "../../project/config-loader.js";
import { setConfigValue } from "../../setup/config-update-service.js";
import { buildProjectRoots, resolveSafePath } from "../../core/path-guard.js";
import { color, symbol } from "../ui/format.js";

export function buildEditorCommand(): Command {
  const cmd = new Command("editor").description(
    "Configure and test the local editor handoff used by the dashboard.",
  );

  cmd
    .command("detect")
    .description("Probe known editors (code, code-insiders, cursor) for availability.")
    .action(async () => {
      const candidates = await detectEditors();
      for (const c of candidates) {
        const dot = c.available ? color.green("●") : color.dim("○");
        console.log(
          `${dot} ${c.command.padEnd(16)} ${c.displayName} ${color.dim(c.description)}`,
        );
      }
      void symbol;
      const ready = candidates.filter((c) => c.available).map((c) => c.command);
      if (ready.length > 0) {
        console.log(
          `\n${color.dim(`Enable one with: vibestrate editor set ${ready[0]}`)}`,
        );
      }
    });

  cmd
    .command("set <command>")
    .description("Enable editor handoff and store the command (default args use --goto path:line:column).")
    .option("--args <args...>", "override the default args (use {file}/{line}/{column} placeholders)")
    .action(
      async (command: string, opts: { args?: string[] }) => {
        if (!isSafeCommandName(command)) {
          console.error(
            color.red(
              "Editor command must be a single token (a-z A-Z 0-9 _ -). No paths, no spaces.",
            ),
          );
          process.exit(2);
        }
        const cwd = process.cwd();
        await setConfigValue(cwd, "editor.command", command);
        await setConfigValue(cwd, "editor.enabled", "true");
        if (opts.args && opts.args.length > 0) {
          // Persist as YAML list using the dotted-path setter for each index.
          // setConfigValue accepts arrays via JSON; we build a JSON array.
          await setConfigValue(
            cwd,
            "editor.args",
            JSON.stringify(opts.args),
          );
        }
        console.log(
          `Editor enabled: ${color.cyan(command)}.`,
        );
      },
    );

  cmd
    .command("test [file]")
    .description("Open a file (default: README.md) using the configured editor command.")
    .option("--line <n>", "line number", (v) => parseInt(v, 10))
    .action(async (file: string | undefined, opts: { line?: number }) => {
      const cwd = process.cwd();
      const loaded = await loadConfig(cwd).catch(() => null);
      if (!loaded) {
        console.error(
          color.red('Project not initialised. Run "vibestrate init" first.'),
        );
        process.exit(2);
      }
      const validation = validateEditorConfig(loaded.config.editor);
      if (!validation.ok) {
        console.error(color.red(`Editor not ready: ${validation.reason}`));
        process.exit(2);
      }
      const target = file ?? "README.md";
      const resolved = await resolveSafePath(
        target,
        buildProjectRoots({ projectRoot: cwd }),
      );
      const r = await openInEditor({
        config: loaded.config.editor,
        resolved,
        line: opts.line ?? null,
      });
      if (r.ok) {
        console.log(
          `${symbol.ok()} Launched ${color.cyan(r.command)} on ${target}.`,
        );
      } else {
        console.error(
          color.red(`${symbol.fail()} Editor exited non-zero: ${r.errorMessage ?? "?"}`),
        );
        process.exit(1);
      }
    });

  return cmd;
}
