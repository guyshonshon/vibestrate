import { z } from "zod";
import {
  runAssist,
  resolveAssistTarget,
  type AssistProviderRunner,
} from "../core/assist/assist-runner.js";
import { capabilitiesForProvider } from "../providers/provider-catalog.js";
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

/**
 * The cheapest effort the ranking task can reliably run at. `"minimal"` is too
 * weak for dependable structured JSON on some providers (codex returns unparse-
 * able output), so we floor at the lowest level that is at least `"low"` -
 * still a large saving over the profile's usual high effort.
 */
export function cheapEffort(
  levels: string[] | undefined,
  fallback: string | null,
): string | null {
  if (!levels || levels.length === 0) return fallback;
  return levels.find((l) => l !== "minimal") ?? levels[0]!;
}

// Files that are essentially never the answer to "which file handles X" and
// only bloat the prompt (input tokens) + dilute ranking. Dropped from the
// candidate list handed to the model - content search still sees everything.
const RANK_NOISE =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|\.(min\.(js|css)|map|snap|lock)$|(^|\/)(docs\/generated|dist|build|coverage|__snapshots__|vendor)\//;

const MAX_CANDIDATES = 700;

/** Trim the candidate paths for ranking: drop generated/lock/minified noise and
 *  cap, so the model reads a smaller, more relevant list (fewer tokens, faster). */
export function trimForRanking(paths: string[]): { paths: string[]; truncated: boolean } {
  const kept = paths.filter((p) => !RANK_NOISE.test(p));
  return { paths: kept.slice(0, MAX_CANDIDATES), truncated: kept.length > MAX_CANDIDATES };
}

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

  const list = await listCodebaseFiles({ projectRoot: input.projectRoot, max: 3000 });
  if (!list.available) {
    throw new CodebaseSearchError(
      list.error ?? "Supervisor search needs a git repository.",
    );
  }
  // Hand the model a trimmed, source-relevant list - fewer input tokens, faster.
  const trimmed = trimForRanking(list.paths);
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

  // Ranking file NAMES by intent is a cheap, mechanical task - it must not burn
  // a high-effort reasoning budget. Resolve the would-be profile's provider,
  // then force its LOWEST effort (and its cheapest model where one is
  // designated - many providers, e.g. codex, designate none). An explicit
  // caller override (providerId/model/effort) still wins.
  const target = resolveAssistTarget(loaded, { profileId: input.profileId });
  const provCfg = loaded.config.providers[target.providerId];
  const caps = provCfg
    ? capabilitiesForProvider(target.providerId, provCfg)
    : null;
  const adHoc = {
    providerId: input.providerId ?? target.providerId,
    model: input.model ?? caps?.cheapModel ?? target.model,
    effort: input.effort ?? cheapEffort(caps?.powerLevels, target.effort),
  };

  const res = await runAssist<SupervisorSearch>({
    projectRoot: input.projectRoot,
    label: "codebase-search",
    auditBucket: "assist",
    instruction: buildInstruction(query, trimmed.paths, trimmed.truncated || list.truncated),
    schema: supervisorSearchSchema,
    schemaHint: SCHEMA_HINT,
    loaded,
    adHocProvider: adHoc,
    signal: input.signal,
    runner: input.runner,
  });

  // Drop any path the model invented - the answer can only point at real files.
  const known = new Set(trimmed.paths);
  const files = res.parsed.files.filter((f) => known.has(f.path)).slice(0, 8);

  return {
    result: { ...res.parsed, files },
    providerId: res.providerId,
    profileId: res.profileId,
    model: res.model,
    effort: res.effort,
    candidateCount: trimmed.paths.length,
    candidatesTruncated: trimmed.truncated || list.truncated,
  };
}
