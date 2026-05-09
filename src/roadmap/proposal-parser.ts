/**
 * Plain-text marker parser for proposals produced by the roadmap-planner agent.
 *
 * Format:
 *   AMACO_ROADMAP_ITEM:
 *   TITLE: <required>
 *   DESCRIPTION: <optional>
 *   PRIORITY: low | medium | high
 *   TAGS: <comma-separated>
 *
 *   AMACO_TASK:
 *   TITLE: <required>
 *   ROADMAP: <roadmap title in this proposal, optional>
 *   DESCRIPTION: <optional>
 *   PRIORITY: <optional, derived from RISK if missing>
 *   RISK: low | medium | high (default medium)
 *   DEPENDS_ON: <comma-separated task titles in this proposal, optional>
 *   SKILLS: <comma-separated>
 *   LIKELY_FILES: <comma-separated relative file paths>
 *   VALIDATION: <comma-separated>
 *   TAGS: <comma-separated>
 *
 * The parser is forgiving about blank lines, optional fields, and unknown
 * keys (which become warnings). It is strict about: required TITLE,
 * duplicate roadmap/task titles in the same proposal, and path traversal in
 * LIKELY_FILES.
 */

import type { Priority } from "./roadmap-types.js";

export type ProposalRoadmapDraft = {
  title: string;
  description: string;
  priority: Priority;
  tags: string[];
};

export type ProposalTaskDraft = {
  title: string;
  description: string;
  /** Title of a roadmap item in the same proposal, or null. */
  roadmapTitle: string | null;
  priority: Priority;
  riskLevel: Priority;
  /** Task titles in the same proposal this task depends on. */
  dependencies: string[];
  requiredSkills: string[];
  touchedFiles: string[];
  validationHints: string[];
  tags: string[];
};

export type ProposalParseWarning = {
  taskTitle?: string;
  roadmapTitle?: string;
  message: string;
};

export type ProposalParseError = {
  taskTitle?: string;
  roadmapTitle?: string;
  message: string;
};

export type ProposalParseResult = {
  proposalId: string;
  sourcePath: string | null;
  rawText: string;
  roadmapItems: ProposalRoadmapDraft[];
  tasks: ProposalTaskDraft[];
  /** Edges by task title (source → target, target depends-on source). */
  dependencyEdges: { from: string; to: string }[];
  /**
   * Dependencies that were stripped from tasks because the dependency title
   * is not defined elsewhere in the same proposal. Service-level resolution
   * may still match them against existing tasks; otherwise they are surfaced
   * as fatal errors unless `--allow-unresolved-dependencies` is set.
   */
  unresolvedDependencies: { taskTitle: string; missingTitle: string }[];
  warnings: ProposalParseWarning[];
  errors: ProposalParseError[];
  needsClarification: string | null;
};

const VALID_PRIORITY = new Set<Priority>(["low", "medium", "high"]);

function normalizePriority(
  raw: string | undefined,
  fallback: Priority,
): { value: Priority; warned: boolean } {
  if (!raw) return { value: fallback, warned: false };
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "") return { value: fallback, warned: false };
  if (VALID_PRIORITY.has(trimmed as Priority)) {
    return { value: trimmed as Priority, warned: false };
  }
  return { value: fallback, warned: true };
}

function commaList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isPathSafe(rel: string): boolean {
  if (!rel) return true;
  if (rel.startsWith("/") || rel.startsWith("\\")) return false;
  if (rel.includes("..")) return false;
  // Reject Windows drive letters / file URLs to be safe.
  if (/^[a-zA-Z]:[\\/]/.test(rel)) return false;
  if (rel.startsWith("file://")) return false;
  return true;
}

type Block = {
  kind: "roadmap" | "task" | "needs_clarification";
  startLine: number;
  body: string;
  fields: Map<string, string>;
};

const FIELD_RE = /^([A-Z][A-Z0-9_]*)\s*:\s*(.*)$/;

/** Parse the marker blocks. */
function tokenize(text: string): {
  blocks: Block[];
  warnings: ProposalParseWarning[];
  errors: ProposalParseError[];
  needsClarification: string | null;
} {
  const lines = text.split(/\r?\n/);
  const blocks: Block[] = [];
  const warnings: ProposalParseWarning[] = [];
  const errors: ProposalParseError[] = [];
  let needsClarification: string | null = null;

  let current: Block | null = null;

  const startBlock = (kind: Block["kind"], lineIdx: number): void => {
    if (current) blocks.push(current);
    current = { kind, startLine: lineIdx, body: "", fields: new Map() };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Marker recognises: AMACO_ROADMAP_ITEM:, AMACO_TASK:, END_TASK,
    // AMACO_NEEDS_CLARIFICATION: <text>.
    if (/^AMACO_ROADMAP_ITEM\s*:?\s*$/.test(trimmed)) {
      startBlock("roadmap", i);
      continue;
    }
    if (/^AMACO_TASK\s*:?\s*$/.test(trimmed)) {
      startBlock("task", i);
      continue;
    }
    if (/^END_TASK\s*$/.test(trimmed) || /^END_ROADMAP_ITEM\s*$/.test(trimmed)) {
      if (current) {
        blocks.push(current);
        current = null;
      }
      continue;
    }
    const ncMatch = trimmed.match(/^AMACO_NEEDS_CLARIFICATION\s*:\s*(.+)$/);
    if (ncMatch) {
      needsClarification = ncMatch[1]!.trim();
      continue;
    }

    if (current === null) {
      // Lines outside any block are ignored (allows free Markdown summary).
      continue;
    }
    const block: Block = current;

    if (trimmed === "") {
      block.body += "\n";
      continue;
    }

    const fieldMatch = line.match(FIELD_RE);
    if (fieldMatch) {
      const key = fieldMatch[1]!;
      const value = fieldMatch[2] ?? "";
      // Last write wins. Surface a warning if a field repeats.
      if (block.fields.has(key)) {
        warnings.push({
          message: `Duplicate field "${key}" in ${block.kind} block at line ${
            block.startLine + 1
          }; later value used.`,
        });
      }
      block.fields.set(key, value);
      block.body += line + "\n";
      continue;
    }

    // Continuation line: append to the most recent field value if any.
    const lastKey = [...block.fields.keys()].at(-1);
    if (lastKey) {
      const v = block.fields.get(lastKey) ?? "";
      block.fields.set(lastKey, v ? `${v}\n${line}` : line);
    } else {
      warnings.push({
        message: `Stray text inside ${block.kind} block at line ${i + 1} ignored: "${trimmed.slice(0, 80)}"`,
      });
    }
  }
  if (current) blocks.push(current);

  return { blocks, warnings, errors, needsClarification };
}

const KNOWN_ROADMAP_FIELDS = new Set([
  "TITLE",
  "DESCRIPTION",
  "PRIORITY",
  "TAGS",
]);
const KNOWN_TASK_FIELDS = new Set([
  "TITLE",
  "ROADMAP",
  "DESCRIPTION",
  "PRIORITY",
  "RISK",
  "DEPENDS_ON",
  "SKILLS",
  "LIKELY_FILES",
  "VALIDATION",
  "TAGS",
]);

/**
 * Parse a proposal's raw text into typed drafts. Tolerates partial input:
 * returns errors instead of throwing so callers can show every issue at once.
 */
export function parseProposal(input: {
  proposalId: string;
  sourcePath?: string | null;
  rawText: string;
}): ProposalParseResult {
  const tokenized = tokenize(input.rawText);
  const warnings: ProposalParseWarning[] = [...tokenized.warnings];
  const errors: ProposalParseError[] = [...tokenized.errors];

  const roadmapItems: ProposalRoadmapDraft[] = [];
  const seenRoadmapTitles = new Set<string>();
  const tasks: ProposalTaskDraft[] = [];
  const seenTaskTitles = new Set<string>();

  for (const block of tokenized.blocks) {
    if (block.kind === "needs_clarification") continue;
    if (block.kind === "roadmap") {
      const title = (block.fields.get("TITLE") ?? "").trim();
      if (!title) {
        errors.push({
          message: `Roadmap item is missing TITLE (block at line ${block.startLine + 1}).`,
        });
        continue;
      }
      if (seenRoadmapTitles.has(title)) {
        errors.push({
          roadmapTitle: title,
          message: `Duplicate roadmap item title "${title}" in this proposal.`,
        });
        continue;
      }
      seenRoadmapTitles.add(title);
      const priorityResult = normalizePriority(
        block.fields.get("PRIORITY"),
        "medium",
      );
      if (priorityResult.warned) {
        warnings.push({
          roadmapTitle: title,
          message: `Invalid PRIORITY for "${title}"; defaulting to medium.`,
        });
      }
      // Surface unknown fields once per block.
      for (const key of block.fields.keys()) {
        if (!KNOWN_ROADMAP_FIELDS.has(key)) {
          warnings.push({
            roadmapTitle: title,
            message: `Unknown field "${key}" in roadmap item "${title}"; ignored.`,
          });
        }
      }
      roadmapItems.push({
        title,
        description: (block.fields.get("DESCRIPTION") ?? "").trim(),
        priority: priorityResult.value,
        tags: commaList(block.fields.get("TAGS")),
      });
      continue;
    }

    // task block
    const title = (block.fields.get("TITLE") ?? "").trim();
    if (!title) {
      errors.push({
        message: `Task is missing TITLE (block at line ${block.startLine + 1}).`,
      });
      continue;
    }
    if (seenTaskTitles.has(title)) {
      errors.push({
        taskTitle: title,
        message: `Duplicate task title "${title}" in this proposal.`,
      });
      continue;
    }
    seenTaskTitles.add(title);

    for (const key of block.fields.keys()) {
      if (!KNOWN_TASK_FIELDS.has(key)) {
        warnings.push({
          taskTitle: title,
          message: `Unknown field "${key}" in task "${title}"; ignored.`,
        });
      }
    }

    const riskRes = normalizePriority(block.fields.get("RISK"), "medium");
    if (riskRes.warned) {
      warnings.push({
        taskTitle: title,
        message: `Invalid RISK for "${title}"; defaulting to medium.`,
      });
    }

    const priorityRes = normalizePriority(
      block.fields.get("PRIORITY"),
      riskRes.value, // priority defaults to risk if missing
    );
    if (priorityRes.warned) {
      warnings.push({
        taskTitle: title,
        message: `Invalid PRIORITY for "${title}"; defaulting to ${riskRes.value}.`,
      });
    }

    const likelyFiles = commaList(block.fields.get("LIKELY_FILES"));
    const safeLikelyFiles: string[] = [];
    for (const f of likelyFiles) {
      if (!isPathSafe(f)) {
        errors.push({
          taskTitle: title,
          message: `Unsafe path in LIKELY_FILES for "${title}": ${f}`,
        });
        continue;
      }
      safeLikelyFiles.push(f);
    }

    const dependencies = commaList(block.fields.get("DEPENDS_ON")).filter(
      (d) => d.toLowerCase() !== "none",
    );
    const roadmapTitle = (block.fields.get("ROADMAP") ?? "").trim() || null;

    tasks.push({
      title,
      description: (block.fields.get("DESCRIPTION") ?? "").trim(),
      roadmapTitle,
      priority: priorityRes.value,
      riskLevel: riskRes.value,
      dependencies,
      requiredSkills: commaList(block.fields.get("SKILLS")),
      touchedFiles: safeLikelyFiles,
      validationHints: commaList(block.fields.get("VALIDATION")),
      tags: commaList(block.fields.get("TAGS")),
    });
  }

  const taskTitles = new Set(tasks.map((t) => t.title));
  const roadmapTitles = new Set(roadmapItems.map((r) => r.title));

  // Resolve ROADMAP references — unknown ones become warnings (we don't
  // synthesize phantom items).
  for (const t of tasks) {
    if (t.roadmapTitle && !roadmapTitles.has(t.roadmapTitle)) {
      warnings.push({
        taskTitle: t.title,
        message: `ROADMAP "${t.roadmapTitle}" is not defined in this proposal; task will be created unlinked.`,
      });
      t.roadmapTitle = null;
    }
  }

  // Resolve dependency references. Unknown ones are warnings here AND
  // recorded in `unresolvedDependencies` so the accept service can decide
  // whether to fail or pass through.
  const dependencyEdges: { from: string; to: string }[] = [];
  const unresolvedDependencies: { taskTitle: string; missingTitle: string }[] = [];
  for (const t of tasks) {
    const filtered: string[] = [];
    for (const dep of t.dependencies) {
      if (!taskTitles.has(dep)) {
        warnings.push({
          taskTitle: t.title,
          message: `DEPENDS_ON references unknown task "${dep}"; will not be linked unless it matches an existing task by title.`,
        });
        unresolvedDependencies.push({
          taskTitle: t.title,
          missingTitle: dep,
        });
        continue;
      }
      if (dep === t.title) {
        warnings.push({
          taskTitle: t.title,
          message: `Task "${t.title}" depends on itself; ignored.`,
        });
        continue;
      }
      filtered.push(dep);
      dependencyEdges.push({ from: dep, to: t.title });
    }
    t.dependencies = filtered;
  }

  return {
    proposalId: input.proposalId,
    sourcePath: input.sourcePath ?? null,
    rawText: input.rawText,
    roadmapItems,
    tasks,
    dependencyEdges,
    unresolvedDependencies,
    warnings,
    errors,
    needsClarification: tokenized.needsClarification,
  };
}
