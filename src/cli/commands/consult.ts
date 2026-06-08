import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { runConsult, persistConsultProposal, type ConsultAnswer } from "../../consult/consult.js";
import { color, header, indent, symbol } from "../ui/format.js";

function collect(value: string, acc: string[]): string[] {
  return [...acc, value];
}

function confidenceBadge(c: ConsultAnswer["confidence"]): string {
  if (c === "high") return color.green("confidence: high");
  if (c === "medium") return color.yellow("confidence: medium");
  return color.gray("confidence: low");
}

export function buildConsultCommand(): Command {
  const cmd = new Command("consult").description(
    "Ask the project orchestrator a question, answered from controlled project context (read-only).",
  );

  cmd
    .argument("<question>", "the question to ask about this project")
    .option("--task <id>", "include a task's context (title, status, checklist)")
    .option("--run <id>", "focus a recent run by id")
    .option("--file <path>", "include a project file's content (repeatable)", collect, [])
    .option("--profile <id>", "answer with a specific profile (default: the crew's read-only planner)")
    .option("--json", "emit the full structured result as JSON")
    .action(
      async (
        question: string,
        opts: { task?: string; run?: string; file: string[]; profile?: string; json?: boolean },
      ) => {
        const { projectRoot } = await detectProject(process.cwd());
        let result;
        try {
          result = await runConsult({
            projectRoot,
            question,
            taskId: opts.task ?? null,
            runId: opts.run ?? null,
            files: opts.file,
            profileId: opts.profile ?? null,
          });
        } catch (err) {
          console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const { answer, usedSources, notes } = result;
        console.log("");
        console.log(`${header("Consult")}  ${color.dim(`· ${confidenceBadge(answer.confidence)}`)}`);
        console.log("");
        console.log(answer.answer.trim());

        if (answer.caveats.length) {
          console.log("");
          console.log(color.yellow("Caveats (not verified):"));
          for (const c of answer.caveats) console.log(indent(`${symbol.bullet()} ${c}`));
        }

        if (answer.recommendedActions.length) {
          console.log("");
          console.log(header("Recommended"));
          for (const a of answer.recommendedActions) {
            console.log(indent(`${symbol.arrow()} ${color.cyan(a.kind)}: ${a.detail}`));
          }
        }

        if (answer.proposedManualUpdate) {
          const p = answer.proposedManualUpdate;
          const proposalId = await persistConsultProposal(projectRoot, result).catch(() => null);
          console.log("");
          console.log(`${header("Proposed VIBESTRATE.md update")} ${color.dim("(proposal - not applied)")}`);
          console.log(indent(color.dim(`why: ${p.rationale}`)));
          console.log(indent(color.dim(`evidence: ${p.evidence}`)));
          console.log("");
          console.log(indent(p.suggestedText.trim()));
          if (proposalId) {
            console.log("");
            console.log(
              `${symbol.arrow()} Apply with ${color.bold(`vibe vibestrate apply ${proposalId}`)} (or reject it).`,
            );
          }
        }

        const grounding = answer.usedContext.length ? answer.usedContext : usedSources;
        if (grounding.length) {
          console.log("");
          console.log(color.dim(`Grounded in: ${grounding.join(", ")}`));
        }
        console.log(color.dim(`Answered by: ${result.profileId} (${result.providerId})`));
        for (const note of notes) console.log(color.dim(`${symbol.warn()} ${note}`));
      },
    );

  return cmd;
}
