import { detectProject } from "../../../project/project-detector.js";
import {
  discoverFlows,
  findFlowById,
} from "../../../flows/catalog/flow-discovery.js";
import { loadConfig } from "../../../project/config-loader.js";
import { computeFlowCoverageForConfig } from "../../../flows/runtime/seat-coverage.js";
import { setConfigValue } from "../../../setup/config-update-service.js";
import { color, indent, symbol } from "../../ui/format.js";

/** Set the project's default ("active") flow - the one runs use when none is
 *  passed. Mirrors the shell/web "use as default". */
export async function runFlowsUse(flowId: string): Promise<number> {
  if (!flowId) {
    console.error(
      `${symbol.fail()} Flow id is required. Try ${color.bold("vibe flows list")}.`,
    );
    return 1;
  }
  const detected = await detectProject(process.cwd());
  const flow = await findFlowById(detected.projectRoot, flowId);
  if (!flow) {
    const ids = (await discoverFlows(detected.projectRoot)).map((item) => item.id);
    console.error(
      `${symbol.fail()} No Flow named "${flowId}". Found: ${ids.join(", ") || "(none)"}.`,
    );
    return 1;
  }

  await setConfigValue(detected.projectRoot, "defaultFlow", flowId);
  console.log(`${symbol.ok()} Default flow is now ${color.bold(flowId)}.`);

  // Warn (non-blocking) if the default crew can't fully crew it.
  try {
    const loaded = await loadConfig(detected.projectRoot);
    const cov = computeFlowCoverageForConfig({
      config: loaded.config,
      flow: flow.definition,
    });
    if (!cov.runnable) {
      const gaps = cov.seats.filter((s) => s.usedByStep && s.status !== "filled");
      console.log(
        indent(
          color.dim(
            `Heads up: crew "${cov.crewId}" doesn't fully crew it - ${gaps
              .map((g) => `${g.seatId} (${g.status})`)
              .join(", ")}. Open Crew to fix, or pass --crew at run time.`,
          ),
        ),
      );
    }
  } catch {
    // informational only.
  }
  return 0;
}
