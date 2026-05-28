import fs from "node:fs/promises";
import { runFromSpec, runSpecSchema } from "./run-launcher.js";

/**
 * Headless run entry. The dashboard server spawns THIS (a core module) — not
 * the `vibestrate` CLI binary — with a path to a JSON run-spec file, so the web UI
 * never depends on the CLI command surface. Reads + validates the spec, deletes
 * the spec file, then drives the shared core run pipeline. Detached: it owns
 * its own process and outlives the request (and the dashboard) like a CLI run.
 *
 * stdout/stderr are typically ignored by the spawner; progress goes to stderr
 * for the rare case it's captured. Exit 0 = run reached a non-failed terminal
 * state, 1 = run failed/threw, 2 = bad invocation/spec.
 */
async function main(): Promise<void> {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error("run-entry: missing spec file argument.");
    process.exit(2);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(specPath, "utf8"));
  } catch (err) {
    console.error(
      `run-entry: could not read spec file: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(2);
  }

  // The spec file is a transient handoff artifact — remove it once read.
  await fs.rm(specPath, { force: true }).catch(() => {});

  const parsed = runSpecSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`run-entry: invalid spec — ${parsed.error.issues[0]?.message ?? "schema error"}`);
    process.exit(2);
  }

  const abort = new AbortController();
  const onSignal = (): void => abort.abort();
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const result = await runFromSpec(parsed.data, {
      abortSignal: abort.signal,
      onProgress: (m) => console.error(m),
    });
    process.exit(result.state.status === "failed" ? 1 : 0);
  } catch (err) {
    console.error(
      `run-entry: run failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

void main();
