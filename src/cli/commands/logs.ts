import { Command } from "commander";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import { detectProject } from "../../project/project-detector.js";
import {
  listStreams,
  readStream,
  streamFilePath,
} from "../../core/provider-stream-store.js";
import { color, header, indent, symbol } from "../ui/format.js";

async function cmdLogs(
  runId: string,
  opts: { follow?: boolean; stream?: string },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const streams = await listStreams(detected.projectRoot, runId);
  if (streams.length === 0) {
    console.error(
      `${symbol.warn()} No provider output recorded for ${color.bold(runId)} yet.`,
    );
    console.error(
      indent(
        color.dim(
          `Looked under .vibestrate/runs/${runId}/streams/. Streams appear once the orchestrator invokes a provider.`,
        ),
      ),
    );
    return 1;
  }

  // Pick the requested stream, or the newest one if none specified.
  const chosen =
    (opts.stream
      ? streams.find((s) => s.promptName === opts.stream)
      : undefined) ?? streams[0]!;

  if (!opts.follow) {
    const lines = await readStream(
      detected.projectRoot,
      runId,
      chosen.promptName,
    );
    console.log(header(`Provider stream: ${chosen.promptName}`));
    if (lines.length === 0) {
      console.log(color.dim("(empty)"));
      return 0;
    }
    for (const line of lines) {
      const dst = line.stream === "stderr" ? process.stderr : process.stdout;
      dst.write(line.chunk);
    }
    return 0;
  }

  // Follow mode: tail the ndjson file like `tail -f`, decoding each
  // line and writing the chunk through to stdout/stderr.
  const file = streamFilePath(
    detected.projectRoot,
    runId,
    chosen.promptName,
  );
  console.error(
    `${symbol.bullet()} ${color.dim(`tailing ${file} (Ctrl+C to stop)`)}`,
  );

  let position = 0;
  const readNew = async () => {
    try {
      const stat = await fsp.stat(file);
      if (stat.size < position) position = 0;
      if (stat.size === position) return;
      const fd = await fsp.open(file, "r");
      try {
        const buf = Buffer.alloc(stat.size - position);
        await fd.read(buf, 0, buf.length, position);
        position = stat.size;
        const text = buf.toString("utf8");
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as {
              stream: "stdout" | "stderr";
              chunk: string;
            };
            const dst =
              parsed.stream === "stderr" ? process.stderr : process.stdout;
            dst.write(parsed.chunk);
          } catch {
            process.stdout.write(line + "\n");
          }
        }
      } finally {
        await fd.close();
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      console.error(
        `${symbol.fail()} tail error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  await readNew();
  // fs.watch is best-effort across filesystems; fall back to polling.
  let watcher: fs.FSWatcher | null = null;
  try {
    watcher = fs.watch(file, { persistent: true }, () => void readNew());
  } catch {
    /* polling only */
  }
  const interval = setInterval(readNew, 500);
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      clearInterval(interval);
      watcher?.close();
      resolve();
    });
  });
  return 0;
}

export function buildLogsCommand(): Command {
  const cmd = new Command("logs")
    .description(
      "Show the captured provider stdout/stderr stream for a run (the model's live CLI output).",
    )
    .argument("<runId>", "Run id (see `vibestrate status`)")
    .option(
      "--follow",
      "tail the stream live (like `tail -f`); Ctrl+C to stop",
    )
    .option(
      "--stream <promptName>",
      "specific agent stream to read (default: newest)",
    )
    .action(async (runId: string, opts) => {
      const code = await cmdLogs(runId, opts);
      process.exit(code);
    });
  return cmd;
}
