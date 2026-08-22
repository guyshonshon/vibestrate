import { detectProject } from "../../../project/project-detector.js";
import { deriveFlowFromTask } from "../../../flows/authoring/flow-derive-service.js";
import { color, header, indent, symbol } from "../../ui/format.js";

/**
 * `vibe flows derive <task>` - build a flow around the work instead of picking
 * one off the shelf.
 *
 * A shaping turn decomposes the task into units, dependencies and risk tags
 * from a closed set; deterministic code compiles the graph. The model never
 * writes a step, a `needs` edge or a review lens, so it cannot choose the gates
 * it will be judged by.
 *
 * Writes NOTHING, exactly like `flows draft`: the graph is printed for review
 * and adopted with `flows import`.
 */
export async function runFlowsDerive(
  task: string,
  opts: { crew?: string; id?: string; maxUnits?: number; yaml?: boolean; json?: boolean } = {},
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const flowId = opts.id ?? "derived";
  const draft = await deriveFlowFromTask({
    projectRoot: detected.projectRoot,
    task,
    flowId,
    crewId: opts.crew ?? null,
    maxUnits: opts.maxUnits,
  });

  if (opts.json) {
    console.log(JSON.stringify(draft, null, 2));
    return 0;
  }
  if (opts.yaml) {
    console.log(draft.yaml);
    return 0;
  }

  header(`Derived flow "${draft.flow.id}"`);
  console.log(indent(color.dim(draft.shape.rationale)));

  console.log("");
  console.log(color.bold("Units of work"));
  for (const u of draft.shape.units) {
    const deps = u.dependsOn.length > 0 ? ` after ${u.dependsOn.join(", ")}` : "";
    const risk = u.risk.length > 0 ? color.yellow(`  [${u.risk.join(", ")}]`) : "";
    console.log(indent(`${color.bold(u.id)}  ${u.title}${color.dim(deps)}${risk}`));
  }

  console.log("");
  console.log(color.bold("Compiled graph"));
  for (const [i, s] of draft.flow.steps.entries()) {
    const needs = (s.needs ?? []).length > 0 ? color.dim(` needs ${(s.needs ?? []).join(", ")}`) : "";
    console.log(indent(`${String(i + 1).padStart(2)}. ${s.id}${needs}`));
  }

  console.log("");
  console.log(color.bold("Why these reviews"));
  for (const n of draft.notes) console.log(indent(`${symbol.ok()} ${n}`));

  console.log("");
  console.log(color.bold("Seat coverage"));
  const gaps = draft.coverage.seats.filter((s) => s.usedByStep && s.status !== "filled");
  if (draft.coverage.runnable) {
    console.log(indent(`${symbol.ok()} every seat is filled by crew "${draft.coverage.crewId}"`));
  }
  for (const g of gaps) {
    console.log(
      indent(
        `${symbol.warn()} seat "${g.seatId}" is ${g.status} in crew "${draft.coverage.crewId}"` +
          (g.candidateRoleIds.length > 0 ? ` (candidates: ${g.candidateRoleIds.join(", ")})` : ""),
      ),
    );
  }

  console.log("");
  console.log(color.dim("Nothing was written. To adopt it:"));
  console.log(indent(`vibe flows derive "<task>" --id ${flowId} --yaml > ${flowId}.yml`));
  console.log(indent(`vibe flows import ${flowId}.yml`));
  if (draft.exists) {
    console.log(indent(color.yellow(`A project flow "${draft.flow.id}" already exists; adopting overwrites it.`)));
  }
  return 0;
}
