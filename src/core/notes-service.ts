import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { runDir } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export const noteScopeSchema = z.enum([
  "run",
  "artifact",
  "file",
  "validation",
  "event",
  "stage",
]);
export type NoteScope = z.infer<typeof noteScopeSchema>;

export const noteSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  scope: noteScopeSchema,
  target: z.string().min(1),
  message: z.string().min(1),
  resolved: z.boolean().default(false),
  resolvedAt: z.string().nullable().default(null),
});
export type Note = z.infer<typeof noteSchema>;

const FILE_NAME = "notes.json";

function notesPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), FILE_NAME);
}

async function readNotesFile(projectRoot: string, runId: string): Promise<Note[]> {
  const file = notesPath(projectRoot, runId);
  if (!(await pathExists(file))) return [];
  const text = await readText(file);
  if (!text.trim()) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const arr = z.array(noteSchema).safeParse(raw);
  return arr.success ? arr.data : [];
}

async function writeNotesFile(
  projectRoot: string,
  runId: string,
  notes: Note[],
): Promise<void> {
  const file = notesPath(projectRoot, runId);
  await ensureDir(path.dirname(file));
  await writeText(file, `${JSON.stringify(notes, null, 2)}\n`);
}

export type ListNotesOptions = {
  includeResolved?: boolean;
};

export async function listNotes(
  projectRoot: string,
  runId: string,
  opts: ListNotesOptions = {},
): Promise<Note[]> {
  const notes = await readNotesFile(projectRoot, runId);
  const filtered = opts.includeResolved
    ? notes
    : notes.filter((n) => !n.resolved);
  // Unresolved first, newest first within group.
  return [...filtered].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export type AddNoteInput = {
  scope: NoteScope;
  target: string;
  message: string;
};

export async function addNote(
  projectRoot: string,
  runId: string,
  input: AddNoteInput,
): Promise<Note> {
  const trimmed = input.message.trim();
  if (!trimmed) throw new Error("Note message is empty.");
  const target = input.target.trim();
  if (!target) throw new Error("Note target is empty.");

  const ts = nowIso();
  const note: Note = {
    id: randomUUID(),
    createdAt: ts,
    updatedAt: ts,
    scope: noteScopeSchema.parse(input.scope),
    target,
    message: trimmed,
    resolved: false,
    resolvedAt: null,
  };
  const all = await readNotesFile(projectRoot, runId);
  all.push(note);
  await writeNotesFile(projectRoot, runId, all);
  return note;
}

export async function resolveNote(
  projectRoot: string,
  runId: string,
  noteId: string,
): Promise<Note | null> {
  const all = await readNotesFile(projectRoot, runId);
  const idx = all.findIndex((n) => n.id === noteId);
  if (idx < 0) return null;
  const ts = nowIso();
  const updated: Note = {
    ...all[idx]!,
    resolved: true,
    resolvedAt: ts,
    updatedAt: ts,
  };
  all[idx] = updated;
  await writeNotesFile(projectRoot, runId, all);
  return updated;
}

export async function getNote(
  projectRoot: string,
  runId: string,
  noteId: string,
): Promise<Note | null> {
  const all = await readNotesFile(projectRoot, runId);
  return all.find((n) => n.id === noteId) ?? null;
}
