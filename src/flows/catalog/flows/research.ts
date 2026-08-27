// A flow that produces no code.
//
// THE SPIKE, AND WHAT IT ANSWERS
//
// Everything shipped so far assumes the work is a diff: the default flow
// validates by running your test commands, review reads a patch, and the run
// ends `merge_ready`. The open question was whether the machinery is actually
// code-shaped or only ever *looked* code-shaped because every flow was.
//
// It is not. A run is: seats, steps, artifacts, a review turn, a verdict. None
// of that mentions a diff. What a non-code flow needs is exactly two things the
// engine already has - `outputs` that do not include `diff`, and no validation
// step - and it needs one thing it does NOT have: a way to say "there is nothing
// to compile here, and that is the finished state rather than a missing one".
// `run-assurance` already models that as validation `not_applicable`, which is
// what makes this honest rather than a run that quietly looks under-checked.
//
// So this is a real flow, not a demo. `vibe run "..." --flow research` produces
// a written answer with its sources named, reviewed by a second seat for
// whether the claims are actually supported. Marketing copy, an image brief and
// a literature review are the same shape; the parameters differ, not the
// machinery.
//
// WHAT IT DELIBERATELY DOES NOT DO: touch the worktree. Every seat here is
// read-only, so the "isolated copy of your repo" guarantee is untouched and a
// research run cannot leave a diff behind to be merged by accident.
import { flowDefinitionSchema } from "../../schemas/flow-schema.js";

export const researchFlow = flowDefinitionSchema.parse({
  id: "research",
  version: 1,
  label: "Research (no code)",
  description:
    "Answer a question in writing, with sources, checked by a second seat for whether the claims are actually supported. Produces a document, not a diff - nothing is written to your repository.",
  params: {
    audience: {
      type: "enum",
      values: ["engineer", "manager", "non-technical"],
      default: "engineer",
      description: "Who the answer is written for - sets the register, not the rigour.",
    },
    depth: {
      type: "enum",
      values: ["brief", "standard", "thorough"],
      default: "standard",
      description: "How far to go: a paragraph, a page, or an argued piece.",
    },
  },
  // SEATS THE DEFAULT CREW ALREADY FILLS. The first cut invented `researcher`
  // and `checker`, and the flow could not start at all: seat resolution throws
  // before a run begins when no role takes a seat, so a built-in flow with
  // novel seat names is a flow nobody can run without editing their crew first.
  // `planner` reads and writes nothing, `reviewer` checks work it did not do -
  // which is exactly the shape this needs.
  // tests/flows/builtin-seats.test.ts now holds that line for every built-in.
  seats: {
    planner: {
      label: "Researcher",
      description: "Answers the question and names what the answer rests on.",
    },
    reviewer: {
      label: "Fact-checker",
      description: "Reads the answer cold and challenges any claim its sources do not carry.",
    },
  },
  steps: [
    {
      id: "research",
      label: "Research",
      kind: "agent-turn",
      seat: "planner",
      stage: "executing",
      instructions:
        "Answer the question in the task brief for a {{params.audience}} audience, at {{params.depth}} length. " +
        "Cite what each claim rests on - a file in this repository, a named source, or your own reasoning, " +
        "labelled as such. Where you are uncertain, say so in the text rather than omitting it. " +
        "Do not modify any file: the answer IS the output.",
      inputs: ["task-brief"],
      // No `diff`: nothing is written, so there is nothing to validate or merge.
      outputs: ["execution"],
    },
    {
      id: "check",
      label: "Fact-check",
      // Without this the two steps have no declared order, so the scheduler
      // treats them as a parallel group and the check runs against an answer
      // that does not exist yet - which it then, correctly, blocks. A step that
      // consumes another's output has to say so.
      needs: ["research"],
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      instructions:
        "Read the answer cold. For each substantive claim, decide whether what it rests on actually supports it. " +
        "CHANGES_REQUESTED for a claim presented as fact that its stated source does not carry, or for an " +
        "unlabelled guess. Do not request changes for style, length or register - those were parameters, not mistakes.",
      inputs: ["task-brief", "execution"],
      // `review-decision`, not `review`. The verdict is only read off a
      // review-turn that declares one of the decision outputs; a step that
      // declares plain "review" has its DECISION line silently ignored and the
      // run ends BLOCKED on the fail-closed default, with an APPROVED artifact
      // sitting on disk saying otherwise. flow-schema now refuses that at load.
      outputs: ["findings", "review-decision"],
    },
    {
      id: "verify",
      label: "Verify",
      kind: "summary-turn",
      seat: "reviewer",
      stage: "verifying",
      needs: ["check"],
      instructions:
        "Decide whether the answer is usable as it stands. VERIFICATION: PASSED when the fact-check is " +
        "satisfied and the answer addresses the question asked. FAILED when it does not. NEEDS_HUMAN when " +
        "the question turns on a judgement no source settles.",
      inputs: ["task-brief", "execution", "review"],
      outputs: ["verification"],
    },
  ],
});
