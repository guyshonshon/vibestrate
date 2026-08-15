/**
 * Search results for the Codebase left rail - content search (git grep) and
 * supervisor search (natural language -> ranked files). Content search runs
 * live (debounced) as you type; supervisor search is on submit because it
 * spawns a provider. Clicking a result opens the file at its line in the viewer.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileCode, Sparkles } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  CodeSearchResult,
  SupervisorSearchResult,
} from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { Skeleton, SkeletonBlock, SkeletonText } from "../design/Skeleton.js";

type Common = {
  query: string;
  onOpen: (path: string, line?: number) => void;
  selectedPath: string | null;
};

export function ContentResults({
  query,
  regex,
  caseSensitive,
  include,
  exclude,
  onOpen,
  selectedPath,
}: Common & {
  regex: boolean;
  caseSensitive: boolean;
  include: string;
  exclude: string;
}) {
  const [result, setResult] = useState<CodeSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      void api
        .searchProjectContent({ query: q, regex, caseSensitive, include: include || null, exclude: exclude || null })
        .then((r) => {
          if (id !== reqId.current) return;
          setResult(r);
          setError(r.error);
        })
        .catch((e) => {
          if (id !== reqId.current) return;
          setError(e instanceof Error ? e.message : String(e));
          setResult(null);
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(t);
  }, [query, regex, caseSensitive, include, exclude]);

  if (!query.trim()) {
    return (
      <Hint>
        Type to search file contents across the repo. Scope it with Include /
        Exclude globs, or toggle Regex.
      </Hint>
    );
  }
  if (error) return <ErrorRow text={error} />;
  if (!result && loading) return <SearchBones />;
  if (!result) return null;
  if (result.files.length === 0) {
    // A re-search over a query that currently has no matches keeps the bones
    // rather than asserting "no matches" about a query still running.
    return loading ? (
      <SearchBones />
    ) : (
      <Hint>{`No matches for "${result.query}".`}</Hint>
    );
  }

  return (
    <div className="flex flex-col">
      <ResultsLedger
        left={`${result.totalMatches}${result.truncated ? "+" : ""} match${result.totalMatches === 1 ? "" : "es"}`}
        right={`${result.totalFiles} file${result.totalFiles === 1 ? "" : "s"}`}
        note={result.redactedCount > 0 ? `${result.redactedCount} secret redacted` : null}
      />
      <ul>
        {result.files.map((f) => (
          <li key={f.path} className="border-b border-[color:var(--line-soft)] last:border-b-0">
            <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
              <FileCode className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
              <button
                type="button"
                onClick={() => onOpen(f.path, f.matches[0]?.line)}
                className={cn(
                  "mono min-w-0 flex-1 truncate text-left text-meta font-semibold transition hover:text-violet-soft",
                  selectedPath === f.path ? "text-violet-soft" : "text-chalk-100",
                )}
                title={f.path}
              >
                {f.path}
              </button>
              <span className="num-tabular shrink-0 text-meta text-chalk-400">
                {f.matchCount}
                {f.matchesTruncated ? "+" : ""}
              </span>
            </div>
            <ul className="pb-1.5">
              {f.matches.map((m, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onOpen(f.path, m.line)}
                    className="flex w-full items-baseline gap-2 px-3 py-0.5 text-left transition hover:bg-coal-500/60"
                    title={m.text}
                  >
                    <span className="num-tabular shrink-0 text-meta text-chalk-400">{m.line}</span>
                    <span className="mono min-w-0 flex-1 truncate text-meta text-chalk-300">
                      {m.text.trim()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SupervisorResults({
  query,
  submitToken,
  onOpen,
  onRunTerm,
  selectedPath,
}: Common & {
  /** Bumps when the user submits - triggers the (expensive) provider call. */
  submitToken: number;
  onRunTerm: (term: string) => void;
}) {
  const [result, setResult] = useState<SupervisorSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q || submitToken === 0) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    void api
      .searchProjectSupervisor({ query: q })
      .then((r) => {
        if (id !== reqId.current) return;
        setResult(r);
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setResult(null);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitToken]);

  if (loading) return <AskBones />;
  if (error) return <ErrorRow text={error} />;
  if (!result) {
    return (
      <Hint>
        Describe what you're looking for - e.g. "the file that handles login" -
        then press Ask. The supervisor ranks the files that fit and says why.
      </Hint>
    );
  }

  const { result: r } = result;
  return (
    <div className="flex flex-col">
      {r.summary ? (
        <div className="border-b border-[color:var(--line-soft)] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-meta font-semibold text-violet-soft">
            <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden /> supervisor
          </div>
          <p className="mt-1 text-meta leading-[1.5] text-chalk-200">{r.summary}</p>
          <div className="mt-1 text-meta text-chalk-400">
            {r.confidence} confidence · {result.candidateCount} files considered
          </div>
        </div>
      ) : null}
      {r.files.length === 0 ? (
        <Hint>No file stood out. Try rephrasing, or use Content search.</Hint>
      ) : (
        <ul>
          {r.files.map((f) => (
            <li key={f.path} className="border-b border-[color:var(--line-soft)] last:border-b-0">
              <button
                type="button"
                onClick={() => onOpen(f.path)}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-coal-500/60"
              >
                <span className="flex items-center gap-1.5">
                  <FileCode className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} aria-hidden />
                  <span
                    className={cn(
                      "mono min-w-0 flex-1 truncate text-meta font-semibold",
                      selectedPath === f.path ? "text-violet-soft" : "text-chalk-100",
                    )}
                    title={f.path}
                  >
                    {f.path}
                  </span>
                </span>
                {f.reason ? (
                  <span className="pl-[22px] text-meta leading-snug text-chalk-300">{f.reason}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {r.searchTerms.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[color:var(--line-soft)] px-3 py-2">
          <span className="text-meta font-semibold text-violet-soft">terms:</span>
          {r.searchTerms.slice(0, 6).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onRunTerm(t)}
              className="mono rounded-[6px] bg-coal-500 px-1.5 py-0.5 text-meta text-chalk-200 transition hover:bg-coal-400 hover:text-chalk-100"
              title={`Content-search "${t}"`}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResultsLedger({ left, right, note }: { left: string; right: string; note: string | null }) {
  return (
    <div className="flex items-center gap-3 border-b border-[color:var(--line-soft)] px-3 py-1.5 text-meta">
      <span className="font-semibold text-chalk-100">{left}</span>
      <span className="text-chalk-400">{right}</span>
      {note ? <span className="ml-auto text-amber-soft">{note}</span> : null}
    </div>
  );
}

/** The results list's own shape: the ledger bar, then per-file match groups. */
function SearchBones() {
  return (
    <Skeleton label="Searching" className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-[color:var(--line-soft)] px-3 py-1.5">
        <SkeletonBlock tone="text" h={11} w={72} />
        <SkeletonBlock tone="text" h={11} w={52} />
      </div>
      {[0, 1, 2].map((f) => (
        <div key={f} className="border-b border-[color:var(--line-soft)] last:border-b-0">
          <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
            <SkeletonBlock w={14} h={14} radius={4} />
            <SkeletonBlock tone="text" h={11} w={`${[64, 48, 76][f]}%`} />
            <SkeletonBlock tone="text" h={10} w={20} className="ml-auto" />
          </div>
          <div className="flex flex-col gap-1 px-3 pb-1.5">
            {[0, 1].map((m) => (
              <SkeletonBlock key={m} tone="text" h={10} w={`${[86, 62][m]}%`} />
            ))}
          </div>
        </div>
      ))}
    </Skeleton>
  );
}

/** The ranked answer's shape: the supervisor's summary block, then file rows. */
function AskBones() {
  return (
    <Skeleton label="Searching with the supervisor" className="flex flex-col">
      <div className="border-b border-[color:var(--line-soft)] px-3 py-2.5">
        <SkeletonBlock tone="text" h={11} w={84} />
        <SkeletonText className="mt-1.5" lines={2} size={11} gap={7} />
      </div>
      {[0, 1, 2, 3].map((f) => (
        <div
          key={f}
          className="flex flex-col gap-1 border-b border-[color:var(--line-soft)] px-3 py-2 last:border-b-0"
        >
          <div className="flex items-center gap-1.5">
            <SkeletonBlock w={14} h={14} radius={4} />
            <SkeletonBlock tone="text" h={11} w={`${[62, 48, 74, 54][f]}%`} />
          </div>
          <SkeletonBlock tone="text" h={10} w={`${[82, 64, 88, 58][f]}%`} />
        </div>
      ))}
    </Skeleton>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-3 text-meta leading-snug text-chalk-300">{children}</div>;
}

function ErrorRow({ text }: { text: string }) {
  return (
    <div className="m-2.5 flex items-start gap-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-meta text-rose-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden />
      <span>{text}</span>
    </div>
  );
}
