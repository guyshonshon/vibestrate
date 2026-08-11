import {
  api,
  ApiError,
  type ProviderRow,
  type RestorePreview,
} from "../../../lib/api.js";
import { Button } from "../../../components/design/Button.js";
import { navigate, type ReplayFocus } from "../../App.js";
import type {
  VibestrateEvent,
  ApprovalRequest,
  EngagementEntry,
  PerItemVerdict,
  RunAssurance,
  RunAudit,
  RunState,
  RuntimeMetrics,
  SpecUpQuestion,
  WorkflowSelectionView,
} from "../../../lib/types.js";
import {
  InspectorTabsV3,
  type InspectorV3Tab,
} from "../../../components/runs/v3/InspectorTabs.js";
import { AlertTriangle, Bolt, Cpu, FolderTree, Scale, ShieldCheck } from "lucide-react";
import {
  describeRunOutcome,
  type RunOutcomeAction,
} from "../../../lib/run-outcome.js";
import type { InspectorTabId } from "../../../components/layout/inspector-tabs.js";

export function RunOutcomeBanner({
  run,
  onRerun,
  onOpenReview,
  onOpenTab,
}: {
  run: RunState;
  onRerun: () => void;
  onOpenReview: () => void;
  onOpenTab: (t: InspectorV3Tab) => void;
}) {
  const outcome = describeRunOutcome(run);
  if (!outcome) return null;
  const rose = outcome.kind !== "aborted";
  const accent = rose
    ? "border-rose-400/30 bg-rose-500/10"
    : "border-[color:var(--line)] bg-coal-600";
  const label: Record<RunOutcomeAction, string> = {
    rerun: "Re-run with changes",
    review: "See review",
    events: "View events",
    diff: "View diff",
  };
  const run_ = (a: RunOutcomeAction) => {
    if (a === "rerun") onRerun();
    else if (a === "events") onOpenTab("events");
    else if (a === "review") onOpenReview();
    else onOpenTab("artifacts"); // diff lives under Artifacts
  };
  return (
    <section
      className={`rounded-[18px] border ${accent} px-5 py-4`}
      data-screen-label="01b Outcome"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${rose ? "text-rose-300" : "text-chalk-300"}`}
          strokeWidth={1.9}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-chalk-100">
            {outcome.title}
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-chalk-300">
            {outcome.reason}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {outcome.actions.map((a, i) => (
              <Button
                key={a}
                size="sm"
                variant={i === 0 ? "primary" : "secondary"}
                onClick={() => run_(a)}
              >
                {label[a]}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


