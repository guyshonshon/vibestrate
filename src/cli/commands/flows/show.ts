import { detectProject } from "../../../project/project-detector.js";
import {
  discoverFlows,
  findFlowById,
} from "../../../flows/catalog/flow-discovery.js";
import { loadConfig } from "../../../project/config-loader.js";
import { computeFlowCoverageForConfig } from "../../../flows/runtime/seat-coverage.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runFlowsShow(
  flowId: string,
  opts: { json?: boolean; crew?: string } = {},
): Promise<number> {
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

  if (opts.json) {
    console.log(JSON.stringify({ flow }, null, 2));
    return 0;
  }

  console.log(header(flow.label));
  console.log(indent(color.dim(`id: ${flow.id}`)));
  console.log(indent(color.dim(`version: ${flow.version}`)));
  console.log(indent(color.dim(`source: ${flow.source.kind}`)));
  if (flow.definitionPath) {
    console.log(indent(color.dim(`path: ${flow.definitionPath}`)));
  }
  console.log("");
  console.log(flow.description);
  console.log("");
  console.log(color.bold("Seats"));
  for (const [seatId, seat] of Object.entries(flow.definition.seats)) {
    console.log(
      indent(
        `${seatId}: ${seat.label}${seat.description ? color.dim(` - ${seat.description}`) : ""}`,
      ),
    );
  }
  console.log("");
  console.log(color.bold("Steps"));
  for (const [index, step] of flow.definition.steps.entries()) {
    const seat = step.seat ? ` seat ${step.seat}` : "";
    const optional = step.optional ? " optional" : "";
    const repeat = step.repeat ? ` repeat x${step.repeat.times}` : "";
    const gate = step.approval
      ? ` gate ${step.approval.riskLevel}`
      : "";
    console.log(
      indent(
        `${index + 1}. ${step.id}: ${step.label} ${color.dim(`(${step.kind}${seat}${optional}${repeat}${gate})`)}`,
      ),
    );
  }

  // Seat coverage against the project's default crew: is this flow crewed and
  // runnable? (Filled / gap / ambiguous per seat.)
  try {
    const loaded = await loadConfig(detected.projectRoot);
    const cov = computeFlowCoverageForConfig({
      config: loaded.config,
      flow: flow.definition,
      crewId: opts.crew ?? null,
    });
    console.log("");
    console.log(
      `${color.bold("Coverage")} ${color.dim(`(crew: ${cov.crewId})`)} ${
        cov.runnable ? color.dim("- runnable") : color.dim("- has gaps")
      }`,
    );
    for (const s of cov.seats) {
      const mark =
        s.status === "filled"
          ? symbol.ok()
          : s.status === "gap"
            ? symbol.fail()
            : symbol.arrow();
      const detail =
        s.status === "filled"
          ? color.dim(s.resolvedRoleId ?? "")
          : s.status === "ambiguous"
            ? color.dim(`ambiguous: ${s.candidateRoleIds.join(", ")}`)
            : color.dim("no role fills this seat");
      const unused = s.usedByStep ? "" : color.dim(" (unused)");
      console.log(indent(`${mark} ${s.seatId}  ${detail}${unused}`));
    }
  } catch {
    // Coverage is informational; never fail `show` over a config issue.
  }
  return 0;
}
