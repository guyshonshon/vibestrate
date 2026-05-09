import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { runDir } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";
import {
  approvalRequestSchema,
  type ApprovalRequest,
  type ApprovalRisk,
  type ApprovalSource,
} from "./approval-types.js";

const APPROVALS_FILE = "approvals.json";

function approvalsPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), APPROVALS_FILE);
}

const fileSchema = z.array(approvalRequestSchema);

export class ApprovalService {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {}

  get filePath(): string {
    return approvalsPath(this.projectRoot, this.runId);
  }

  async readAll(): Promise<ApprovalRequest[]> {
    if (!(await pathExists(this.filePath))) return [];
    const raw = await readText(this.filePath);
    if (!raw.trim()) return [];
    try {
      return fileSchema.parse(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  async writeAll(items: ApprovalRequest[]): Promise<void> {
    const validated = fileSchema.parse(items);
    await ensureDir(path.dirname(this.filePath));
    await writeText(this.filePath, `${JSON.stringify(validated, null, 2)}\n`);
  }

  async list(): Promise<ApprovalRequest[]> {
    const all = await this.readAll();
    // Pending first, then most-recent first.
    return [...all].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  async get(id: string): Promise<ApprovalRequest | null> {
    const all = await this.readAll();
    return all.find((a) => a.id === id) ?? null;
  }

  async firstPending(): Promise<ApprovalRequest | null> {
    const all = await this.readAll();
    return all.find((a) => a.status === "pending") ?? null;
  }

  async create(input: {
    stageId: string;
    agentId: string;
    reason: string | null;
    prompt: string | null;
    sourceArtifactPath: string | null;
    requestedAction: string | null;
    riskLevel?: ApprovalRisk;
    source?: ApprovalSource;
    alsoRequiredByPolicy?: boolean;
    userMessage?: string | null;
  }): Promise<ApprovalRequest> {
    const ts = nowIso();
    const req: ApprovalRequest = {
      id: randomUUID(),
      runId: this.runId,
      stageId: input.stageId,
      agentId: input.agentId,
      createdAt: ts,
      updatedAt: ts,
      status: "pending",
      reason: input.reason,
      prompt: input.prompt,
      sourceArtifactPath: input.sourceArtifactPath,
      requestedAction: input.requestedAction,
      riskLevel: input.riskLevel ?? "medium",
      source: input.source ?? "agent",
      alsoRequiredByPolicy: input.alsoRequiredByPolicy ?? false,
      userMessage: input.userMessage ?? null,
      resolvedAt: null,
      resolvedBy: null,
      decisionNote: null,
    };
    const all = await this.readAll();
    all.push(req);
    await this.writeAll(all);
    return req;
  }

  async approve(input: {
    approvalId: string;
    decidedBy?: string;
    note?: string | null;
  }): Promise<ApprovalRequest> {
    return this.resolve({
      ...input,
      status: "approved",
    });
  }

  async reject(input: {
    approvalId: string;
    decidedBy?: string;
    note?: string | null;
  }): Promise<ApprovalRequest> {
    return this.resolve({
      ...input,
      status: "rejected",
    });
  }

  private async resolve(input: {
    approvalId: string;
    status: "approved" | "rejected";
    decidedBy?: string;
    note?: string | null;
  }): Promise<ApprovalRequest> {
    const all = await this.readAll();
    const idx = all.findIndex((a) => a.id === input.approvalId);
    if (idx < 0) {
      throw new Error(`Approval "${input.approvalId}" not found.`);
    }
    const current = all[idx]!;
    if (current.status !== "pending") {
      throw new Error(
        `Approval "${input.approvalId}" is already ${current.status}; refusing to overwrite.`,
      );
    }
    const ts = nowIso();
    const updated: ApprovalRequest = {
      ...current,
      status: input.status,
      updatedAt: ts,
      resolvedAt: ts,
      resolvedBy: input.decidedBy ?? "local-user",
      decisionNote: input.note ?? null,
    };
    all[idx] = updated;
    await this.writeAll(all);
    return updated;
  }

  async waitForResolution(
    approvalId: string,
    opts: { pollMs?: number; signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<ApprovalRequest> {
    const pollMs = opts.pollMs ?? 1500;
    const startedAt = Date.now();
    while (true) {
      if (opts.signal?.aborted) {
        throw new Error("Approval wait aborted.");
      }
      const current = await this.get(approvalId);
      if (!current) {
        throw new Error(
          `Approval "${approvalId}" disappeared from approvals.json.`,
        );
      }
      if (current.status !== "pending") return current;
      if (opts.timeoutMs && Date.now() - startedAt > opts.timeoutMs) {
        // Mark expired and return.
        const all = await this.readAll();
        const idx = all.findIndex((a) => a.id === approvalId);
        if (idx >= 0 && all[idx]!.status === "pending") {
          const ts = nowIso();
          const expired: ApprovalRequest = {
            ...all[idx]!,
            status: "expired",
            updatedAt: ts,
            resolvedAt: ts,
            resolvedBy: "system-timeout",
          };
          all[idx] = expired;
          await this.writeAll(all);
          return expired;
        }
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
}
