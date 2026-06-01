import { detectProject } from "../../../project/project-detector.js";
import {
  searchHubFlows,
  installFlowFromHub,
} from "../../../flows/hub/hub-client.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runHubList(opts: {
  baseUrl?: string;
  query?: string;
  json?: boolean;
}): Promise<number> {
  // CLI is user-initiated, so the SSRF guard may allow the typed/default host.
  const r = await searchHubFlows({
    q: opts.query,
    baseUrl: opts.baseUrl,
    allowPrivateHosts: true,
  });
  if (!r.ok) {
    console.error(`${symbol.fail()} ${r.reason}`);
    return 1;
  }
  const flows = r.value;
  if (opts.json) {
    console.log(JSON.stringify(flows, null, 2));
    return 0;
  }
  if (flows.length === 0) {
    console.log("No flows in the hub match.");
    return 0;
  }
  console.log(header(`Flows hub (${flows.length})`));
  console.log("");
  for (const f of flows) {
    const verified = f.verified ? color.dim(" (verified)") : "";
    console.log(`${color.bold(f.ref)}${verified}`);
    if (f.name && f.name !== f.ref) console.log(indent(color.dim(f.name)));
    if (f.description) console.log(indent(f.description));
    if (f.tags?.length) console.log(indent(color.dim(f.tags.join(", "))));
  }
  console.log("");
  console.log(color.dim("Install: vibe flows hub install <ref>"));
  return 0;
}

export async function runHubInstall(
  ref: string,
  opts: { baseUrl?: string; overwrite?: boolean },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const r = await installFlowFromHub({
    projectRoot: detected.projectRoot,
    ref,
    baseUrl: opts.baseUrl,
    allowPrivateHosts: true,
    overwrite: opts.overwrite,
  });
  if (!r.ok) {
    console.error(`${symbol.fail()} ${r.reasons.join(" ")}`);
    return 1;
  }
  console.log(
    `${symbol.ok()} Installed ${color.bold(ref)} -> .vibestrate/flows/.`,
  );
  console.log(
    indent(
      color.dim(
        "sha256-verified, validated, and secret/shell-guarded on import. Review it before running.",
      ),
    ),
  );
  return 0;
}
