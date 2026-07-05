import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import {
  runConsult,
  persistConsultProposal,
  persistConsultPreferenceProposal,
  type ConsultAnswer,
} from "../../consult/consult.js";
import {
  renderConsultSections,
  consultSectionsEmpty,
} from "../../consult/consult-sections.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { startSpinner } from "../ui/spinner.js";

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
    .option("--provider <id>", "answer ad-hoc with this provider (overrides --profile)")
    .option("--model <id>", "model for the ad-hoc provider (requires --provider)")
    .option("--effort <level>", "effort/power for the ad-hoc provider (requires --provider)")
    .option("--json", "emit the full structured result as JSON")
    .action(
      async (
        question: string,
        opts: {
          task?: string;
          run?: string;
          file: string[];
          profile?: string;
          provider?: string;
          model?: string;
          effort?: string;
          json?: boolean;
        },
      ) => {
        const { projectRoot } = await detectProject(process.cwd());
        // The provider/LLM call takes seconds; show live feedback so the CLI
        // doesn't look frozen. Stopped before ANY output (both paths) so the
        // spinner line never interleaves with the answer.
        const spinner = startSpinner("Consulting");
        let result;
        try {
          result = await runConsult({
            projectRoot,
            question,
            taskId: opts.task ?? null,
            runId: opts.run ?? null,
            files: opts.file,
            profileId: opts.profile ?? null,
            providerId: opts.provider ?? null,
            model: opts.model ?? null,
            effort: opts.effort ?? null,
          });
          spinner.stop();
        } catch (err) {
          spinner.stop();
          console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const { answer, usedSources, notes, sections } = result;
        console.log("");
        console.log(`${header("Consult")}  ${color.dim(`· ${confidenceBadge(answer.confidence)}`)}`);
        console.log("");
        console.log(answer.answer.trim());

        // Deterministic project-state sections: computed in code, the same
        // for the same project state - shown verbatim alongside the narration.
        if (!consultSectionsEmpty(sections)) {
          console.log("");
          console.log(header("Project state (computed)"));
          console.log(
            renderConsultSections(sections)
              .split("\n")
              .map((l) => (l.startsWith("### ") ? color.dim(l.slice(4)) : indent(l)))
              .join("\n"),
          );
        }

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
              `${symbol.arrow()} Apply with ${color.bold(`vibe guide apply ${proposalId}`)} (or reject it).`,
            );
          }
        }

        if (answer.proposedPreference) {
          const p = answer.proposedPreference;
          const prefId = await persistConsultPreferenceProposal(projectRoot, result).catch(() => null);
          console.log("");
          console.log(`${header("Proposed preference")} ${color.dim("(pending - the reviewer checks it once you confirm)")}`);
          console.log(indent(color.dim(`why: ${p.rationale}`)));
          console.log(indent(`${p.statement}${p.correction ? ` -> ${p.correction}` : ""}`));
          if (prefId) {
            console.log("");
            console.log(
              `${symbol.arrow()} Confirm with ${color.bold(`vibe preferences confirm <supervisor> ${prefId}`)} (or reject it).`,
            );
          }
        }

        const grounding = answer.usedContext.length ? answer.usedContext : usedSources;
        if (grounding.length) {
          console.log("");
          console.log(color.dim(`Grounded in: ${grounding.join(", ")}`));
        }
        const answeredBy = [
          `${result.providerId}${result.model ? `/${result.model}` : ""}`,
          result.effort ? `effort ${result.effort}` : null,
          result.profileId && result.profileId !== "(ad-hoc)" ? result.profileId : null,
        ]
          .filter(Boolean)
          .join(" · ");
        console.log(color.dim(`Answered by: ${answeredBy}`));
        for (const note of notes) console.log(color.dim(`${symbol.warn()} ${note}`));
      },
    );

  return cmd;
}
