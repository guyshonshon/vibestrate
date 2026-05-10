import path from "node:path";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { runDir } from "../utils/paths.js";
import {
  type SuggestionBundle,
  suggestionBundlesFileSchema,
} from "./suggestion-bundle-types.js";

export class SuggestionBundleStore {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {}

  get filePath(): string {
    return path.join(
      runDir(this.projectRoot, this.runId),
      "suggestion-bundles.json",
    );
  }

  async readAll(): Promise<SuggestionBundle[]> {
    if (!(await pathExists(this.filePath))) return [];
    const text = await readText(this.filePath);
    if (!text.trim()) return [];
    try {
      return suggestionBundlesFileSchema.parse(JSON.parse(text)).bundles;
    } catch {
      return [];
    }
  }

  async writeAll(bundles: SuggestionBundle[]): Promise<void> {
    const validated = suggestionBundlesFileSchema.parse({ bundles });
    await ensureDir(path.dirname(this.filePath));
    await writeText(
      this.filePath,
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  async upsert(bundle: SuggestionBundle): Promise<void> {
    const all = await this.readAll();
    const idx = all.findIndex((b) => b.id === bundle.id);
    if (idx >= 0) all[idx] = bundle;
    else all.push(bundle);
    await this.writeAll(all);
  }
}
