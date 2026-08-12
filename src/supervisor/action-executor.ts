// ── Supervisor action executor ──────────────────────────────────────────────
//
// Phase two. No model runs here, and nothing the model produced is trusted as
// an argument until this file has checked it.
//
// The router proposes; this decides. Every field of a proposal is validated by
// code before anything is written:
//
//   targetId  must be in an allowlist built by a task query. Never fuzzy-matched.
//   echo      must equal what the user actually typed. This is the provenance
//             check, and it is the one that matters most: without it, injected
//             context could leave the intent alone and quietly rewrite the brief
//             of a run the user genuinely asked for.
//   intent    must be permitted by the autonomy gate and the kill switch.
//   effects   run.start crosses the Action Broker, so a policy can refuse it.
//             task.create and checklist.add do NOT: there is no ActionKind for
//             either, and inventing one that nothing else in the product emits
//             would put a name in the policy vocabulary that only ever fires
//             here. They are bounded instead - a title and a list of strings,
//             both length-capped, onto a task that was already offered.
//
// The verbatim rule is absolute for anything that becomes an agent's
// instruction: a run's task text is the user's own words, never a model's
// summary of them.

import { z } from "zod";
import { RoadmapService } from "../roadmap/roadmap-service.js";
import { createActionBroker, gateAction } from "../safety/action-broker.js";
import { checkAutonomy, readPauseState } from "./autonomy-gate.js";
import { readLiveTaskLockHolder } from "../core/run/run-lock.js";
import type { SupervisorProposal } from "./intake-router.js";
import type { SupervisorActionRecord } from "./conversation-store.js";
import type { ProjectConfig } from "../project/config-schema.js";

/** Audit bucket for supervisor-initiated effects, so they land in one place
 *  rather than inventing a fake run id per action. */
const SUPERVISOR_AUDIT_RUN = "supervisor";

export type ExecuteInput = {
  projectRoot: string;
  config: ProjectConfig;
  /** Exactly what the user typed, for the provenance check. */
  userMessage: string;
  proposal: SupervisorProposal;
  /** Ids the router was offered. Anything outside this is rejected. */
  allowedTargetIds: readonly string[];
  /** The run this conversation is about, when it is scoped to one. Inside a
   *  live run's panel, "build the hero" means add it to what is happening, not
   *  launch a second run alongside it - and runs really are concurrent here, so
   *  that would quietly start one. */
  scopedRunId?: string | null;
  /** Injected so a test can drive the executor without launching real runs. */
  startRun?: (input: { projectRoot: string; taskId: string; task: string }) => Promise<string>;
};

export type ExecuteResult = {
  /** What to say in the thread. */
  reply: string;
  /** Null when the intent was `answer`, or when nothing was attempted. */
  action: SupervisorActionRecord | null;
};

/** Normalise for the provenance comparison. Whitespace and case are noise; a
 *  changed WORD is the thing we are looking for. */
function sameWords(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
}

function refusal(intent: string, message: string): ExecuteResult {
  return {
    reply: message,
    action: {
      intent,
      summary: message.slice(0, 600),
      targetKind: "none",
      targetId: null,
      ok: false,
      error: message.slice(0, 2000),
      undone: false,
    },
  };
}

export async function executeProposal(input: ExecuteInput): Promise<ExecuteResult> {
  const { proposal } = input;

  // Talking is always allowed, in any autonomy mode, paused or not. It is the
  // one path that changes nothing.
  if (proposal.intent === "answer") {
    return { reply: "", action: null };
  }

  // ── Gate 1: may the supervisor act at all right now ─────────────────────
  const pause = await readPauseState(input.projectRoot);
  const blocked = checkAutonomy({ supervisor: input.config.supervisorControl, pause });
  if (blocked) return refusal(proposal.intent, blocked.message);

  // ── Gate 2: provenance ──────────────────────────────────────────────────
  // The router must have echoed the user's words unchanged. A mismatch means
  // the text that reached the model was not the text the user typed, or the
  // model rewrote it; either way its proposal is not about the same request.
  if (!sameWords(proposal.echo, input.userMessage)) {
    return refusal(
      proposal.intent,
      "I could not confirm that the request I routed matches what you typed, so I have not acted on it. Say it again and I will take another look.",
    );
  }

  // A run-scoped conversation does not start runs. Inside run X's panel the
  // request is about X, and launching a sibling is both surprising and
  // genuinely possible: concurrency is not capped on the direct launch path.
  if (proposal.intent === "run.start" && input.scopedRunId) {
    return refusal(
      proposal.intent,
      "This conversation is about a run that is already going, so I have not started another one. I can add it to the task instead, or you can start a separate run from Mission Control.",
    );
  }

  // ── Gate 3: the target must be one we offered ───────────────────────────
  const needsTarget =
    proposal.intent === "checklist.add" || proposal.intent === "run.start";
  if (needsTarget) {
    if (!proposal.targetId || !input.allowedTargetIds.includes(proposal.targetId)) {
      return refusal(
        proposal.intent,
        "I could not match that to one of your tasks, so I have not changed anything. Point me at the task you mean.",
      );
    }
  }

  const roadmap = new RoadmapService(input.projectRoot);
  const broker = createActionBroker(input.projectRoot, SUPERVISOR_AUDIT_RUN);

  if (proposal.intent === "task.create") {
    const title = proposal.title.trim() || input.userMessage.trim().slice(0, 120);
    const task = await roadmap.addTask({ title });
    return {
      reply: `Made a task: "${task.title}".`,
      action: {
        intent: proposal.intent,
        summary: `created task "${task.title}"`,
        targetKind: "task",
        targetId: task.id,
        ok: true,
        error: null,
        undone: false,
      },
    };
  }

  if (proposal.intent === "checklist.add") {
    const taskId = proposal.targetId!;
    const items = proposal.items.map((i) => i.trim()).filter(Boolean);
    if (items.length === 0) {
      return refusal(proposal.intent, "There was nothing concrete to add, so I left the task alone.");
    }
    // A checklist run snapshots its item list at run start, so anything added
    // after that is written to disk and never iterated. Saying "added it, the
    // run is picking it up" would be false.
    const liveRun = await readLiveTaskLockHolder(input.projectRoot, taskId).catch(() => null);
    for (const text of items) {
      await roadmap.addChecklistItem(taskId, text);
    }
    const note = liveRun
      ? " That task has a run in flight, and it works from the list it started with, so these will wait for the next one."
      : "";
    return {
      reply: `Added ${items.length} TODO${items.length === 1 ? "" : "s"}.${note}`,
      action: {
        intent: proposal.intent,
        summary: `added ${items.length} TODO(s) to task ${taskId}`,
        targetKind: "checklist",
        targetId: taskId,
        ok: true,
        error: null,
        undone: false,
      },
    };
  }

  // ── run.start ───────────────────────────────────────────────────────────
  // The most expensive thing the supervisor can do, and the only one that is
  // not reversible: it spends money, takes the task lock, and its agent runs
  // commands on this machine.
  const taskId = proposal.targetId!;
  const action = {
    runId: SUPERVISOR_AUDIT_RUN,
    kind: "run.start" as const,
    subject: { taskId, startedBy: "supervisor" as const },
    proposedBy: "system" as const,
  };
  const gate = await gateAction(broker, action);
  if (!gate.allowed) {
    return refusal(proposal.intent, `A policy stopped this: ${gate.reason}`);
  }
  if (!input.startRun) {
    return refusal(proposal.intent, "Starting runs is not wired up in this context.");
  }
  try {
    // VERBATIM: the run's brief is the user's own words. Never the model's
    // summary of them, which is the seam injected context would use to steer a
    // run the user genuinely asked for.
    const runId = await input.startRun({
      projectRoot: input.projectRoot,
      taskId,
      task: input.userMessage.trim(),
    });
    await broker.record(action, gate.decision, {
      ok: true,
      summary: `started run ${runId} on task ${taskId}`,
    });
    return {
      reply: `Started a run on that task.`,
      action: {
        intent: proposal.intent,
        summary: `started run ${runId} on task ${taskId}`,
        targetKind: "run",
        targetId: runId,
        ok: true,
        error: null,
        undone: false,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await broker.record(action, gate.decision, { ok: false, summary: message });
    return refusal(proposal.intent, `I could not start it: ${message}`);
  }
}

export const executeResultSchema = z.object({
  reply: z.string(),
});
