import { FlowGraph, isGraphSteps } from "../workflow/FlowGraph.js";
import { extractFlowFromYaml } from "../../lib/flow-yaml.js";

/**
 * Live, read-only preview of the flow the YAML currently describes, shown beside
 * the code editor: the dependency graph when it's a DAG, an ordered step list
 * otherwise. YAML is the single source of truth here, so the preview is derived
 * and never edits back - no round-trip churn. A parse error pauses the preview
 * rather than throwing, so a half-typed line never breaks the editor.
 */
export function YamlGraphPreview({ yamlText }: { yamlText: string }) {
  const parsed = extractFlowFromYaml(yamlText);
  const steps = parsed.definition?.steps;
  if (parsed.error) {
    return (
      <div className="rounded-[12px] border border-amber-soft/25 bg-amber-soft/10 px-3 py-2 text-[12px] text-amber-soft">
        Live preview paused while the YAML doesn't parse.
      </div>
    );
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    return (
      <div className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-800 px-3 py-2 text-[12px] text-chalk-400">
        No steps to preview yet.
      </div>
    );
  }
  const graphSteps = steps.map((s) => ({
    id: s.id,
    label: s.label ?? s.id,
    kind: s.kind,
    seat: s.seat ?? null,
    needs: s.needs ?? [],
    instructions: s.instructions ?? null,
  }));
  if (isGraphSteps(graphSteps)) {
    return <FlowGraph title="Live preview" steps={graphSteps} />;
  }
  return (
    <div className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-800 p-3">
      <div className="mb-2 text-[12px] font-semibold text-violet-vivid">Live preview</div>
      <ol className="space-y-1">
        {graphSteps.map((s, i) => (
          <li
            key={s.id}
            className="flex items-baseline gap-2 text-[12px] text-chalk-300"
          >
            <span className="mono text-chalk-400">{i + 1}.</span>
            <span className="text-chalk-100">{s.label}</span>
            <span className="mono text-[10.5px] text-chalk-400">{s.kind}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
