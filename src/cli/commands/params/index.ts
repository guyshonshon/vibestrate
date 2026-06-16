import { Command } from "commander";
import { detectProject } from "../../../project/project-detector.js";
import { loadConfig } from "../../../project/config-loader.js";
import { findFlowById } from "../../../flows/catalog/flow-discovery.js";
import type { FlowParam } from "../../../flows/schemas/flow-schema.js";
import { confirm } from "@inquirer/prompts";
import {
  ParamStore,
  ParamWriteError,
  buildParamSetRequests,
  paramKeyFor,
  secretEnvVarName,
} from "../../../project/project-params.js";
import { generateParamSuggestion } from "../../../project/params-generate.js";
import { nowIso } from "../../../utils/time.js";
import { color, header, symbol, isInteractiveTTY } from "../../ui/format.js";

/** Parse `key=value` (split on the first `=`). */
function parseAssignment(raw: string): { key: string; value: string } {
  const eq = raw.indexOf("=");
  if (eq <= 0) {
    throw new Error(`Expected <key>=<value> (got "${raw}").`);
  }
  return { key: raw.slice(0, eq).trim(), value: raw.slice(eq + 1) };
}

/** How a stored value is shown: secrets surface their env-ref, never resolved. */
function displayValue(entry: { value: string; secret: boolean }): string {
  if (entry.secret) {
    const name = secretEnvVarName(entry.value);
    return color.dim(`[secret -> ${name ? `env:${name}` : entry.value}]`);
  }
  return entry.value;
}

export function buildParamsCommand(): Command {
  const cmd = new Command("params").description(
    "Durable project parameters: typed param answers persisted + reused across runs.",
  );

  cmd
    .command("list")
    .description("List every stored param answer (secrets shown as env refs).")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const profile = await new ParamStore(projectRoot).read();
      const entries = Object.entries(profile.values).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      if (opts.json) {
        console.log(JSON.stringify(profile, null, 2));
        return;
      }
      if (entries.length === 0) {
        console.log(
          "No project parameters yet. Fill one: vibe params set --flow <id> <param>=<value>.",
        );
        return;
      }
      console.log(header(`Project parameters (${entries.length})`));
      console.log("");
      for (const [key, entry] of entries) {
        console.log(
          `${color.bold(key)} = ${displayValue(entry)} ${color.dim(`(${entry.setBy})`)}`,
        );
      }
    });

  cmd
    .command("get <key>")
    .description("Print one stored value (secrets shown as env refs).")
    .action(async (key: string) => {
      const { projectRoot } = await detectProject(process.cwd());
      const profile = await new ParamStore(projectRoot).read();
      const entry = profile.values[key];
      if (!entry) {
        console.error(`${symbol.fail()} No stored value for "${key}".`);
        process.exit(1);
      }
      console.log(entry.secret ? displayValue(entry) : entry.value);
    });

  cmd
    .command("set <assignments...>")
    .description(
      "Set one or more values: `vibe params set --flow <id> name=Acme niche=SaaS`. With --flow, keys are flow params (type-checked, secret-aware). Without it, keys are raw param keys (bare = project-global).",
    )
    .option(
      "--flow <id>",
      "interpret keys as the flow's declared params (recommended)",
    )
    .action(async (assignments: string[], opts: { flow?: string }) => {
      const { projectRoot } = await detectProject(process.cwd());
      let pairs: { key: string; value: string }[];
      try {
        pairs = assignments.map(parseAssignment);
      } catch (err) {
        console.error(`${symbol.fail()} ${(err as Error).message}`);
        process.exit(1);
        return;
      }

      let defs: Record<string, FlowParam> | null = null;
      if (opts.flow) {
        const discovered = await findFlowById(projectRoot, opts.flow);
        if (!discovered) {
          console.error(`${symbol.fail()} No flow "${opts.flow}".`);
          process.exit(1);
          return;
        }
        defs = discovered.definition.params ?? {};
      }

      const { requests, warnings, errors } = buildParamSetRequests({
        flowId: opts.flow ?? null,
        defs,
        assignments: pairs,
      });
      if (errors.length > 0) {
        console.error(`${symbol.fail()} ${errors.join(" ")}`);
        process.exit(1);
        return;
      }

      try {
        await new ParamStore(projectRoot).set(requests, nowIso());
      } catch (err) {
        const msg =
          err instanceof ParamWriteError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        console.error(`${symbol.fail()} ${msg}`);
        process.exit(1);
      }
      for (const w of warnings) console.log(`${symbol.warn()} ${w}`);
      console.log(
        `${symbol.ok()} Stored ${requests.length} value${requests.length === 1 ? "" : "s"}: ${requests
          .map((r) => color.bold(r.key))
          .join(", ")}.`,
      );
    });

  cmd
    .command("generate <param>")
    .description(
      "Draft a value for a `generate`-enabled param via a provider (optional, user-initiated, reviewed). Prints a suggestion; --accept stores it.",
    )
    .requiredOption("--flow <id>", "the flow that declares the param")
    .option("--accept", "store the suggestion (setBy: generated) without asking")
    .action(async (param: string, opts: { flow: string; accept?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const discovered = await findFlowById(projectRoot, opts.flow);
      if (!discovered) {
        console.error(`${symbol.fail()} No flow "${opts.flow}".`);
        process.exit(1);
        return;
      }
      const defs = discovered.definition.params ?? {};
      const store = new ParamStore(projectRoot);
      let suggestion: string;
      try {
        const res = await generateParamSuggestion({
          projectRoot,
          flowId: opts.flow,
          param,
          defs,
          profile: await store.read(),
        });
        suggestion = res.suggestion;
      } catch (err) {
        console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
        return;
      }
      console.log(`${symbol.ok()} Suggestion for ${color.bold(param)}: ${suggestion}`);
      let accept = opts.accept ?? false;
      if (!accept && isInteractiveTTY()) {
        accept = await confirm({ message: "Store this value in the project parameters?" });
      }
      if (!accept) {
        console.log(color.dim("Not stored. Re-run with --accept to keep it."));
        return;
      }
      const def = defs[param]!;
      await store.set(
        [
          {
            key: paramKeyFor(opts.flow, param, def.shared),
            value: suggestion,
            setBy: "generated",
            secret: false,
          },
        ],
        nowIso(),
      );
      console.log(`${symbol.ok()} Stored ${color.bold(paramKeyFor(opts.flow, param, def.shared))} (generated).`);
    });

  cmd
    .command("unset <keys...>")
    .description("Remove stored values by key (explicit, never automatic).")
    .action(async (keys: string[]) => {
      const { projectRoot } = await detectProject(process.cwd());
      const removed = await new ParamStore(projectRoot).unset(keys);
      if (removed.length === 0) {
        console.error(`${symbol.fail()} No matching param keys to remove.`);
        process.exit(1);
      }
      console.log(
        `${symbol.ok()} Removed: ${removed.map((k) => color.bold(k)).join(", ")}.`,
      );
    });

  return cmd;
}
