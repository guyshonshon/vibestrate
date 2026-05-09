import { Command } from "commander";
import { runApprovalsList } from "./list.js";
import { runApprovalsShow } from "./show.js";
import { runApprovalsDecide } from "./decide.js";

export function buildApprovalsCommand(): Command {
  const cmd = new Command("approvals").description(
    "Inspect and resolve human-approval requests for a paused run.",
  );

  cmd
    .command("list <runId>")
    .description("Show all approval requests for a run.")
    .option("--json", "emit JSON")
    .action(async (runId: string, opts: { json?: boolean }) => {
      const code = await runApprovalsList(runId, { json: opts.json });
      process.exit(code);
    });

  cmd
    .command("show <runId> <approvalId>")
    .description("Show a single approval request in detail.")
    .option("--json", "emit JSON")
    .action(
      async (runId: string, approvalId: string, opts: { json?: boolean }) => {
        const code = await runApprovalsShow(runId, approvalId, { json: opts.json });
        process.exit(code);
      },
    );

  cmd
    .command("approve <runId> <approvalId>")
    .description("Approve a pending approval. Resumes the run if it is waiting.")
    .option("--note <text>", "decision note recorded in approvals.json")
    .action(
      async (runId: string, approvalId: string, opts: { note?: string }) => {
        const code = await runApprovalsDecide("approve", runId, approvalId, opts);
        process.exit(code);
      },
    );

  cmd
    .command("reject <runId> <approvalId>")
    .description("Reject a pending approval. The run will be marked `blocked`.")
    .option("--note <text>", "decision note recorded in approvals.json")
    .action(
      async (runId: string, approvalId: string, opts: { note?: string }) => {
        const code = await runApprovalsDecide("reject", runId, approvalId, opts);
        process.exit(code);
      },
    );

  return cmd;
}
