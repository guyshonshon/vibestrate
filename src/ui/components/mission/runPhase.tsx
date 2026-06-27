/**
 * Shared run-phase vocabulary: maps a real RunStatus to a stage index, a
 * light-hearted message, and a phase rail. Driven entirely by actual status -
 * no scripted timers. Used by the Active run cards and the run page so the
 * progression reads the same everywhere.
 */
import type { RunStatus } from "../../lib/types.js";

export const RUN_STAGES = ["Plan", "Architect", "Execute", "Review", "Verify", "Merge"] as const;

const STAGE: Record<RunStatus, number> = {
  created: 0,
  planning: 0,
  planned: 0,
  architecting: 1,
  architected: 1,
  executing: 2,
  validating: 2,
  reviewing: 3,
  fixing: 3,
  verifying: 4,
  waiting_for_approval: 3,
  paused: 2,
  blocked: 3,
  merge_ready: 5,
  failed: 5,
  aborted: 5,
};

const MSG: Record<RunStatus, string> = {
  created: "Waking up the crew...",
  planning: "Sketching a plan...",
  planned: "Plan's locked in.",
  architecting: "Drawing the blueprints...",
  architected: "Blueprints approved.",
  executing: "Heads down, building...",
  validating: "Running the checks...",
  reviewing: "Nitpicking the diff...",
  fixing: "Patching things up...",
  verifying: "Double-checking the work...",
  waiting_for_approval: "Needs your call.",
  paused: "Taking a breather.",
  blocked: "Hit a wall.",
  merge_ready: "Ready to ship.",
  failed: "That didn't go to plan.",
  aborted: "Called it off.",
};

export const RUN_TERMINAL = new Set<RunStatus>(["merge_ready", "failed", "aborted"]);
const RUN_BAD = new Set<RunStatus>(["failed", "aborted", "blocked"]);

export function statusMessage(status: RunStatus): string {
  return MSG[status] ?? status.replace(/_/g, " ");
}
export function statusStage(status: RunStatus): number {
  return STAGE[status] ?? 0;
}

/** Horizontal phase rail filled to the run's current stage (violet, red if bad). */
export function PhaseRail({
  status,
  showLabels = false,
}: {
  status: RunStatus;
  showLabels?: boolean;
}) {
  const stage = statusStage(status);
  const bad = RUN_BAD.has(status);
  return (
    <div>
      <div className="flex items-center gap-1">
        {RUN_STAGES.map((s, i) => (
          <div
            key={s}
            className="h-1 flex-1 rounded-full"
            style={{
              background:
                i <= stage
                  ? bad
                    ? "var(--fail)"
                    : "var(--color-violet-soft)"
                  : "var(--color-coal-400)",
            }}
          />
        ))}
      </div>
      {showLabels ? (
        <div className="mt-1.5 flex justify-between text-[10px] font-medium text-chalk-400">
          {RUN_STAGES.map((s, i) => (
            <span key={s} className={i === stage ? "text-chalk-100" : ""}>
              {s}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
