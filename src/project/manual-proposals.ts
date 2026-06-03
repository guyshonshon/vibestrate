// ── VIBESTRATE.md proposals ─────────────────────────────────────────────────
//
// Consult (and, later, the orchestrator) can PROPOSE an improvement to the
// project's operating manual. Proposals are durable, reviewable records under
// `.vibestrate/manual-proposals/` - never auto-applied. A human applies one
// explicitly, which appends its text to VIBESTRATE.md through the guarded writer
// (Action Broker file.write + secret refusal). See responsible-orchestrator.md.

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { manualProposalsDir } from "../utils/paths.js";
import { appendToProjectManual } from "./project-manual.js";
import { VibestrateError } from "../utils/errors.js";

export class ManualProposalError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("MANUAL_PROPOSAL_ERROR", message, cause);
    this.name = "ManualProposalError";
  }
}

export const manualProposalSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string(),
    rationale: z.string().min(1),
    evidence: z.string().default(""),
    suggestedText: z.string().min(1),
    status: z.enum(["open", "applied", "rejected"]).default("open"),
    source: z.string().default("consult"),
  })
  .strict();
export type ManualProposal = z.infer<typeof manualProposalSchema>;

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function fileFor(projectRoot: string, id: string): string {
  if (!ID_RE.test(id)) throw new ManualProposalError(`Invalid proposal id "${id}".`);
  return path.join(manualProposalsDir(projectRoot), `${id}.json`);
}

export type SaveManualProposalInput = {
  rationale: string;
  evidence?: string;
  suggestedText: string;
  source?: string;
  /** Caller-supplied id + timestamp (kept injectable for determinism in tests). */
  id?: string;
  createdAt?: string;
};

export async function saveManualProposal(
  projectRoot: string,
  input: SaveManualProposalInput,
): Promise<ManualProposal> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const id = input.id ?? `mp-${createdAt.replace(/[:.]/g, "-")}`;
  const proposal = manualProposalSchema.parse({
    id,
    createdAt,
    rationale: input.rationale,
    evidence: input.evidence ?? "",
    suggestedText: input.suggestedText,
    status: "open",
    source: input.source ?? "consult",
  });
  await fs.mkdir(manualProposalsDir(projectRoot), { recursive: true });
  await fs.writeFile(fileFor(projectRoot, id), JSON.stringify(proposal, null, 2), "utf8");
  return proposal;
}

export async function getManualProposal(
  projectRoot: string,
  id: string,
): Promise<ManualProposal | null> {
  const raw = await fs.readFile(fileFor(projectRoot, id), "utf8").catch(() => null);
  if (raw === null) return null;
  const parsed = manualProposalSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function listManualProposals(
  projectRoot: string,
  filter?: { status?: ManualProposal["status"] },
): Promise<ManualProposal[]> {
  const dir = manualProposalsDir(projectRoot);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const out: ManualProposal[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(dir, name), "utf8").catch(() => null);
    if (raw === null) continue;
    const parsed = manualProposalSchema.safeParse(JSON.parse(raw));
    if (parsed.success && (!filter?.status || parsed.data.status === filter.status)) {
      out.push(parsed.data);
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function setStatus(
  projectRoot: string,
  id: string,
  status: ManualProposal["status"],
): Promise<ManualProposal> {
  const current = await getManualProposal(projectRoot, id);
  if (!current) throw new ManualProposalError(`No proposal "${id}".`);
  const next = { ...current, status };
  await fs.writeFile(fileFor(projectRoot, id), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Apply a proposal: append its text to VIBESTRATE.md (guarded), then mark it. */
export async function applyManualProposal(
  projectRoot: string,
  id: string,
): Promise<{ proposal: ManualProposal; created: boolean }> {
  const proposal = await getManualProposal(projectRoot, id);
  if (!proposal) throw new ManualProposalError(`No proposal "${id}".`);
  if (proposal.status !== "open") {
    throw new ManualProposalError(`Proposal "${id}" is already ${proposal.status}.`);
  }
  const { created } = await appendToProjectManual(projectRoot, proposal.suggestedText, {
    reason: `apply proposal ${id}`,
  });
  const applied = await setStatus(projectRoot, id, "applied");
  return { proposal: applied, created };
}

export async function rejectManualProposal(
  projectRoot: string,
  id: string,
): Promise<ManualProposal> {
  return setStatus(projectRoot, id, "rejected");
}
