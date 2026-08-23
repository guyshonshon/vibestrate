// Roadmap proposals: the markdown a planning run leaves under
// `.vibestrate/roadmap/proposals/`, turned into real roadmap items and task
// cards. Parsing lives in proposal-parser.ts; this module is the
// read -> preview -> accept path around it.
//
// A proposal refers to other work BY TITLE (DEPENDS_ON), which shapes both
// halves:
//   - `dryRun` reads only. It resolves leftover titles against the tasks
//     already on the roadmap and collects every problem it can find
//     (unresolved dependency, dependency cycle, parse error) so the caller
//     shows a complete list instead of one error per attempt. `accept` starts
//     by calling it and refuses when it returned any error.
//   - `accept` creates the tasks WITHOUT dependencies first, then patches the
//     resolved title -> id edges in a second pass, because a title can point
//     at a task the same proposal is still creating.
//
// Acceptance is recorded only by the `<id>-accepted.json` sidecar written next
// to the proposal: `listProposals` reports `accepted` from that file existing
// and `accept` refuses a proposal that has one. The proposal markdown is not
// rewritten by either. The sidecar is written last, so a failure part-way
// through leaves no accepted marker behind - and the rollback in the catch
// removes only ids this call created and never touches the proposal file.
// Two limits on that rollback: its roadmap.json read-modify-write is unlocked
// (unlike `upsertRoadmapItem`), so a concurrent add from another process can be
// lost; and it reads through the throwing `readRoadmap`, so a corrupt
// roadmap.json aborts the item cleanup and surfaces the corruption error in
// place of the original failure.

import path from "node:path";
import fs from "node:fs/promises";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import {
  roadmapProposalsDir,
  roadmapProposalSpecFile,
} from "../utils/paths.js";
import { nowIso } from "../utils/time.js";
import { RoadmapStore } from "./roadmap-store.js";
import { RoadmapService } from "./roadmap-service.js";
import {
  parseProposal,
  type ProposalParseResult,
  type ProposalParseWarning,
  type ProposalRoadmapDraft,
  type ProposalTaskDraft,
  type ProposalParseError,
} from "./proposal-parser.js";
import {
  buildDependencyGraph,
  findFirstCycle,
} from "./dependency-graph.js";
import type { Task } from "./roadmap-types.js";

const PROPOSAL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;


/**
 * The approved spec a spec-up proposal was synthesised from, as a
 * project-relative path, or null.
 *
 * Derived from the proposal id rather than passed in by each caller: every
 * accept surface then carries the spec without having to remember to, which is
 * the difference between a rule and a mechanism. A hand-written proposal has no
 * source run and gets null, honestly.
 *
 * It resolves against the spec `createRoadmapProposal` writes beside the
 * proposal, NOT against `spec-up-approved-spec.md` in the source run. That file
 * is written only by `approveSpecUpAndBuild`, which the roadmap path never
 * calls, so looking for it there matched nothing and every card silently got
 * null - the mechanism was in place with no producer behind it. It also could
 * not simply be written into the roadmap run: in a run store that name is the
 * flag `spec-up-artifact-edit` reads to refuse edits, so storing it there would
 * freeze the run's sections as a side effect.
 */
async function resolveProposalSpecRef(
  projectRoot: string,
  proposalId: string,
): Promise<string | null> {
  // Builds a path from the id, so the id must already be validated. Callers go
  // through `accept`, which runs assertProposalId first (no traversal, no
  // separators); assert again rather than trust that from a future caller.
  assertProposalId(proposalId);
  const abs = roadmapProposalSpecFile(projectRoot, proposalId);
  if (!(await pathExists(abs))) return null;
  return path.relative(projectRoot, abs);
}

export class ProposalServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalServiceError";
  }
}

function assertProposalId(id: string): void {
  if (!PROPOSAL_ID_RE.test(id) || id.includes("..")) {
    throw new ProposalServiceError(`Invalid proposal id: ${id}`);
  }
}

export type ProposalSummary = {
  id: string;
  sourcePath: string;
  createdAt: string;
  modifiedAt: string;
  accepted: boolean;
  acceptedAt: string | null;
  byteSize: number;
};

export type ProposalAcceptOptions = {
  dryRun?: boolean;
  allowUnresolvedDependencies?: boolean;
};

export type ProposalAcceptPreview = {
  proposal: ProposalParseResult;
  willCreate: {
    roadmapItems: ProposalRoadmapDraft[];
    tasks: ProposalTaskDraft[];
    dependencyEdges: { from: string; to: string }[];
  };
  warnings: ProposalParseWarning[];
  errors: ProposalParseError[];
  cycle: string[];
  alreadyAccepted: boolean;
};

export type ProposalAcceptResult = {
  proposalId: string;
  createdRoadmapItemIds: string[];
  createdTaskIds: string[];
  dependencyCount: number;
  warnings: ProposalParseWarning[];
  acceptedAt: string;
  auditFilePath: string;
};

type AuditFile = {
  proposalId: string;
  acceptedAt: string;
  createdRoadmapItemIds: string[];
  createdTaskIds: string[];
  warnings: ProposalParseWarning[];
  sourceProposalPath: string;
};

export class ProposalService {
  private readonly roadmap: RoadmapService;
  private readonly store: RoadmapStore;

  constructor(private readonly projectRoot: string) {
    this.roadmap = new RoadmapService(projectRoot);
    this.store = new RoadmapStore(projectRoot);
  }

  async init(): Promise<void> {
    await this.roadmap.init();
  }

  async listProposals(): Promise<ProposalSummary[]> {
    const dir = roadmapProposalsDir(this.projectRoot);
    if (!(await pathExists(dir))) return [];
    const entries = await fs.readdir(dir);
    const out: ProposalSummary[] = [];
    for (const name of entries.sort()) {
      if (!name.endsWith(".md")) continue;
      const id = name.replace(/\.md$/, "");
      if (!PROPOSAL_ID_RE.test(id) || id.includes("..")) continue;
      const sourcePath = path.join(dir, name);
      try {
        const stat = await fs.stat(sourcePath);
        const auditPath = this.auditPath(id);
        const accepted = await pathExists(auditPath);
        let acceptedAt: string | null = null;
        if (accepted) {
          try {
            const audit = JSON.parse(await readText(auditPath)) as Partial<AuditFile>;
            acceptedAt = audit.acceptedAt ?? null;
          } catch {
            // ignore
          }
        }
        out.push({
          id,
          sourcePath,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
          accepted,
          acceptedAt,
          byteSize: stat.size,
        });
      } catch {
        // skip unreadable
      }
    }
    return out;
  }

  async getProposalText(id: string): Promise<string | null> {
    assertProposalId(id);
    return this.store.readProposal(id);
  }

  async parseProposalById(id: string): Promise<ProposalParseResult | null> {
    assertProposalId(id);
    const raw = await this.store.readProposal(id);
    if (raw === null) return null;
    return parseProposal({
      proposalId: id,
      sourcePath: path.join(roadmapProposalsDir(this.projectRoot), `${id}.md`),
      rawText: raw,
    });
  }

  async writeProposalText(id: string, body: string): Promise<string> {
    assertProposalId(id);
    return this.store.writeProposal(id, body);
  }

  /**
   * Build an accept preview. Reads but does not write. Surfaces all errors at
   * once so the UI can show a complete list.
   */
  async dryRun(input: {
    proposalId: string;
    allowUnresolvedDependencies?: boolean;
  }): Promise<ProposalAcceptPreview> {
    assertProposalId(input.proposalId);
    const parsed = await this.parseProposalById(input.proposalId);
    if (!parsed) {
      throw new ProposalServiceError(
        `Proposal "${input.proposalId}" not found.`,
      );
    }

    const errors = [...parsed.errors];
    const warnings = [...parsed.warnings];

    // The parser already stripped unknown DEPENDS_ON entries and recorded
    // them in `parsed.unresolvedDependencies`. Try to resolve them against
    // existing tasks on the roadmap (so a proposal can reference a task by
    // exact title that was created earlier). Anything left over is a fatal
    // error unless the caller passes --allow-unresolved-dependencies.
    const existing = await this.roadmap.listTasks();
    const existingTitles = new Set(existing.map((t) => t.title));
    const stillUnresolved: string[] = [];
    for (const u of parsed.unresolvedDependencies) {
      if (existingTitles.has(u.missingTitle)) {
        // Resolvable against an existing task - patch it back into the
        // proposal draft so accept can wire it up by id.
        const draft = parsed.tasks.find((t) => t.title === u.taskTitle);
        if (draft && !draft.dependencies.includes(u.missingTitle)) {
          draft.dependencies.push(u.missingTitle);
          parsed.dependencyEdges.push({ from: u.missingTitle, to: u.taskTitle });
        }
        continue;
      }
      stillUnresolved.push(`${u.taskTitle}→${u.missingTitle}`);
    }
    if (stillUnresolved.length > 0 && !input.allowUnresolvedDependencies) {
      errors.push({
        message: `Unresolved DEPENDS_ON: ${stillUnresolved.join(", ")}. Re-run with --allow-unresolved-dependencies to skip these links.`,
      });
    }

    // Build a temp graph and check for cycles among the proposed tasks.
    const tempTasks: Task[] = parsed.tasks.map((t) => ({
      id: t.title,
      supervised: { state: "idle", halt: null, invariants: [], pendingRevision: null },
      runOptions: { budget: { maxSpendUsd: null, maxSteps: null } },
      roadmapItemId: null,
      title: t.title,
      description: t.description,
      acceptanceCriteria: t.acceptanceCriteria,
      acceptanceCommands: [],
      specRef: null,
      est: t.est,
      status: "backlog",
      priority: t.priority,
      dependencies: t.dependencies,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      assignedRoles: [],
      requiredSkills: t.requiredSkills,
      validationProfile: null,
      branchName: null,
      worktreePath: null,
      runIds: [],
      currentRunId: null,
      touchedFiles: t.touchedFiles,
      riskLevel: t.riskLevel,
      commentsCount: 0,
      lastEventAt: null,
      profileOverride: null,
      readOnly: false,
      checklist: [],
      needsTesting: false,
      needsTestingReason: null,
      derivedFrom: null,
      archived: false,
      contextSources: [],
      runMode: "plain",
    }));
    const graph = buildDependencyGraph(tempTasks);
    const cycleReport = findFirstCycle(graph);
    if (cycleReport.cyclic) {
      errors.push({
        message: `Cycle detected in proposal dependencies: ${cycleReport.cycle.join(" → ")} → ${cycleReport.cycle[0]}.`,
      });
    }

    const auditExists = await pathExists(this.auditPath(input.proposalId));

    return {
      proposal: parsed,
      willCreate: {
        roadmapItems: parsed.roadmapItems,
        tasks: parsed.tasks,
        dependencyEdges: parsed.dependencyEdges,
      },
      warnings,
      errors,
      cycle: cycleReport.cycle,
      alreadyAccepted: auditExists,
    };
  }

  /**
   * Atomically accept a proposal. Strategy:
   *   1. Parse + validate (errors abort).
   *   2. Create all roadmap items in memory; if all succeed, persist.
   *   3. Create all tasks in memory; if all succeed, persist with dependency
   *      ids resolved.
   *   4. Write the audit file last.
   * If any step fails before persistence, no files are created.
   * If a persistence step fails midway, best-effort rollback of just-created
   * records is attempted, and the failure is surfaced.
   */
  async accept(input: {
    proposalId: string;
    options?: ProposalAcceptOptions;
  }): Promise<ProposalAcceptResult> {
    assertProposalId(input.proposalId);
    await this.init();
    const opts = input.options ?? {};

    const preview = await this.dryRun({
      proposalId: input.proposalId,
      allowUnresolvedDependencies: opts.allowUnresolvedDependencies,
    });

    if (preview.alreadyAccepted) {
      throw new ProposalServiceError(
        `Proposal "${input.proposalId}" was already accepted. The audit file at ${this.auditPath(input.proposalId)} is the record.`,
      );
    }

    if (preview.errors.length > 0) {
      throw new ProposalServiceError(
        `Refusing to accept proposal due to ${preview.errors.length} error(s):\n  - ${preview.errors.map((e) => e.message).join("\n  - ")}`,
      );
    }

    if (opts.dryRun) {
      return {
        proposalId: input.proposalId,
        createdRoadmapItemIds: [],
        createdTaskIds: [],
        dependencyCount: preview.willCreate.dependencyEdges.length,
        warnings: preview.warnings,
        acceptedAt: nowIso(),
        auditFilePath: "",
      };
    }

    // ─── persistence ──────────────────────────────────────────────────────
    const createdRoadmapItemIds: string[] = [];
    const createdTaskIds: string[] = [];
    const titleToTaskId = new Map<string, string>();
    const titleToRoadmapItemId = new Map<string, string>();

    try {
      // Create roadmap items first.
      for (const draft of preview.willCreate.roadmapItems) {
        const item = await this.roadmap.addRoadmapItem({
          title: draft.title,
          description: draft.description,
          priority: draft.priority,
        });
        createdRoadmapItemIds.push(item.id);
        titleToRoadmapItemId.set(draft.title, item.id);
      }

      // Pre-resolve any dependency titles that point at existing tasks.
      const existingByTitle = new Map<string, string>();
      const existing = await this.roadmap.listTasks();
      for (const t of existing) existingByTitle.set(t.title, t.id);
      // The spec these cards were synthesised FROM. `spec-up build` attaches it
      // to the run; the roadmap path dropped it, so a card's run got a summary
      // of a document it was never shown.
      const specRef = await resolveProposalSpecRef(this.projectRoot, input.proposalId);

      // Create tasks WITHOUT dependencies first, then patch dependencies in a
      // second pass so we can resolve titles → ids predictably.
      for (const draft of preview.willCreate.tasks) {
        const t = await this.roadmap.addTask({
          title: draft.title,
          description: draft.description,
          acceptanceCriteria: draft.acceptanceCriteria,
          specRef,
          est: draft.est,
          priority: draft.priority,
          riskLevel: draft.riskLevel,
          roadmapItemId: draft.roadmapTitle
            ? titleToRoadmapItemId.get(draft.roadmapTitle) ?? null
            : null,
          requiredSkills: draft.requiredSkills,
          touchedFiles: draft.touchedFiles,
        });
        createdTaskIds.push(t.id);
        titleToTaskId.set(draft.title, t.id);
      }

      // Patch dependencies now that every title has an id.
      let dependencyCount = 0;
      for (const draft of preview.willCreate.tasks) {
        const taskId = titleToTaskId.get(draft.title);
        if (!taskId) continue;
        const depIds: string[] = [];
        for (const depTitle of draft.dependencies) {
          const id =
            titleToTaskId.get(depTitle) ?? existingByTitle.get(depTitle);
          if (id) {
            depIds.push(id);
            dependencyCount += 1;
          } else if (!opts.allowUnresolvedDependencies) {
            // dryRun caught these, but defend in depth.
            throw new ProposalServiceError(
              `Unresolved dependency at write time: ${draft.title} → ${depTitle}`,
            );
          }
        }
        if (depIds.length > 0) {
          await this.roadmap.patchTask(taskId, { dependencies: depIds });
        }
      }

      // Audit file.
      const acceptedAt = nowIso();
      const auditPath = this.auditPath(input.proposalId);
      const audit: AuditFile = {
        proposalId: input.proposalId,
        acceptedAt,
        createdRoadmapItemIds,
        createdTaskIds,
        warnings: preview.warnings,
        sourceProposalPath:
          preview.proposal.sourcePath ??
          path.join(
            roadmapProposalsDir(this.projectRoot),
            `${input.proposalId}.md`,
          ),
      };
      await ensureDir(roadmapProposalsDir(this.projectRoot));
      await writeText(auditPath, `${JSON.stringify(audit, null, 2)}\n`);

      return {
        proposalId: input.proposalId,
        createdRoadmapItemIds,
        createdTaskIds,
        dependencyCount,
        warnings: preview.warnings,
        acceptedAt,
        auditFilePath: auditPath,
      };
    } catch (err) {
      // Best-effort rollback. We do NOT delete the proposal file or any
      // pre-existing roadmap/task. We only clean up records this transaction
      // created.
      for (const id of createdTaskIds.reverse()) {
        try {
          await this.store.deleteTask(id);
        } catch {
          // ignore
        }
      }
      // Rolling back roadmap items is harder - they live in roadmap.json.
      // For each id we just created, drop it from the file.
      if (createdRoadmapItemIds.length > 0) {
        const file = await this.store.readRoadmap();
        file.items = file.items.filter(
          (i) => !createdRoadmapItemIds.includes(i.id),
        );
        await this.store.writeRoadmap(file);
      }
      if (err instanceof ProposalServiceError) throw err;
      throw new ProposalServiceError(
        `Accept failed; rolled back: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  auditPath(proposalId: string): string {
    return path.join(
      roadmapProposalsDir(this.projectRoot),
      `${proposalId}-accepted.json`,
    );
  }

  async readAuditIfPresent(proposalId: string): Promise<AuditFile | null> {
    assertProposalId(proposalId);
    const p = this.auditPath(proposalId);
    if (!(await pathExists(p))) return null;
    try {
      return JSON.parse(await readText(p)) as AuditFile;
    } catch {
      return null;
    }
  }
}
