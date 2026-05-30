import path from "node:path";
import { detectProject } from "../../../project/project-detector.js";
import {
  importFlowFromFile,
  importFlowFromUrl,
} from "../../../flows/runtime/flow-portability.js";
import { color, symbol } from "../../ui/format.js";

/**
 * Import a single flow from a local file path or an http(s) URL into
 * `.vibestrate/flows/`. The source is treated as a URL when it starts with
 * http(s):// and otherwise as a file path. The CLI is user-initiated, so URL
 * fetches skip the SSRF host block (the user typed the address); the HTTP API
 * import keeps the block on.
 */
export async function runFlowsImport(
  source: string,
  opts: { overwrite?: boolean; json?: boolean },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const isUrl = /^https?:\/\//i.test(source);
  const result = isUrl
    ? await importFlowFromUrl({
        projectRoot: detected.projectRoot,
        url: source,
        overwrite: opts.overwrite,
        allowPrivateHosts: true,
      })
    : await importFlowFromFile({
        projectRoot: detected.projectRoot,
        filePath: path.resolve(process.cwd(), source),
        overwrite: opts.overwrite,
      });

  if (!result.ok) {
    console.error(color.red(result.reasons.join("\n")));
    if (result.status === 409) {
      console.error(color.dim("Re-run with --overwrite to replace the existing project flow."));
    }
    return 1;
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(
    `${symbol.ok()} imported flow "${result.flowId}" → ${result.definitionPath}${
      result.overwritten ? color.dim(" (overwritten)") : ""
    }.`,
  );
  console.log(color.dim(`Run \`vibe flows show ${result.flowId}\` to inspect it.`));
  return 0;
}
