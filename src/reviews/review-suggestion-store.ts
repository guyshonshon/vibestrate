// Per-run persistence for review suggestions: a single suggestions.json inside
// the run's own directory. readAll and writeAll both run the file through
// suggestionsFileSchema, so a record that does not match the type is not
// returned from this store and is not written by it.
//
// Behaviours to know before changing this. readAll treats a missing, empty,
// or unparseable file as "no suggestions" rather than throwing, so a corrupt
// file degrades to an empty list instead of taking down whatever is reading it
// - a caller that needs to distinguish "none yet" from "broken" cannot learn it
// here. And upsert is a read-modify-write with no locking of its own, so two
// concurrent upserts against the same run can drop one of the edits unless the
// caller serializes them.

import path from "node:path";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { runDir } from "../utils/paths.js";
import {
  type ReviewSuggestion,
  suggestionsFileSchema,
} from "./review-suggestion-types.js";

export class ReviewSuggestionStore {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {}

  get filePath(): string {
    return path.join(runDir(this.projectRoot, this.runId), "suggestions.json");
  }

  async readAll(): Promise<ReviewSuggestion[]> {
    if (!(await pathExists(this.filePath))) return [];
    const text = await readText(this.filePath);
    if (!text.trim()) return [];
    try {
      const parsed = suggestionsFileSchema.parse(JSON.parse(text));
      return parsed.suggestions;
    } catch {
      return [];
    }
  }

  async writeAll(items: ReviewSuggestion[]): Promise<void> {
    const validated = suggestionsFileSchema.parse({ suggestions: items });
    await ensureDir(path.dirname(this.filePath));
    await writeText(
      this.filePath,
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  async upsert(s: ReviewSuggestion): Promise<void> {
    const all = await this.readAll();
    const idx = all.findIndex((x) => x.id === s.id);
    if (idx >= 0) all[idx] = s;
    else all.push(s);
    await this.writeAll(all);
  }
}
