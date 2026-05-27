import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { amacoRoot } from "../utils/paths.js";
import { readJson, writeJson } from "../utils/json.js";
import { pathExists } from "../utils/fs.js";
import { isSecretLikePath, scanTextForSecrets } from "./diff-service.js";

/**
 * Codebase annotations — external, human-authored notes pinned to a file (and
 * optionally a line or line range). They live in `.amaco/annotations.json`,
 * never inside the source files themselves. When `shareWithRoles` is true and
 * the note is open, the orchestrator injects it into every agent's prompt for a
 * run, so the crew acknowledges the user's guidance ("don't touch this", "this
 * function is the bug"). They are entirely optional.
 */
export class AnnotationError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AnnotationError";
  }
}

export const annotationSchema = z.object({
  id: z.string(),
  /** Project-relative, forward-slash path of the annotated file. */
  path: z.string(),
  /** Anchor line (1-based) or null for a whole-file note. */
  line: z.number().int().positive().nullable(),
  /** End line for a range (1-based, >= line) or null. */
  endLine: z.number().int().positive().nullable(),
  body: z.string(),
  /** When true, the note is injected into agent prompts during runs. */
  shareWithRoles: z.boolean(),
  status: z.enum(["open", "resolved"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CodebaseAnnotation = z.infer<typeof annotationSchema>;

const fileSchema = z.object({ annotations: z.array(annotationSchema) });

const MAX_BODY = 4000;

function annotationsPath(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), "annotations.json");
}

/** Normalise + reject traversal. Throws AnnotationError(400) on a bad path. */
function normaliseRelPath(input: string): string {
  let s = (input ?? "").trim().replace(/\\/g, "/");
  while (s.startsWith("./")) s = s.slice(2);
  while (s.startsWith("/")) s = s.slice(1);
  if (s.endsWith("/") && s.length > 1) s = s.slice(0, -1);
  if (!s) throw new AnnotationError(400, "A file path is required.");
  if (s.split("/").some((seg) => seg === "..")) {
    throw new AnnotationError(400, "Path may not contain '..'.");
  }
  return s;
}

async function load(projectRoot: string): Promise<CodebaseAnnotation[]> {
  const file = annotationsPath(projectRoot);
  if (!(await pathExists(file))) return [];
  try {
    const raw = await readJson<unknown>(file);
    return fileSchema.parse(raw).annotations;
  } catch {
    // A corrupt annotations file must never crash a run; treat as empty.
    return [];
  }
}

async function save(
  projectRoot: string,
  annotations: CodebaseAnnotation[],
): Promise<void> {
  await fs.mkdir(amacoRoot(projectRoot), { recursive: true });
  await writeJson(annotationsPath(projectRoot), { annotations });
}

function newId(): string {
  return `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listAnnotations(
  projectRoot: string,
  filter?: { path?: string; status?: "open" | "resolved" },
): Promise<CodebaseAnnotation[]> {
  let all = await load(projectRoot);
  if (filter?.path) {
    const rel = normaliseRelPath(filter.path);
    all = all.filter((a) => a.path === rel);
  }
  if (filter?.status) {
    all = all.filter((a) => a.status === filter.status);
  }
  return all;
}

export type AddAnnotationInput = {
  path: string;
  line?: number | null;
  endLine?: number | null;
  body: string;
  shareWithRoles?: boolean;
};

export async function addAnnotation(
  projectRoot: string,
  input: AddAnnotationInput,
): Promise<CodebaseAnnotation> {
  const rel = normaliseRelPath(input.path);
  if (isSecretLikePath(rel)) {
    throw new AnnotationError(
      403,
      "Refusing to annotate a secret-like file (.env, *.key, etc.).",
    );
  }
  const body = (input.body ?? "").trim();
  if (!body) throw new AnnotationError(400, "Annotation text is required.");
  if (body.length > MAX_BODY) {
    throw new AnnotationError(413, `Annotation is too long (max ${MAX_BODY} characters).`);
  }
  const secrets = scanTextForSecrets(body);
  if (secrets.length > 0) {
    const names = [...new Set(secrets.map((s) => s.pattern))].join(", ");
    throw new AnnotationError(
      422,
      `Annotation looks like it contains a secret (${names}). Remove it and try again.`,
    );
  }
  const { line, endLine } = normaliseAnchor(input.line ?? null, input.endLine ?? null);
  const now = new Date().toISOString();
  const annotation: CodebaseAnnotation = {
    id: newId(),
    path: rel,
    line,
    endLine,
    body,
    shareWithRoles: input.shareWithRoles ?? true,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  const all = await load(projectRoot);
  all.push(annotation);
  await save(projectRoot, all);
  return annotation;
}

function normaliseAnchor(
  line: number | null,
  endLine: number | null,
): { line: number | null; endLine: number | null } {
  if (line === null) {
    if (endLine !== null) {
      throw new AnnotationError(400, "A line range needs a start line.");
    }
    return { line: null, endLine: null };
  }
  if (!Number.isInteger(line) || line < 1) {
    throw new AnnotationError(400, "Line must be a positive integer.");
  }
  if (endLine === null) return { line, endLine: null };
  if (!Number.isInteger(endLine) || endLine < 1) {
    throw new AnnotationError(400, "End line must be a positive integer.");
  }
  if (endLine < line) {
    throw new AnnotationError(400, "End line must be on or after the start line.");
  }
  // Collapse a one-line "range" to a single-line anchor.
  return { line, endLine: endLine === line ? null : endLine };
}

export type UpdateAnnotationInput = {
  body?: string;
  shareWithRoles?: boolean;
  status?: "open" | "resolved";
};

export async function updateAnnotation(
  projectRoot: string,
  id: string,
  patch: UpdateAnnotationInput,
): Promise<CodebaseAnnotation> {
  const all = await load(projectRoot);
  const idx = all.findIndex((a) => a.id === id);
  if (idx < 0) throw new AnnotationError(404, "Annotation not found.");
  const current = all[idx]!;
  let body = current.body;
  if (patch.body !== undefined) {
    body = patch.body.trim();
    if (!body) throw new AnnotationError(400, "Annotation text is required.");
    if (body.length > MAX_BODY) {
      throw new AnnotationError(413, `Annotation is too long (max ${MAX_BODY} characters).`);
    }
    if (scanTextForSecrets(body).length > 0) {
      throw new AnnotationError(422, "Annotation looks like it contains a secret. Remove it and try again.");
    }
  }
  const updated: CodebaseAnnotation = {
    ...current,
    body,
    shareWithRoles: patch.shareWithRoles ?? current.shareWithRoles,
    status: patch.status ?? current.status,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  await save(projectRoot, all);
  return updated;
}

export async function deleteAnnotation(
  projectRoot: string,
  id: string,
): Promise<void> {
  const all = await load(projectRoot);
  const next = all.filter((a) => a.id !== id);
  if (next.length === all.length) {
    throw new AnnotationError(404, "Annotation not found.");
  }
  await save(projectRoot, next);
}

/** Format a single annotation's anchor as `path`, `path:line`, or `path:start-end`. */
export function formatAnchor(a: CodebaseAnnotation): string {
  if (a.line === null) return a.path;
  if (a.endLine === null) return `${a.path}:${a.line}`;
  return `${a.path}:${a.line}-${a.endLine}`;
}

/**
 * Render the shared, open annotations as a prompt section the orchestrator
 * appends to every agent prompt. Returns "" when there's nothing to share, so
 * the caller can skip the section entirely.
 */
export function renderAnnotationsForPrompt(
  annotations: readonly CodebaseAnnotation[],
): string {
  const shared = annotations.filter((a) => a.shareWithRoles && a.status === "open");
  if (shared.length === 0) return "";
  const lines = [
    "# Human Annotations",
    "",
    "The user pinned these notes to the codebase. Treat them as authoritative guidance for this task:",
    "",
  ];
  for (const a of shared) {
    lines.push(`- **${formatAnchor(a)}** — ${a.body.replace(/\s+/g, " ").trim()}`);
  }
  return lines.join("\n");
}
