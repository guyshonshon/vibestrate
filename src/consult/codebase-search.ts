import { z } from "zod";
import { runAssist, type AssistProviderRunner } from "../assist/assist-runner.js";
import { loadConfig } from "../project/config-loader.js";
import { listCodebaseFiles } from "../core/codebase-search-service.js";

/**
 * Natural-language file search: "the file that handles login" -> the supervisor
 * ranks the repo's tracked files by relevance and explains why, plus grep terms
 * to drill in. It is handed only the file PATH list (never contents), and any
 * path the model invents is dropped, so the answer can only point at real files.
 */

export const supervisorSearchSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string(),
        reason: z.string().default(""),
      }),
    )
    .default([]),
  searchTerms: z.array(z.string()).default([]),
  summary: z.string().default(""),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  caveats: z.array(z.string()).default([]),
});

export type SupervisorSearch = z.infer<typeof supervisorSearchSchema>;

const SCHEMA_HINT = `{
  "files": [{"path": "src/auth/login.ts", "reason": "defines handleLogin, the password-auth entry point"}],
  "searchTerms": ["handleLogin", "session cookie"],
  "summary": "one-line answer to the question",
  "confidence": "low|medium|high",
  "caveats": ["anything you're unsure about"]
}`;

function buildInstruction(query: string, paths: string[], truncated: boolean): string {
  return [
    `You are helping a developer find files in a codebase by intent, not exact name.`,
    `Their question: "${query}"`,
    ``,
    `Here is the list of tracked file paths in the repository${truncated ? " (truncated)" : ""}:`,
    paths.join("\n"),
    ``,
    `Pick the files most likely to answer the question - ranked best first, at`,
    `most 8. For each, give a one-sentence reason grounded in the path/name.`,
    `Only use paths that appear verbatim in the list above; never invent a path.`,
    `Also suggest a few concrete grep search terms that would surface the`,
    `relevant code. If nothing fits, return an empty files list and say so in the`,
    `summary.`,
  ].join("\n");
}

export type SupervisorSearchResult = {
  result: SupervisorSearch;
  providerId: string;
  profileId: string;
  model: string | null;
  effort: string | null;
  /** Files considered (size of the candidate list handed to the model). */
  candidateCount: number;
  candidatesTruncated: boolean;
};

export class CodebaseSearchError extends Error {}

export async function supervisorFileSearch(input: {
  projectRoot: string;
  query: string;
  profileId?: string | null;
  providerId?: string | null;
  model?: string | null;
  effort?: string | null;
  signal?: AbortSignal;
  runner?: AssistProviderRunner;
}): Promise<SupervisorSearchResult> {
  const query = (input.query ?? "").trim();
  if (!query) throw new CodebaseSearchError("A search needs a non-empty question.");

  const loaded = await loadConfig(input.projectRoot).catch(() => null);
  if (!loaded) {
    throw new CodebaseSearchError(
      "Project is not initialized (no .vibestrate/project.yml). Run `vibe init` first.",
    );
  }

  const list = await listCodebaseFiles({ projectRoot: input.projectRoot, max: 1500 });
  if (!list.available) {
    throw new CodebaseSearchError(
      list.error ?? "Supervisor search needs a git repository.",
    );
  }
  if (list.paths.length === 0) {
    return {
      result: {
        files: [],
        searchTerms: [],
        summary: "No tracked files to search.",
        confidence: "high",
        caveats: [],
      },
      providerId: "",
      profileId: "",
      model: null,
      effort: null,
      candidateCount: 0,
      candidatesTruncated: false,
    };
  }

  const res = await runAssist<SupervisorSearch>({
    projectRoot: input.projectRoot,
    label: "codebase-search",
    auditBucket: "assist",
    instruction: buildInstruction(query, list.paths, list.truncated),
    schema: supervisorSearchSchema,
    schemaHint: SCHEMA_HINT,
    loaded,
    profileId: input.profileId,
    adHocProvider: input.providerId
      ? { providerId: input.providerId, model: input.model ?? null, effort: input.effort ?? null }
      : null,
    signal: input.signal,
    runner: input.runner,
  });

  // Drop any path the model invented - the answer can only point at real files.
  const known = new Set(list.paths);
  const files = res.parsed.files.filter((f) => known.has(f.path)).slice(0, 8);

  return {
    result: { ...res.parsed, files },
    providerId: res.providerId,
    profileId: res.profileId,
    model: res.model,
    effort: res.effort,
    candidateCount: list.paths.length,
    candidatesTruncated: list.truncated,
  };
}
