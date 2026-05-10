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
