import { Command } from "commander";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { detectProject } from "../../project/project-detector.js";
import { loadConfig } from "../../project/config-loader.js";
import { color, header, symbol } from "../ui/format.js";
import {
  editSpecUpArtifact,
  readSpecUpSection,
  EDITABLE_SPEC_UP_SECTIONS,
  SpecUpEditError,
} from "../../spec-up/spec-up-artifact-edit.js";
import {
  startSpecUpIntake,
  readSpecUpQuestions,
  submitSpecUpAnswers,
  proceedToSpecUpSpec,
  approveSpecUpAndStartRoadmap,
  approveSpecUpAndBuild,
  createRoadmapProposal,
  SpecUpChainError,
} from "../../spec-up/spec-up-chain.js";
import {
  specUpSimplify,
  specUpSuggest,
  specUpSuggestAll,
  SpecUpAssistError,
} from "../../spec-up/spec-up-assist.js";

function fail(message: string): never {
  console.error(`${symbol.fail()} ${message}`);
  process.exit(1);
}

/** Open the current content in $EDITOR (blocking) and return the edited text. The
 *  sanctioned $EDITOR handoff (no in-shell editor). Splits the env value so
 *  "$EDITOR=code -w" works; no shell, so the temp path is never interpolated. */
async function editViaEditor(initial: string, section: string): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "vibe-specup-edit-"));
  const file = path.join(dir, `${section}.md`);
  try {
    await fsp.writeFile(file, initial, "utf8");
    const raw = (process.env.VISUAL || process.env.EDITOR || "vi").trim();
    const [cmd, ...preArgs] = raw.split(/\s+/);
    const res = spawnSync(cmd!, [...preArgs, file], { stdio: "inherit" });
    if (res.error || (res.status ?? 1) !== 0) {
      fail(`Editor "${raw}" exited abnormally; nothing saved.`);
    }
    return await fsp.readFile(file, "utf8");
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Parse repeatable `--answer id=value` flags into the typed answer-set.
function collectAnswer(value: string, acc: { id: string; answer: string }[]): { id: string; answer: string }[] {
  const eq = value.indexOf("=");
  if (eq <= 0) fail(`--answer must be id=value, got "${value}".`);
  acc.push({ id: value.slice(0, eq).trim(), answer: value.slice(eq + 1).trim() });
  return acc;
}

/**
 * `vibe spec-up` - the CTO planning chain (docs/design/spec-up-phase.md). UI <-> CLI
 * parity: every step the dashboard can do is reachable here. Each link launches a
 * fresh read-only run through the shared core launcher.
 */
export function buildSpecUpCommand(): Command {
  const cmd = new Command("spec-up").description(
    "Plan as a CTO: discovery -> spec -> architecture -> roadmap (a chain of read-only runs).",
  );

  cmd
    .command("start <brief...>")
    .description("Start spec-up: launch the intake run that asks the gap questions.")
    .option("--persona <id>", "supervisor persona (judgment posture) for the run")
    .option("--flow <id>", "the flow to BUILD once the spec is approved (carried to `spec-up build`)")
    .action(async (brief: string[], opts: { persona?: string; flow?: string }) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        const { runId } = await startSpecUpIntake({
          projectRoot,
          task: brief.join(" "),
          persona: opts.persona ?? null,
          targetFlowId: opts.flow ?? null,
        });
        console.log(`${symbol.ok()} ${header("Spec-up: intake started")}`);
        console.log(`Run: ${color.bold(runId)}`);
        console.log(color.dim(`Answer the questions:  vibe spec-up questions ${runId}`));
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
      const pending = await readSpecUpQuestions(projectRoot, runId).catch((err) =>
        fail(err instanceof Error ? err.message : String(err)),
      );
      if (!pending) fail(`No pending spec-up questions for run "${runId}" (yet?).`);
      if (opts.json) {
        console.log(JSON.stringify(pending.questions, null, 2));
        return;
      }
      console.log(header(`Spec-up: gap questions (round ${pending.round})`));
      if (pending.coverageComplete && pending.questions.length === 0) {
        console.log(color.dim("Coverage complete - no more questions."));
        console.log(color.dim(`Build the spec:  vibe spec-up answer ${runId} --proceed`));
        return;
      }
      for (const q of pending.questions) {
        console.log(`\n${color.bold(q.id)}  ${color.dim(`[${q.category}]`)}  ${q.question}`);
        console.log(color.dim(`  why: ${q.why}`));
        if (q.kind === "choice" && q.options.length > 0) {
          console.log(color.dim(`  options: ${q.options.join(" | ")}`));
        }
      }
      console.log(
        color.dim(`\nAnswer:  vibe spec-up answer ${runId} --answer ${pending.questions[0]?.id ?? "id"}="..."`),
      );
      console.log(color.dim(`Unsure?  vibe spec-up simplify ${runId} ${pending.questions[0]?.id ?? "id"}  |  suggest a draft:  vibe spec-up suggest ${runId} ${pending.questions[0]?.id ?? "id"}`));
    });

  cmd
    .command("answer <runId>")
    .description("Answer a round's questions; loops to a gap-check round or builds the spec.")
    .option("--answer <id=value>", "answer for a question id (repeatable)", collectAnswer, [])
    .option("--proceed", "stop questioning and build the spec now (skip further gap-checks)")
    .action(async (runId: string, opts: { answer: { id: string; answer: string }[]; proceed?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        // "Proceed to spec" with no new answers: finalize the accumulated set.
        if (opts.answer.length === 0) {
          if (!opts.proceed) fail("Pass at least one --answer id=value, or --proceed to build now.");
          const { runId: specUpRunId } = await proceedToSpecUpSpec({ projectRoot, sourceRunId: runId });
          console.log(`${header("Spec-up: building the spec")}`);
          console.log(`Run: ${color.bold(specUpRunId)}`);
          return;
        }
        const { runId: nextRunId, action } = await submitSpecUpAnswers({
          projectRoot,
          sourceRunId: runId,
          answers: opts.answer,
          proceed: opts.proceed ?? false,
        });
        if (action === "gap-check") {
          console.log(`${header("Spec-up: more questions coming")}`);
          console.log(`Round run: ${color.bold(nextRunId)}`);
          console.log(color.dim(`See them:  vibe spec-up questions ${nextRunId}  (or build now:  vibe spec-up answer ${runId} --proceed)`));
        } else {
          console.log(`${header("Spec-up: building the spec")}`);
          console.log(`Run: ${color.bold(nextRunId)}`);
          console.log(color.dim("Review the spec/architecture/risks, then approve."));
        }
      } catch (err) {
        if (err instanceof SpecUpChainError) fail(err.message);
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  cmd
    .command("simplify <runId> <questionId>")
    .description("Explain a question in plain language (what it asks + what it affects).")
    .option("--for-non-developer", "add an everyday-life analogy (no jargon)")
    .action(async (runId: string, questionId: string, opts: { forNonDeveloper?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        const r = await specUpSimplify({
          projectRoot,
          sourceRunId: runId,
          questionId,
          forNonDeveloper: opts.forNonDeveloper ?? false,
        });
        console.log(header(`Spec-up: ${questionId}`));
        console.log(r.text);
        console.log(color.dim(`\nWhat it affects: ${r.affects}`));
        if (r.analogy) console.log(color.dim(`Analogy: ${r.analogy}`));
      } catch (err) {
        if (err instanceof SpecUpAssistError || err instanceof SpecUpChainError) fail(err.message);
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  cmd
    .command("suggest <runId> [questionId]")
    .description("Draft an answer grounded in your prior answers (you still decide). --all for every blank.")
    .option("--all", "suggest a draft for every question in the round")
    .action(async (runId: string, questionId: string | undefined, opts: { all?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        if (opts.all) {
          const { items } = await specUpSuggestAll({ projectRoot, sourceRunId: runId });
          console.log(header("Spec-up: suggested drafts (review + edit)"));
          for (const it of items) {
            console.log(`\n${color.bold(it.questionId)}  ${it.suggestedValue}`);
            console.log(color.dim(`  why: ${it.why}`));
          }
          return;
        }
        if (!questionId) fail("Pass a questionId, or --all to suggest for every question.");
        const r = await specUpSuggest({ projectRoot, sourceRunId: runId, questionId });
        console.log(header(`Spec-up: suggested draft for ${questionId}`));
        console.log(r.suggestedValue);
        console.log(color.dim(`\nwhy: ${r.why}`));
        console.log(color.dim(`(a draft - edit it, then:  vibe spec-up answer ${runId} --answer ${questionId}="...")`));
      } catch (err) {
        if (err instanceof SpecUpAssistError || err instanceof SpecUpChainError) fail(err.message);
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  cmd
    .command("approve <specUpRunId>")
    .description("Approve the spec-up draft and launch the roadmap synthesis run.")
    .action(async (specUpRunId: string) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        const { runId } = await approveSpecUpAndStartRoadmap({ projectRoot, specUpRunId });
        console.log(`${header("Spec-up: roadmap run launched")}`);
        console.log(`Run: ${color.bold(runId)}`);
        console.log(color.dim(`When it finishes:  vibe spec-up roadmap ${runId}`));
      } catch (err) {
        if (err instanceof SpecUpChainError) fail(err.message);
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  cmd
    .command("build <specUpRunId>")
    .description("Approve the spec-up draft and BUILD it: run the chosen flow seeded with the approved spec.")
    .option("--flow <id>", "build flow override (default: the flow carried from the spec-up run)")
    .action(async (specUpRunId: string, opts: { flow?: string }) => {
      const { projectRoot } = await detectProject(process.cwd());
      // Mirror the server route: an unbound spec-up run builds with the project
      // default (UI<->CLI parity) rather than erroring.
      let fallbackFlowId = "default";
      try {
        fallbackFlowId = (await loadConfig(projectRoot)).config.defaultFlow ?? "default";
      } catch {
        /* keep "default" */
      }
      try {
        const { runId, flowId } = await approveSpecUpAndBuild({
          projectRoot,
          specUpRunId,
          flowId: opts.flow ?? null,
          fallbackFlowId,
        });
        console.log(`${header("Spec-up: build run launched")}`);
        console.log(`Flow: ${color.bold(flowId)}`);
        console.log(`Run: ${color.bold(runId)}`);
        console.log(color.dim("The flow builds from the approved spec (seeded as run context)."));
      } catch (err) {
        if (err instanceof SpecUpChainError) fail(err.message);
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  cmd
    .command("roadmap <runId>")
    .description("Turn a finished spec-up-roadmap run into a reviewable proposal.")
    .action(async (runId: string) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        const { proposalId } = await createRoadmapProposal({ projectRoot, runId });
        console.log(`${header("Spec-up: roadmap proposal created")}`);
        console.log(`Proposal: ${color.bold(proposalId)}`);
        console.log(color.dim(`Review + accept:  vibe roadmap accept ${proposalId}`));
      } catch (err) {
        if (err instanceof SpecUpChainError) fail(err.message);
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  cmd
    .command("edit <runId> <section>")
    .description(
      "Edit a spec-up section (scope/spec/architecture/risks) before the build, via $EDITOR or --file. Guarded: secret-refusing, blocked after approve.",
    )
    .option("--file <path>", "read the new content from a file instead of opening $EDITOR")
    .action(async (runId: string, section: string, opts: { file?: string }) => {
      const { projectRoot } = await detectProject(process.cwd());
      if (!(EDITABLE_SPEC_UP_SECTIONS as readonly string[]).includes(section)) {
        fail(`"${section}" is not an editable section. Allowed: ${EDITABLE_SPEC_UP_SECTIONS.join(", ")}.`);
      }
      const current = await readSpecUpSection(projectRoot, runId, section);
      if (!current) {
        fail(`No "${section}" artifact for run "${runId}" - is this a spec-up run that produced a spec?`);
      }
      if (current.frozen) {
        fail("This spec-up run was already approved and built - its spec is frozen.");
      }
      let next: string;
      if (opts.file) {
        next = await fsp
          .readFile(opts.file, "utf8")
          .catch(() => fail(`Could not read --file "${opts.file}".`));
      } else {
        next = await editViaEditor(current.content, section);
      }
      if (next === current.content) {
        console.log(color.dim("No change - nothing to save."));
        return;
      }
      try {
        await editSpecUpArtifact({
          projectRoot,
          runId,
          section,
          content: next,
          baseHash: current.hash,
        });
        console.log(`${symbol.ok()} Saved ${color.cyan(section)} for run ${color.cyan(runId)}.`);
      } catch (err) {
        if (err instanceof SpecUpEditError) fail(err.message);
        fail(err instanceof Error ? err.message : String(err));
      }
    });

  return cmd;
}
