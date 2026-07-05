import { detectProject } from "../../../project/project-detector.js";
import {
  searchHubFlows,
  installFlowFromHub,
  publishFlow,
} from "../../../flows/hub/hub-client.js";
import { exportFlowYaml } from "../../../flows/runtime/flow-portability.js";
import {
  buildPublishRef,
  runPublishPreflight,
} from "../../../flows/hub/publish-guards.js";
import {
  resolveSecret,
  envVarName,
} from "../../../notifications/gateways/secret-resolver.js";
import { color, header, indent, isInteractiveTTY, symbol } from "../../ui/format.js";

const HUB_TOKEN_REF = "env:VIBESTRATE_HUB_TOKEN";

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
    // "hub-curated", not "verified": the flag is the hub's curation claim,
    // not an integrity guarantee.
    const verified = f.verified ? color.dim(" (hub-curated)") : "";
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
        "Checksum matched (transport integrity only), schema-validated, and secret/shell-guarded on import. A hub flow is executable configuration - review it before running.",
      ),
    ),
  );
  return 0;
}

export async function runHubPublish(
  flowId: string,
  opts: {
    version?: string;
    name?: string;
    handle?: string;
    baseUrl?: string;
    yes?: boolean;
    json?: boolean;
    allowTokenToCustomHost?: boolean;
  },
): Promise<number> {
  if (!opts.version) {
    console.error(`${symbol.fail()} --version <x.y.z> is required.`);
    return 1;
  }
  if (!opts.handle) {
    console.error(
      `${symbol.fail()} --handle <your-github-login> is required (it must match the GitHub token's account).`,
    );
    return 1;
  }

  const detected = await detectProject(process.cwd());
  const exported = await exportFlowYaml({
    projectRoot: detected.projectRoot,
    flowId,
  });
  if (!exported.ok) {
    const reason =
      "reasons" in exported && Array.isArray(exported.reasons)
        ? exported.reasons[0]
        : `flow "${flowId}" not found.`;
    console.error(`${symbol.fail()} ${reason}`);
    return 1;
  }

  // buildPublishRef validates raw input (no normalization); lowercase user input here.
  const ref = buildPublishRef({
    handle: opts.handle.toLowerCase(),
    name: (opts.name ?? flowId).toLowerCase(),
    version: opts.version,
  });
  if (!ref.ok) {
    console.error(`${symbol.fail()} ${ref.reason}`);
    return 1;
  }

  const preflight = runPublishPreflight(exported.yaml);
  if (!preflight.ok) {
    console.error(`${symbol.fail()} Refusing to publish - secret-shaped content:`);
    for (const r of preflight.refusals) console.error(indent(r));
    return 1;
  }

  const token = resolveSecret(HUB_TOKEN_REF);
  if (!token) {
    console.error(
      `${symbol.fail()} Set the env var ${envVarName(HUB_TOKEN_REF)} to a GitHub token before publishing.`,
    );
    return 1;
  }

  const bytes = Buffer.byteLength(exported.yaml, "utf8");
  console.log(header("Publish to the Vibestrate hub"));
  console.log(indent(`ref:     ${color.bold(ref.ref)}`));
  console.log(indent(`size:    ${bytes} bytes`));
  console.log(
    indent(color.dim("This publishes a PUBLIC, IMMUTABLE version to vibestrate.com.")),
  );
  if (preflight.warnings.length > 0) {
    console.log("");
    console.log(indent(color.dim("Heads up - this flow:")));
    for (const w of preflight.warnings) console.log(indent(`- ${w}`));
  }

  if (!opts.yes) {
    if (!isInteractiveTTY()) {
      console.error(
        `${symbol.fail()} Not a TTY. Pass --yes to confirm publish non-interactively.`,
      );
      return 1;
    }
    const { confirm } = await import("@inquirer/prompts");
    const okToGo = await confirm({ message: "Publish now?", default: false });
    if (!okToGo) {
      console.log("Aborted.");
      return 1;
    }
  }

  // CLI is user-initiated: the SSRF guard may allow the typed/default host.
  const result = await publishFlow({
    content: exported.yaml,
    ref: ref.ref,
    token,
    baseUrl: opts.baseUrl,
    allowTokenToCustomHost: opts.allowTokenToCustomHost,
    allowPrivateHosts: true,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (!result.ok) {
    console.error(
      `${symbol.fail()} Publish failed (HTTP ${result.status}): ${result.reason}`,
    );
    if (result.diagnosis?.findings?.length) {
      for (const f of result.diagnosis.findings) {
        console.error(
          indent(
            `- [${f.severity}] ${f.message}${f.path ? ` (${f.path})` : ""}`,
          ),
        );
      }
    }
    return 1;
  }
  if (result.alreadyExisted) {
    console.log(
      `${symbol.ok()} ${color.bold(result.ref)} - the hub reports this version already exists with identical content.`,
    );
    return 0;
  }
  const flagged = result.diagnosis?.verdict === "flagged";
  console.log(
    `${symbol.ok()} Published ${color.bold(result.ref)}${flagged ? color.dim(" (flagged - see warnings)") : ""}.`,
  );
  console.log(
    indent(
      color.dim(`sha256 ${result.sha256.slice(0, 12)}... (transport integrity only).`),
    ),
  );
  if (flagged && result.diagnosis?.findings?.length) {
    for (const f of result.diagnosis.findings) {
      console.log(indent(`- [${f.severity}] ${f.message}`));
    }
  }
  return 0;
}
