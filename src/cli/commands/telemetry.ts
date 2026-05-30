import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { color, indent, symbol } from "../ui/format.js";

async function root(): Promise<string> {
  return (await detectProject(process.cwd())).projectRoot;
}

export function buildTelemetryCommand(): Command {
  const cmd = new Command("telemetry").description(
    "Opt-in OpenTelemetry export of a run's metrics to your own collector (off by default).",
  );

  cmd
    .command("trace <runId>")
    .description("Print the OTLP trace JSON for a run (no network — inspect before exporting).")
    .action(async (runId: string) => {
      const projectRoot = await root();
      const { MetricsStore } = await import("../../core/metrics-store.js");
      const { RunStateStore } = await import("../../core/state-machine.js");
      const { buildRunTraceOtlp } = await import("../../telemetry/otel-exporter.js");
      const metrics = await new MetricsStore(projectRoot, runId).read();
      if (!metrics) {
        console.error(`${symbol.fail()} No metrics for run "${runId}".`);
        process.exit(1);
      }
      const state = await new RunStateStore(projectRoot, runId).read().catch(() => null);
      const trace = buildRunTraceOtlp({ metrics, status: state?.status ?? null });
      process.stdout.write(`${JSON.stringify(trace, null, 2)}\n`);
      process.exit(0);
    });

  cmd
    .command("export <runId>")
    .description("Export a run's metrics as an OTLP trace to a collector (Langfuse, Tempo, Jaeger…).")
    .requiredOption("--endpoint <url>", "OTLP/HTTP base URL (e.g. http://localhost:4318)")
    .option("--auth <envRef>", "env reference for a bearer token, e.g. env:LANGFUSE_TOKEN")
    .action(async (runId: string, opts: { endpoint: string; auth?: string }) => {
      const projectRoot = await root();
      const { exportRunToOtlp } = await import("../../telemetry/otel-exporter.js");
      const r = await exportRunToOtlp({
        projectRoot,
        runId,
        endpoint: opts.endpoint,
        authToken: opts.auth,
      });
      if (!r.ok) {
        console.error(`${symbol.fail()} ${r.reason}`);
        process.exit(1);
      }
      console.log(
        `${symbol.ok()} Exported run ${color.bold(runId)} (${r.spanCount} spans) to ${opts.endpoint} (HTTP ${r.status}).`,
      );
      console.log(indent(color.dim("Nothing else is sent — this was an explicit, one-off export.")));
      process.exit(0);
    });

  return cmd;
}
