// The catalog of flows Vibestrate ships. Each one is a real FlowDefinition
// parsed through `flowDefinitionSchema` at module load, so a malformed builtin
// fails at IMPORT - the whole process, not one run. Project flows under
// `.vibestrate/flows/` are the same shape and a project flow SHADOWS the builtin
// with the same id (that is how forking a builtin works), which makes the ids
// here a user-facing contract, not internal names.
//
// The flows, in short. Most carry their own comment above the export with the
// shape and the reasoning; read that before editing one.
//   default ......... plan -> implement -> validate -> review, with review
//                     findings re-entering `implement` itself. No fixer seat,
//                     no verify turn. What a run resolves when it picks nothing.
//   deep ............ the six-seat pipeline that used to be `default`: adds an
//                     architecture pass, a dedicated fixer answering review
//                     rounds, and an independent verify gate.
//   plan-only ....... plan + review, writes no code.
//   quality-arbitration ... a builder plans and implements, a challenger
//                     reviews the plan and then the diff, the builder answers
//                     the findings, the challenger re-reviews, and an arbiter
//                     writes the decision summary.
//   pickup / pickup-analysis / pickup-review / saga ... checklist flows: the
//                     `checklistSegment` band is the per-item body. It repeats
//                     once per open checklist item when the run is bound to a
//                     card in a checklist mode, and runs once otherwise.
//   panel-review / security-review ... graph flows: a 3-lens read-only review
//                     fan-out plus an arbiter join.
//   express ......... one implementer turn, review gated on the actual diff.
//   scaffold ........ the `params:` / `{{params.x}}` worked example.
//   spec-up-intake / spec-up / spec-up-roadmap ... the hidden 3-link spec chain.
//
// Editing rules that are easy to get wrong:
//   - A new flow has to be listed in `builtinFlows` at the bottom or discovery
//     will not find it. Builtins keep that array's order in the catalog;
//     project-only flows are appended after them.
//   - Any step `needs` puts the WHOLE flow in graph mode, which the schema
//     refuses to combine with an adaptive `loop`. `continueOnError` and
//     `retries` are rejected both outside graph flows and outside turn kinds,
//     so neither can go on a `validation` step even in a graph flow.
//     `skipWhen` is valid on the CHECKING steps only (review-turn and
//     summary-turn), linear-flow only, never in a checklist flow, never inside
//     the loop body.
//   - Steps sharing a `needs` set run concurrently: the schema caps such a
//     group at MAX_PARALLEL_FANOUT and rejects two members writing the same
//     output token, and resolving the flow against a crew rejects any member
//     whose role can write. In a checklist + graph flow all three checks look
//     at the per-item band only, so steps outside the band are never grouped
//     and get none of them.
//   - `hidden: true` removes a flow from user-facing pickers only; it still
//     launches by id.
//   - The leading steps of `spec-up-roadmap` must mirror `spec-up`'s step ids
//     exactly: the roadmap link resumes the spec-up run and seeds each step's
//     artifact by step id, so a renamed id throws at seed time. How MUCH gets
//     seeded is decided by the roadmap flow's own stages - seeding stops at its
//     first "executing" step - so retagging a stage there silently changes the
//     seeded set instead of failing.

import type { FlowDefinition } from "../schemas/flow-schema.js";
import {
  defaultFlow,
  deepFlow,
  planOnlyFlow,
  expressFlow,
  scaffoldFlow,
} from "./flows/core.js";
import {
  qualityArbitrationFlow,
  reviewPanelFlow,
  securityReviewFlow,
} from "./flows/review.js";
import {
  pickupFlow,
  pickupAnalysisFlow,
  pickupReviewFlow,
  sagaFlow,
} from "./flows/checklist.js";
import { researchFlow } from "./flows/research.js";
import {
  specUpIntakeFlow,
  specUpFlow,
  specUpRoadmapFlow,
} from "./flows/spec-up.js";

export * from "./flows/core.js";
export * from "./flows/review.js";
export * from "./flows/checklist.js";
export * from "./flows/spec-up.js";
export * from "./flows/research.js";

export const builtinFlows: readonly FlowDefinition[] = [
  defaultFlow,
  deepFlow,
  planOnlyFlow,
  qualityArbitrationFlow,
  pickupFlow,
  reviewPanelFlow,
  pickupAnalysisFlow,
  pickupReviewFlow,
  sagaFlow,
  securityReviewFlow,
  expressFlow,
  scaffoldFlow,
  researchFlow,
  specUpIntakeFlow,
  specUpFlow,
  specUpRoadmapFlow,
];

export function findBuiltinFlow(id: string): FlowDefinition | null {
  return builtinFlows.find((flow) => flow.id === id) ?? null;
}
