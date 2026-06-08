import { detectProject } from "../../../project/project-detector.js";
import {
  discoverFlows,
  findFlowById,
} from "../../../flows/catalog/flow-discovery.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runFlowsShow(
  flowId: string,
  opts: { json?: boolean } = {},
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
  const isGraph = flow.definition.steps.some((s) => (s.needs?.length ?? 0) > 0);
  console.log(color.bold(isGraph ? "Steps (graph)" : "Steps"));
  for (const [index, step] of flow.definition.steps.entries()) {
    const seat = step.seat ? ` seat ${step.seat}` : "";
    const optional = step.optional ? " optional" : "";
    const repeat = step.repeat ? ` repeat x${step.repeat.times}` : "";
    const gate = step.approval
      ? ` gate ${step.approval.riskLevel}`
      : "";
    const needs = step.needs?.length
      ? ` ${color.dim(`needs ${step.needs.join(", ")}`)}`
      : "";
    console.log(
      indent(
        `${index + 1}. ${step.id}: ${step.label} ${color.dim(`(${step.kind}${seat}${optional}${repeat}${gate})`)}${needs}`,
      ),
    );
  }
  // Surface the parallel groups + read-only fan-out explicitly so the graph
  // shape (and its cost) is legible from the CLI, not just the dashboard.
  if (isGraph) {
    // Phase D: when the graph lives in a per-item band, the band repeats once per
    // checklist item and the prelude/postlude stay linear. Group over the band
    // steps only - else the empty-`needs` prelude/postlude steps would be shown
    // as one big (false) parallel group. Also surface the band boundary.
    const seg = flow.definition.checklistSegment ?? null;
    const segFrom = seg
      ? flow.definition.steps.findIndex((s) => s.id === seg.from)
      : -1;
    const segTo = seg
      ? flow.definition.steps.findIndex((s) => s.id === seg.to)
      : -1;
    const banded = seg !== null && segFrom >= 0 && segTo >= segFrom;
    if (banded) {
      console.log("");
      console.log(color.bold("Per-item band (repeats once per checklist item)"));
      console.log(indent(`- ${seg!.from} .. ${seg!.to}`));
    }
    const groupSteps = banded
      ? flow.definition.steps.slice(segFrom, segTo + 1)
      : flow.definition.steps;
    const groups = new Map<string, string[]>();
    for (const step of groupSteps) {
      const key = [...(step.needs ?? [])].sort().join(" ");
      groups.set(key, [...(groups.get(key) ?? []), step.id]);
    }
    const parallel = [...groups.values()].filter((g) => g.length >= 2);
    if (parallel.length) {
      console.log("");
      console.log(color.bold("Parallel groups (run concurrently, read-only)"));
      for (const g of parallel) {
        console.log(indent(`- ${g.join(" · ")}`));
      }
    }
  }
  return 0;
}
