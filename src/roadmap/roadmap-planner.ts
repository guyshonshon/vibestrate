// ── Roadmap planner: run the local planner provider on a broad goal and save
// the output as a roadmap proposal draft. ONE canonical path shared by the CLI
// (`vibe roadmap plan`) and the dashboard's "Generate proposal" action, so the
// two never diverge. No model API - the configured local provider does the work
// (security model: local CLI providers only).

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { loadConfig } from "../project/config-loader.js";
import { runProvider } from "../providers/provider-runner.js";
import { getCrew, rolesFillingSeat } from "../agents/crew-registry.js";
import { resolvePromptsDir } from "../agents/default-roles.js";
import { ProposalService } from "./proposal-service.js";
import { VibestrateError } from "../utils/errors.js";

export class RoadmapPlanError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("ROADMAP_PLAN_ERROR", message, cause);
    this.name = "RoadmapPlanError";
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** Path-safe, human-readable slug for the default proposal id. */
function slugify(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type GenerateRoadmapProposalInput = {
  projectRoot: string;
  goal: string;
  /** Override the provider id (default: the crew's planner-seat provider). */
  providerId?: string;
  /** Explicit proposal id; default is timestamp + slug. */
  proposalId?: string;
};

/**
 * Plan a roadmap for `goal` and persist it as a reviewable proposal draft.
 * Returns the new proposal id + its file path. Throws RoadmapPlanError for any
 * user-correctable failure (no provider configured, planner non-zero exit, etc).
 */
export async function generateRoadmapProposal(
  input: GenerateRoadmapProposalInput,
): Promise<{ proposalId: string; sourcePath: string }> {
  const goal = input.goal.trim();
  if (!goal) throw new RoadmapPlanError("A goal is required to plan a roadmap.");

  const loaded = await loadConfig(input.projectRoot);

  // Provider = the default crew's planner-seat role (via its Profile), else any.
  const { crew } = getCrew(loaded.config);
  const plannerRole =
    rolesFillingSeat(crew, "planner")[0]?.role ?? Object.values(crew.roles)[0];
  const plannerProvider = plannerRole
    ? loaded.config.profiles[plannerRole.profile]?.provider
    : Object.values(loaded.config.profiles)[0]?.provider;
  if (!plannerProvider) {
    throw new RoadmapPlanError(
      "No planner role/provider configured. Run `vibe init --force` or `vibe provider setup`.",
    );
  }
  const providerId = input.providerId ?? plannerProvider;
  if (!loaded.config.providers[providerId]) {
    throw new RoadmapPlanError(`Provider "${providerId}" is not configured.`);
  }

  // Build the planner prompt: the canonical roadmap-planner template + the goal.
  const { dir, tried } = await resolvePromptsDir(here);
  if (!dir) {
    throw new RoadmapPlanError(
      `Could not locate the roadmap-planner prompt template. Looked in:\n${tried.join("\n")}`,
    );
  }
  const template = await fs.readFile(
    path.join(dir, "roadmap-planner.md"),
    "utf8",
  );
  const prompt = `${template}\n\n# Broad goal\n\n${goal}\n`;

  const result = await runProvider(loaded.config.providers, {
    providerId,
    prompt,
    cwd: input.projectRoot,
  });
  if (result.exitCode !== 0) {
    const detail = result.stderr?.trim() ? ` ${result.stderr.trim()}` : "";
    throw new RoadmapPlanError(`Planner exited with code ${result.exitCode}.${detail}`);
  }

  const ps = new ProposalService(input.projectRoot);
  await ps.init();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  const id = (input.proposalId ?? `${ts}-${slugify(goal)}`).replace(/^-+|-+$/g, "");
  // The normalized response text, not raw stdout (stream-json providers emit
  // event JSONL on stdout, not the plan body).
  const sourcePath = await ps.writeProposalText(id, result.normalized.responseText);
  return { proposalId: id, sourcePath };
}
