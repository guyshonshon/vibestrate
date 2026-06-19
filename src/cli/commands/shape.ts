import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { color, header, symbol } from "../ui/format.js";
import {
  startShapeIntake,
  readShapeQuestions,
  submitShapeAnswers,
  approveShapeAndStartRoadmap,
  createRoadmapProposal,
  ShapeChainError,
} from "../../shape/shape-chain.js";

function fail(message: string): never {
  console.error(`${symbol.fail()} ${message}`);
  process.exit(1);
}

// Parse repeatable `--answer id=value` flags into the typed answer-set.
function collectAnswer(value: string, acc: { id: string; answer: string }[]): { id: string; answer: string }[] {
  const eq = value.indexOf("=");
  if (eq <= 0) fail(`--answer must be id=value, got "${value}".`);
  acc.push({ id: value.slice(0, eq).trim(), answer: value.slice(eq + 1).trim() });
  return acc;
}

/**
 * `vibe shape` - the CTO planning chain (docs/design/shape-phase.md). UI <-> CLI
 * parity: every step the dashboard can do is reachable here. Each link launches a
 * fresh read-only run through the shared core launcher.
 */
export function buildShapeCommand(): Command {
  const cmd = new Command("shape").description(
    "Plan as a CTO: discovery -> spec -> architecture -> roadmap (a chain of read-only runs).",
  );

  cmd
    .command("start <brief...>")
    .description("Start shaping: launch the intake run that asks the gap questions.")
    .option("--persona <id>", "supervisor persona (judgment posture) for the run")
    .action(async (brief: string[], opts: { persona?: string }) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        const { runId } = await startShapeIntake({
          projectRoot,
          task: brief.join(" "),
          persona: opts.persona ?? null,
        });
        console.log(`${symbol.ok()} ${header("Shape: intake started")}`);
        console.log(`Run: ${color.bold(runId)}`);
        console.log(color.dim(`Answer the questions:  vibe shape questions ${runId}`));
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  cmd
    .command("questions <runId>")
    .description("Show the intake run's gap questions (and their ids).")
    .option("--json", "emit the questions as JSON")
    .action(async (runId: string, opts: { json?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const pending = await readShapeQuestions(projectRoot, runId).catch((err) =>
        fail(err instanceof Error ? err.message : String(err)),
      );
      if (!pending) fail(`No pending shape questions for run "${runId}" (yet?).`);
      if (opts.json) {
        console.log(JSON.stringify(pending.questions, null, 2));
        return;
      }
      console.log(header("Shape: gap questions"));
      for (const q of pending.questions) {
        console.log(`\n${color.bold(q.id)}  ${q.question}`);
        console.log(color.dim(`  why: ${q.why}`));
        if (q.kind === "choice" && q.options.length > 0) {
          console.log(color.dim(`  options: ${q.options.join(" | ")}`));
        }
      }
      console.log(
        color.dim(`\nAnswer:  vibe shape answer ${runId} --answer ${pending.questions[0]?.id ?? "id"}="..."`),
      );
    });

  cmd
    .command("answer <runId>")
    .description("Answer the intake questions and launch the shape run.")
    .option("--answer <id=value>", "answer for a question id (repeatable)", collectAnswer, [])
    .action(async (runId: string, opts: { answer: { id: string; answer: string }[] }) => {
      if (opts.answer.length === 0) fail("Pass at least one --answer id=value.");
      const { projectRoot } = await detectProject(process.cwd());
      try {
        const { runId: shapeRunId } = await submitShapeAnswers({
          projectRoot,
          sourceRunId: runId,
          answers: opts.answer,
        });
        console.log(`${header("Shape: shaping run launched")}`);
        console.log(`Run: ${color.bold(shapeRunId)}`);
        console.log(color.dim("Review the spec/architecture/risks, then:  vibe roadmap ... (after approval)"));
      } catch (err) {
        if (err instanceof ShapeChainError) fail(err.message);
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  cmd
    .command("approve <shapeRunId>")
    .description("Approve the shaped draft and launch the roadmap synthesis run.")
    .action(async (shapeRunId: string) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        const { runId } = await approveShapeAndStartRoadmap({ projectRoot, shapeRunId });
        console.log(`${header("Shape: roadmap run launched")}`);
        console.log(`Run: ${color.bold(runId)}`);
        console.log(color.dim(`When it finishes:  vibe shape roadmap ${runId}`));
      } catch (err) {
        if (err instanceof ShapeChainError) fail(err.message);
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  cmd
    .command("roadmap <runId>")
    .description("Turn a finished shape-roadmap run into a reviewable proposal.")
    .action(async (runId: string) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        const { proposalId } = await createRoadmapProposal({ projectRoot, runId });
        console.log(`${header("Shape: roadmap proposal created")}`);
        console.log(`Proposal: ${color.bold(proposalId)}`);
        console.log(color.dim(`Review + accept:  vibe roadmap accept ${proposalId}`));
      } catch (err) {
        if (err instanceof ShapeChainError) fail(err.message);
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  return cmd;
}
