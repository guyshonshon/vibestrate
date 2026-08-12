// Current project: metadata, setup/init, file tree/read, continuity ledger.
import { jsonGet, jsonPost } from "./http.js";
import type {
  FileTreeResult,
  FileView,
  ProjectMetadata,
} from "../types.js";
import type {
  LedgerStateDto,
  LedgerEntryDto,
  ManualLedgerEntryInput,
} from "./types.js";

export const projectApi = {
  async getProjectMetadata(): Promise<ProjectMetadata> {
    const r = await jsonGet<{ metadata: ProjectMetadata }>(
      "/api/project/metadata",
    );
    return r.metadata;
  },
  async getSetupStatus(): Promise<{
    initialized: boolean;
    isGitRepo: boolean;
    projectName: string;
    projectRoot: string;
  }> {
    return jsonGet("/api/setup/status");
  },
  async initProject(input?: { gitInit?: boolean }): Promise<{
    ok: true;
    /** Set when gitInit was requested: what the guarded git-init did. */
    git: {
      ok: boolean;
      initialized: boolean;
      gitignoreWritten: boolean;
      commitSha: string | null;
      commitSkippedReason: string | null;
      error: string | null;
    } | null;
    created: string[];
    detections: {
      id: string;
      label: string;
      available: boolean;
      confidence: "ready" | "detected-needs-setup" | "missing";
      recommended: boolean;
    }[];
    recommendedProvider: string | null;
    providerComplete: boolean;
  }> {
    return jsonPost("/api/setup/init", input ?? {});
  },
  async getProjectTree(input?: {
    depth?: number;
    maxEntries?: number;
    includeHidden?: boolean;
    includeVibestrate?: boolean;
  }): Promise<FileTreeResult> {
    const q = new URLSearchParams();
    if (input?.depth !== undefined) q.set("depth", String(input.depth));
    if (input?.maxEntries !== undefined)
      q.set("maxEntries", String(input.maxEntries));
    if (input?.includeHidden) q.set("includeHidden", "true");
    if (input?.includeVibestrate) q.set("includeVibestrate", "true");
    const qs = q.toString();
    const r = await jsonGet<{ tree: FileTreeResult }>(
      `/api/project/tree${qs ? `?${qs}` : ""}`,
    );
    return r.tree;
  },
  async getProjectFile(input: {
    path: string;
    lineStart?: number;
    lineEnd?: number;
  }): Promise<FileView> {
    const q = new URLSearchParams({ path: input.path });
    if (input.lineStart !== undefined) q.set("lineStart", String(input.lineStart));
    if (input.lineEnd !== undefined) q.set("lineEnd", String(input.lineEnd));
    const r = await jsonGet<{ file: FileView }>(
      `/api/project/file?${q.toString()}`,
    );
    return r.file;
  },
  /** The project continuity ledger - folded state + a plain-text brief. */
  async getLedger(): Promise<{ state: LedgerStateDto; brief: string }> {
    return jsonGet("/api/ledger");
  },
  /** Hand-add a ledger entry - the dashboard "Add entry" form's write path
   *  (same service `vibe ledger add` uses). Returns the server-created entry. */
  async addLedgerEntry(input: ManualLedgerEntryInput): Promise<LedgerEntryDto> {
    const r = await jsonPost<{ ok: true; entry: LedgerEntryDto }>(
      "/api/ledger",
      input,
    );
    return r.entry;
  },
};

/** What version of vibestrate is serving this dashboard. Read from the server
 *  rather than baked into the UI bundle, so a stale tab shows the version that
 *  is actually answering it rather than the one it was built from. */
export const versionApi = {
  async getAppVersion(): Promise<{ version: string }> {
    return jsonGet("/api/version");
  },
};
