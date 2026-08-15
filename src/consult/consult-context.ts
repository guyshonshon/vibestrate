// ── Consult context assembly ────────────────────────────────────────────────
//
// Gathers the *controlled* project context the consult answer is allowed to draw
// on. Consult is not a generic chatbot - it answers only from: VIBESTRATE.md,
// project config/policies, recent run evidence, agent-visible annotations,
// (optionally) a named task/run or selected files, and the slice of Vibestrate's
// own documentation the question actually asks about. Every piece is read-only,
// bounded, secret-redacted, and non-fatal: a missing/failed source becomes a note
// and is skipped, never an error.
//
// Two halves, deliberately separate: the PROJECT half (what is true about this
// repo, read from disk) and the PRODUCT half (how Vibestrate works, compiled
// into the bundle - see handbook/handbook-compile.ts). The product half is
// retrieved deterministically and stays silent on questions that are not about
// Vibestrate, so an unrelated question never drags reference pages in.

import { getProjectMetadata } from "../core/context/project-context-service.js";
import { loadProjectManual } from "../project/project-manual.js";
import { loadCodebaseMap, renderCodebaseMapForPrompt } from "../project/codebase-map.js";
import { loadConfig, type LoadedConfig } from "../project/config-loader.js";
import { listAnnotations, renderAnnotationsForPrompt } from "../core/codebase/annotations-service.js";
import { materializeContextSources } from "../core/context/context-sources.js";
import { RoadmapService } from "../roadmap/roadmap-service.js";
import type { RunState } from "../core/state-machine.js";
import { LedgerStore } from "../core/context/project-ledger.js";
import { countSnapshotRuns } from "../core/run/phase-snapshots.js";
import {
  computeConsultSections,
  renderConsultSections,
  consultSectionsEmpty,
  type ConsultSections,
} from "./consult-sections.js";
import { retrieveHandbook, renderHandbookSection } from "./handbook/handbook-retrieval.js";
import { renderSurfaceScreens, type ConsultSurface } from "./consult-surface.js";
import { loadRunsWithMetrics, spendByProvider } from "../core/metrics/run-spend.js";

/** Keep the whole context block well-bounded; consult is a one-shot question. */
const CONTEXT_MAX_BYTES = 96 * 1024;
const RECENT_RUNS = 8;

export type ConsultContextRequest = {
  projectRoot: string;
  /** Where the answer will be read. Required and undefaulted: it decides which
   *  product documentation is eligible at all, and which surface's controls the
   *  answer is given to point at. See consult-surface.ts. */
  surface: ConsultSurface;
  /** The question being asked. Drives handbook retrieval only - omitting it
   *  simply leaves the product-documentation section out. */
  question?: string | null;
  taskId?: string | null;
  runId?: string | null;
  /** Project-relative file paths to include (path-guarded + redacted). */
  files?: string[];
  /** Reuse an already-loaded config (for `rules`) to avoid a re-read. */
  loaded?: LoadedConfig | null;
};

export type ConsultContext = {
  /** The assembled, bounded context block fed to the model. */
  text: string;
  /** Labels of what was actually included - surfaced to the answer's honesty. */
  usedSources: string[];
  /** Non-fatal skips (e.g. a refused file, an unknown task). */
  notes: string[];
  /** Deterministic, code-computed project-state sections: recent activity,
   *  open intents, mentioned-never-worked, suggested next steps. Same project
   *  state => same sections; the model only narrates them. */
  sections: ConsultSections;
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function clampBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  return `${text.slice(0, maxBytes)}\n…[context truncated]`;
}

/** How far back a spend question looks. Seven days is what "this week" means
 *  to someone asking, and it matches the window the Agents page rolls up. */
const SPEND_WINDOW_DAYS = 7;

/**
 * Does this question ask what something cost?
 *
 * Deterministic and narrow on purpose. A false positive costs one extra read of
 * the run metrics; a false negative sends the model to answer a money question
 * with no figures, which is how "how much did claude cost me this week" came
 * back empty. Erring toward loading is the cheaper mistake.
 */
function asksAboutSpend(question: string): boolean {
  // `\$` is matched OUTSIDE the \b group on purpose: \b$\b can never match a
  // dollar sign preceded by a space, because neither side is a word boundary.
  // Written the obvious way it was a branch that could not fire.
  return (
    /\$/.test(question) ||
    /\b(cost|costs|costing|spend|spent|spending|price|pricing|bill|billed|billing|budget|usd|dollars?|burn|burned|expensive)\b/i.test(
      question,
    )
  );
}

function renderRun(r: RunState): string {
  const bits = [
    `status ${r.status}`,
    r.finalDecision ? `review ${r.finalDecision}` : null,
    r.verification ? `verify ${r.verification}` : null,
    r.branchName ? `branch ${r.branchName}` : null,
  ].filter(Boolean);
  return `- "${truncate(r.task, 100)}" (${bits.join(", ")})`;
}

export async function assembleConsultContext(
  req: ConsultContextRequest,
): Promise<ConsultContext> {
  const { projectRoot } = req;
  const sections: string[] = [];
  const usedSources: string[] = [];
  const notes: string[] = [];

  // 1. VIBESTRATE.md - the orchestrator's operating manual.
  const manual = await loadProjectManual(projectRoot);
  if (manual.present && manual.content) {
    sections.push(`## VIBESTRATE.md (project operating manual)\n${manual.content.trim()}`);
    usedSources.push("VIBESTRATE.md");
  } else {
    notes.push(
      "No VIBESTRATE.md - the project has no operating manual yet, so answers rely on config + run evidence only.",
    );
  }

  // 1b. Codebase map (`vibe learn`) - deterministic stack/layout/routes
  // snapshot, so the answer can ground itself in the real repo shape without
  // re-deriving it. Absent (never run `vibe learn`) is normal, not an error.
  const codebaseMap = await loadCodebaseMap(projectRoot).catch(() => ({
    present: false,
    map: null,
    stale: false,
  }));
  if (codebaseMap.present && codebaseMap.map) {
    sections.push(renderCodebaseMapForPrompt(codebaseMap.map, { stale: codebaseMap.stale, maxBytes: 6144 }));
    usedSources.push("codebase-map");
  }

  // 2. Project Instructions (.vibestrate/rules.md) - per-turn guidance.
  const loaded = req.loaded ?? (await loadConfig(projectRoot).catch(() => null));
  const rules = loaded?.rules?.trim();
  if (rules && !/^#\s*Project Instructions for Vibestrate/i.test(rules)) {
    sections.push(`## Project Instructions (rules.md)\n${truncate(rules, 4000)}`);
    usedSources.push("rules.md");
  }

  // 3. Project summary: config, providers/profiles/crews, policies, recent runs.
  const meta = await getProjectMetadata(projectRoot).catch(() => null);
  if (meta) {
    const lines: string[] = [];
    lines.push(`Project: ${meta.projectName} (${meta.projectTypeLabel})`);
    if (meta.git.isGitRepo) {
      lines.push(`Git: branch ${meta.git.currentBranch ?? "?"}${meta.git.headSubject ? ` - "${truncate(meta.git.headSubject, 80)}"` : ""}`);
    }
    lines.push(
      `Validation commands: ${meta.validationCommands.length ? meta.validationCommands.join(" && ") : "(none configured)"}`,
    );
    if (meta.providers.length) {
      lines.push(`Providers: ${meta.providers.map((p) => `${p.id}(${p.type})`).join(", ")}`);
    }
    if (meta.profiles.length) {
      lines.push(
        `Profiles: ${meta.profiles.map((p) => `${p.id}@${p.provider}${p.model ? `/${p.model}` : ""}${p.power ? ` ${p.power}` : ""}`).join(", ")}`,
      );
    }
    if (meta.crews.length) {
      lines.push(`Crews: ${meta.crews.map((c) => `${c.id} (${c.roles.length} roles)`).join(", ")}`);
    }
    lines.push(`Default crew: ${meta.defaultCrew ?? "(none)"}`);
    const pol = meta.policies;
    lines.push(
      `Safety: ${[
        pol.forbidMainBranchWrites && "no-main-writes",
        pol.forbidSecretsAccess && "no-secrets",
        pol.forbidAutoPush && "no-auto-push",
        pol.forbidAutoMerge && "no-auto-merge",
      ]
        .filter(Boolean)
        .join(", ")}${pol.requireApprovalAtStages.length ? `; approval@${pol.requireApprovalAtStages.join("/")}` : ""}`,
    );
    lines.push(
      `Activity: ${meta.counts.runs} runs (${meta.counts.activeRuns} active), ${meta.counts.tasks} tasks, ${meta.counts.queueLength} queued, ${meta.counts.pendingApprovals} pending approvals`,
    );
    sections.push(`## Project configuration & status\n${lines.join("\n")}`);
    usedSources.push("project config");

    // 3b. Spend, when the question is about money.
    //
    // Gated on the question rather than always-on: this reads every run's
    // metrics file off disk, and paying that on "why did the reviewer block
    // this" would be a latency cost for nothing. Same shape as the command
    // check in handbook-retrieval - a deterministic keyword gate, not a model
    // deciding what to load.
    //
    // Retrieval could never answer this. "How much did claude cost me this
    // week" does not want a page about spend, it wants a number computed from
    // the run records, which is why it is a computed section next to Recent
    // runs rather than something the handbook looks up.
    if (asksAboutSpend(req.question ?? "")) {
      const spend = await loadRunsWithMetrics(projectRoot)
        .then((d) => spendByProvider({ ...d, days: SPEND_WINDOW_DAYS }))
        .catch(() => null);
      if (spend && !spend.byProvider.length) {
        // Say so rather than omitting the section. Silence here is what made
        // "how much did claude cost me this week" come back with nothing: the
        // model had no figures AND no statement that there were none, so it had
        // nothing honest to say.
        sections.push(
          `## Spend, last ${SPEND_WINDOW_DAYS} days\nNo cost was recorded for any run in this window. Say that plainly rather than estimating one.`,
        );
        usedSources.push("spend (none recorded)");
      } else if (spend) {
        const rows = spend.byProvider.map(
          (p) =>
            `${p.providerId}: $${p.costUsd.toFixed(2)} across ${p.runs} run${p.runs === 1 ? "" : "s"}`,
        );
        // The estimate wording is load-bearing, not a hedge: `costEstimated`
        // means the figure was tokens times a list price, not something a
        // provider invoiced. Reporting it as fact would overstate what the
        // product knows.
        const basis = spend.estimated
          ? "Estimated from token counts and published list prices, not from a provider invoice. Say so when you quote it."
          : "Reported by the provider CLIs.";
        sections.push(
          `## Spend, last ${spend.days} days\n${rows.join("\n")}\ntotal: $${spend.totalUsd.toFixed(2)}\n${basis}`,
        );
        usedSources.push(`spend (${spend.days}d)`);
      }
    }

    // 4. Recent runs (status + review/verify evidence).
    const recent = meta.recentRuns.slice(0, RECENT_RUNS);
    if (recent.length) {
      sections.push(`## Recent runs (newest first)\n${recent.map(renderRun).join("\n")}`);
      usedSources.push(`recent runs (${recent.length})`);

      // 7. Specific run, when asked.
      if (req.runId) {
        const run = meta.recentRuns.find((r) => r.runId === req.runId);
        if (run) {
          sections.push(`## Focused run ${run.runId}\n${renderRun(run)}${run.error ? `\nerror: ${truncate(run.error, 300)}` : ""}`);
          usedSources.push(`run ${run.runId}`);
        } else {
          notes.push(`Run "${req.runId}" not found among recent runs.`);
        }
      }
    }
  } else {
    notes.push("Project metadata unavailable (project may not be initialized).");
  }

  // 5. Agent-visible annotations.
  const annotations = await listAnnotations(projectRoot, { status: "open" }).catch(() => []);
  const annotationsBlock = renderAnnotationsForPrompt(annotations);
  if (annotationsBlock.trim()) {
    sections.push(`## Human annotations\n${annotationsBlock.trim()}`);
    usedSources.push(`annotations (${annotations.filter((a) => a.shareWithRoles && a.status === "open").length})`);
  }

  // 6. Task / checklist context, when asked.
  if (req.taskId) {
    const task = await new RoadmapService(projectRoot).getTask(req.taskId).catch(() => null);
    if (task) {
      const lines = [
        `Title: ${task.title}`,
        `Status: ${task.status} · Priority: ${task.priority}`,
      ];
      if (task.description.trim()) lines.push(`Description: ${truncate(task.description, 600)}`);
      if (task.checklist.length) {
        lines.push(
          `Checklist (${task.checklist.length}):\n${task.checklist.map((i) => `  - [${i.status}] ${truncate(i.text, 100)}`).join("\n")}`,
        );
      }
      sections.push(`## Focused task ${task.id}\n${lines.join("\n")}`);
      usedSources.push(`task ${task.id}`);
    } else {
      notes.push(`Task "${req.taskId}" not found.`);
    }
  }

  // 8. Selected files (path-guarded, redacted, bounded).
  if (req.files && req.files.length) {
    const materialized = await materializeContextSources({
      sources: req.files.map((ref) => ({ kind: "file" as const, ref })),
      projectRoot,
      worktreePath: null,
      allowUrlFetch: false,
    });
    for (const art of materialized.artifacts) {
      sections.push(`## ${art.label}\n${art.content.trim()}`);
    }
    if (materialized.artifacts.length) usedSources.push(`files (${materialized.artifacts.length})`);
    notes.push(...materialized.notes);
  }

  // 9. The surface's own controls, so the answer has somewhere real to point.
  // Before this block the dashboard answer had no screen names in its context
  // at all, which is why it fell back to "edit .vibestrate/project.yml" for a
  // thing the product has a dedicated editor for.
  const screens = renderSurfaceScreens(req.surface);
  if (screens) {
    sections.push(screens);
    usedSources.push("dashboard screens");
  }

  // 10. Vibestrate's own documentation, narrowed to the question AND to the
  // surface. Deterministic and offline: the corpus is compiled into the bundle,
  // so this reads no files and calls no model. Silent unless the question names
  // Vibestrate vocabulary, which is what keeps an unrelated question ("why did
  // my React build fail") from pulling product pages into the prompt.
  const handbookHits = retrieveHandbook(req.question ?? "", { surface: req.surface });
  const handbookSection = renderHandbookSection(handbookHits);
  if (handbookSection) {
    sections.push(handbookSection);
    usedSources.push(`vibestrate docs (${handbookHits.length})`);
  }

  // Deterministic computed project-state sections: folded from the ledger
  // + roadmap + recent runs, in code. Inserted at the TOP as authoritative
  // context (the model narrates these facts, never invents them) AND returned
  // structured so the CLI/UI render them verbatim.
  const ledgerState = await new LedgerStore(projectRoot).state().catch(() => null);
  const roadmapTasks = await new RoadmapService(projectRoot)
    .listTasks()
    .catch(() => []);
  // Rewind-snapshot growth -> the housekeeping tip (suggests the opt-in
  // retention config; the tool never purges itself).
  const snapshots = await countSnapshotRuns(projectRoot);
  const computedSections = computeConsultSections({
    ledger: ledgerState ?? {
      shipped: [],
      intents: [],
      residuals: [],
      mentions: [],
      decisions: [],
      flags: [],
    },
    roadmapTasks: roadmapTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
    })),
    recentRuns: (meta?.recentRuns ?? []).map((r) => ({
      runId: r.runId,
      displayName: r.displayName,
      task: r.task,
      status: r.status,
    })),
    snapshots,
    snapshotRetentionRuns: loaded?.config.git.snapshotRetentionRuns ?? 0,
  });
  if (!consultSectionsEmpty(computedSections)) {
    sections.unshift(
      `## Project state (computed - authoritative, do not contradict)\n${renderConsultSections(computedSections)}`,
    );
    usedSources.unshift("computed project state");
  }

  return {
    text: clampBytes(sections.join("\n\n"), CONTEXT_MAX_BYTES),
    usedSources,
    notes,
    sections: computedSections,
  };
}
