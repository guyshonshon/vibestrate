import { detectProject } from "../../../project/project-detector.js";
import {
  fetchHubIndex,
  searchHub,
  installFlowFromHub,
} from "../../../flows/hub/flow-hub.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runHubList(opts: {
  baseUrl?: string;
  query?: string;
  json?: boolean;
}): Promise<number> {
  // CLI is user-initiated, so the SSRF guard may allow the typed/default host.
  const r = await fetchHubIndex({ baseUrl: opts.baseUrl, allowPrivateHosts: true });
  if (!r.ok) {
    console.error(`${symbol.fail()} ${r.reason}`);
    return 1;
  }
  const flows = opts.query ? searchHub(r.value, opts.query) : r.value.flows;
  if (opts.json) {
    console.log(JSON.stringify(flows, null, 2));
    return 0;
  }
  if (flows.length === 0) {
    console.log("No flows in the hub index match.");
    return 0;
  }
  console.log(header(`Flows hub (${flows.length})`));
  console.log("");
  for (const f of flows) {
    console.log(`${color.bold(f.name)} ${color.dim(`@${f.latest}`)}`);
    if (f.description) console.log(indent(f.description));
    if (f.tags.length) console.log(indent(color.dim(f.tags.join(", "))));
  }
  console.log("");
  console.log(color.dim("Install: vibe flows hub install <name>"));
  return 0;
}

export async function runHubInstall(
  name: string,
  opts: { version?: string; baseUrl?: string; overwrite?: boolean },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const r = await installFlowFromHub({
    projectRoot: detected.projectRoot,
    name,
    version: opts.version,
    baseUrl: opts.baseUrl,
    allowPrivateHosts: true,
    overwrite: opts.overwrite,
  });
  if (!r.ok) {
    console.error(`${symbol.fail()} ${r.reasons.join(" ")}`);
    return 1;
  }
  console.log(
    `${symbol.ok()} Installed ${color.bold(name)}${opts.version ? `@${opts.version}` : ""} → .vibestrate/flows/.`,
  );
  console.log(indent(color.dim("Validated + secret/shell-guarded on import. Review it before running.")));
  return 0;
}
