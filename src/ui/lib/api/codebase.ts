// Codebase search, map, annotations, run file trees, code references.
import { jsonGet, jsonPost, jsonPatch, jsonDelete } from "./http.js";
import type {
  CodeReference,
  CodeSearchResult,
  CodebaseMapResult,
  SupervisorSearchResult,
  FileTreeResult,
  FileView,
} from "../types.js";
import type {
  CodebaseAnnotation,
} from "./types.js";

export const codebaseApi = {
  async searchProjectContent(input: {
    query: string;
    regex?: boolean;
    caseSensitive?: boolean;
    include?: string | null;
    exclude?: string | null;
  }): Promise<CodeSearchResult> {
    const r = await jsonPost<{ result: CodeSearchResult }>(
      "/api/project/search",
      input,
    );
    return r.result;
  },
  async searchProjectSupervisor(input: {
    query: string;
  }): Promise<SupervisorSearchResult> {
    const r = await jsonPost<{ result: SupervisorSearchResult }>(
      "/api/project/search/supervisor",
      input,
    );
    return r.result;
  },
  async getCodebaseMap(): Promise<CodebaseMapResult> {
    return jsonGet<CodebaseMapResult>("/api/codebase-map");
  },
  async refreshCodebaseMap(): Promise<CodebaseMapResult> {
    return jsonPost<CodebaseMapResult>("/api/codebase-map/refresh");
  },
  async listAnnotations(input?: {
    path?: string;
    status?: "open" | "resolved";
  }): Promise<CodebaseAnnotation[]> {
    const q = new URLSearchParams();
    if (input?.path) q.set("path", input.path);
    if (input?.status) q.set("status", input.status);
    const qs = q.toString();
    const r = await jsonGet<{ annotations: CodebaseAnnotation[] }>(
      `/api/annotations${qs ? `?${qs}` : ""}`,
    );
    return r.annotations;
  },
  async addAnnotation(input: {
    path: string;
    line?: number | null;
    endLine?: number | null;
    body: string;
    shareWithRoles?: boolean;
  }): Promise<CodebaseAnnotation> {
    const r = await jsonPost<{ annotation: CodebaseAnnotation }>(
      "/api/annotations",
      input,
    );
    return r.annotation;
  },
  async updateAnnotation(
    id: string,
    patch: {
      body?: string;
      shareWithRoles?: boolean;
      status?: "open" | "resolved";
    },
  ): Promise<CodebaseAnnotation> {
    const r = await jsonPatch<{ annotation: CodebaseAnnotation }>(
      `/api/annotations/${encodeURIComponent(id)}`,
      patch,
    );
    return r.annotation;
  },
  async deleteAnnotation(id: string): Promise<void> {
    await jsonDelete<{ ok: true }>(`/api/annotations/${encodeURIComponent(id)}`);
  },
  async getRunTree(runId: string): Promise<FileTreeResult> {
    const r = await jsonGet<{ tree: FileTreeResult }>(
      `/api/runs/${encodeURIComponent(runId)}/tree`,
    );
    return r.tree;
  },
  async getRunFile(input: {
    runId: string;
    path: string;
    lineStart?: number;
    lineEnd?: number;
  }): Promise<FileView> {
    const q = new URLSearchParams({ path: input.path });
    if (input.lineStart !== undefined) q.set("lineStart", String(input.lineStart));
    if (input.lineEnd !== undefined) q.set("lineEnd", String(input.lineEnd));
    const r = await jsonGet<{ file: FileView }>(
      `/api/runs/${encodeURIComponent(input.runId)}/file?${q.toString()}`,
    );
    return r.file;
  },
  async parseCodeReferences(input: {
    text: string;
    runId?: string | null;
  }): Promise<CodeReference[]> {
    const r = await jsonPost<{ references: CodeReference[] }>(
      "/api/code-references",
      input,
    );
    return r.references;
  },
};
