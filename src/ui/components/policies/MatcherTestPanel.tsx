import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { api, ApiError } from "../../lib/api.js";
import type { PolicySurface, PolicyTestResult } from "../../lib/types.js";
import { Button } from "../design/Button.js";

/**
 * Deterministic, read-only dry-run of a matcher (regex and/or glob). Reused inside
 * the add/draft form and on each matcher-bearing policy row, so the owner sees what
 * a rule would flag/block BEFORE committing it. Hits `/api/policies/test`, which
 * runs the same engine the merge-gate uses and returns REDACTED matched lines - no
 * write, no raw diff content. Renders nothing dangerous: matched lines arrive
 * already redacted + truncated from the server.
 */
export function MatcherTestPanel({
  regex,
  flags,
  glob,
  appliesTo = ["suggestion-apply", "bundle-apply"],
}: {
  regex?: string;
  flags?: string;
  glob?: string;
  appliesTo?: PolicySurface[];
}) {
  const [snippet, setSnippet] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PolicyTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasRule = !!(regex?.trim() || glob?.trim());

  async function run(source: { kind: "snippet"; patch: string } | { kind: "recent" }) {
    if (!hasRule) {
      setError("Add a matcher regex (or glob) to test.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await api.testPolicy(
          {
            regex: regex?.trim() || undefined,
            flags: flags?.trim() || undefined,
            glob: glob?.trim() || undefined,
            appliesTo,
          },
          source,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[12px] border border-[color:var(--line)] bg-coal-700 p-3">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-violet-soft">
        <FlaskConical className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Test this matcher
      </div>
      <p className="mt-1 text-[11px] leading-snug text-chalk-300">
        Read-only dry-run through the merge-gate engine. Paste a diff or code, or test
        against recent runs. Nothing is written; matched lines are redacted.
      </p>
      <textarea
        value={snippet}
        onChange={(e) => setSnippet(e.target.value)}
        placeholder={"Paste a diff or code snippet...\n+const x = 1;"}
        rows={4}
        spellCheck={false}
        className="mt-2 w-full resize-none rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-2 font-mono text-[11px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !snippet.trim()}
          onClick={() => void run({ kind: "snippet", patch: snippet })}
        >
          {busy ? "Testing…" : "Test snippet"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void run({ kind: "recent" })}
        >
          Test against recent runs
        </Button>
      </div>
      {error ? (
        <div className="mt-2 rounded-[8px] border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="mt-2 rounded-[10px] border border-[color:var(--line)] bg-coal-600 px-2.5 py-2">
          <div className="text-[11px] text-chalk-300">
            Evaluated {result.evaluatedCount} source(s) -{" "}
            {result.matches.length === 0 ? (
              <span className="text-emerald-400">no matches</span>
            ) : (
              <span className="text-amber-soft">
                {result.matches.length} match{result.matches.length === 1 ? "" : "es"}
              </span>
            )}
          </div>
          {result.matches.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {result.matches.map((m, i) => (
                <li key={i} className="text-[11px]">
                  <span className="text-chalk-300">
                    {m.runId ? `${m.runId} · ` : ""}
                    {m.file ?? "(file)"}
                  </span>
                  {m.line ? (
                    <span className="ml-1 font-mono text-chalk-400">{m.line}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
