// Which flows this crew can actually run, said at edit time.
//
// Seat resolution is where a badly-cast crew fails, and it fails hard: a flow
// step whose seat no role takes throws before the run starts, and so does a step
// whose seat two roles take, unless the run passes an explicit role override.
// Both are cheap to see here and expensive to discover at launch, so the panel
// names the flow, the seat, and which of the two problems it is.

import type { FlowFit } from "./crew-editor-model.js";
import { StatTile } from "../design/StatTile.js";
import { Section } from "../layout/PageShell.js";
import { ToneDot, type ChipTone } from "../design/Chip.js";
import { cn } from "../design/cn.js";

const STATUS: Record<
  FlowFit["status"],
  { tone: ChipTone; label: string; row: string }
> = {
  ready: { tone: "emerald", label: "Runs", row: "border-[color:var(--line-soft)]" },
  contested: {
    tone: "amber",
    label: "Needs a pick",
    row: "border-amber-soft/30 bg-amber-soft/[0.06]",
  },
  blocked: {
    tone: "rose",
    label: "Cannot start",
    row: "border-rose-400/30 bg-rose-500/[0.06]",
  },
};

export function CrewFlowFit({ fits }: { fits: FlowFit[] }) {
  if (fits.length === 0) {
    return (
      <Section flush title="Flows this crew can run">
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-4 py-6">
          <p className="text-[13px] text-chalk-300">
            No flows are installed, so there are no seats to fill yet.
          </p>
        </div>
      </Section>
    );
  }

  const blocked = fits.filter((f) => f.status === "blocked").length;
  const contested = fits.filter((f) => f.status === "contested").length;
  const ready = fits.length - blocked - contested;

  return (
    <Section flush title="Flows this crew can run">
      <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatTile
            value={ready}
            label={ready === 1 ? "flow runs" : "flows run"}
            tone={ready > 0 ? "emerald" : "default"}
          />
          {contested > 0 ? (
            <StatTile value={contested} label="need a pick" tone="amber" />
          ) : null}
          {blocked > 0 ? (
            <StatTile value={blocked} label="cannot start" tone="rose" />
          ) : null}
        </div>

        <div className="space-y-1.5">
          {fits.map((fit) => {
            const s = STATUS[fit.status];
            return (
              <div
                key={fit.flowId}
                className={cn(
                  "flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[12px] border px-3 py-2",
                  s.row,
                )}
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-chalk-100">
                  <ToneDot tone={s.tone} />
                  {fit.flowLabel}
                </span>
                <span className="mono text-[11px] text-chalk-300">{fit.flowId}</span>
                <span
                  className={cn(
                    "ml-auto text-[11.5px] font-semibold",
                    fit.status === "blocked"
                      ? "text-rose-300"
                      : fit.status === "contested"
                        ? "text-amber-soft"
                        : "text-emerald-400",
                  )}
                >
                  {s.label}
                </span>
                {fit.missing.length > 0 ? (
                  <p className="w-full text-[11.5px] leading-[1.45] text-chalk-200">
                    <span className="font-semibold text-rose-300">
                      No role takes{" "}
                    </span>
                    <span className="mono">{fit.missing.join(", ")}</span>
                    <span className="text-chalk-300">
                      . A run on this flow stops before an agent starts.
                    </span>
                  </p>
                ) : null}
                {fit.contested.length > 0 ? (
                  <p className="w-full text-[11.5px] leading-[1.45] text-chalk-200">
                    <span className="font-semibold text-amber-soft">
                      Several roles take{" "}
                    </span>
                    <span className="mono">{fit.contested.join(", ")}</span>
                    <span className="text-chalk-300">
                      . The run needs a role override, or it stops on the ambiguity.
                    </span>
                  </p>
                ) : null}
                {fit.status === "ready" ? (
                  <p className="w-full text-[11.5px] leading-[1.45] text-chalk-300">
                    {fit.required.length === 0
                      ? "This flow asks for no seats."
                      : `Every seat it asks for has one taker: ${fit.required.join(", ")}.`}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
