import { useState } from "react";
import { api, ApiError } from "../../lib/api.js";
import type {
  PolicyCheckResult,
  PolicyStoreSnapshot,
  PolicySurface,
} from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { Select } from "../design/Select.js";
import { Section } from "../layout/PageShell.js";
import { GROUP_CARD } from "./AdvancedSafetySection.js";

/**
 * The hard, file-authored deterministic engine (.vibestrate/policies/*.yml),
 * shown READ-ONLY because authoring stays file-based. This is the fail-closed
 * security layer, distinct from the owner-authored policies above it.
 *
 * The source path is not repeated as a section label: the page hero's footer
 * already carries it, and at half-column width a right-aligned label strands
 * itself a few hundred pixels from the heading it belongs to.
 */
export function EnginePanel({ snap }: { snap: PolicyStoreSnapshot }) {
  const hasIssues = snap.malformedFiles.length > 0 || snap.duplicateIds.length > 0;
  const empty = snap.rules.length === 0 && snap.actions.length === 0;

  return (
    <Section flush title="Deterministic engine">
      {hasIssues ? (
        <div className="mb-2 space-y-1.5">
          {snap.malformedFiles.map((m) => (
            <div
              key={m.file}
              className="rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-meta text-rose-300"
            >
              <span className="font-mono">{m.file}</span> - {m.reason}
            </div>
          ))}
          {snap.duplicateIds.length > 0 ? (
            <div className="rounded-[12px] border border-amber-soft/30 bg-amber-soft/10 px-3 py-2 text-meta text-amber-soft">
              Duplicate ids (first wins): {snap.duplicateIds.join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}

      {empty ? (
        <div className="rounded-[18px] border border-dashed border-[color:var(--line)] px-4 py-6 text-center text-[13px] text-chalk-300">
          No rules in <code className="mono">.vibestrate/policies/*.yml</code>
        </div>
      ) : (
        <div className={GROUP_CARD}>
          {snap.rules.map((r) => (
            <div key={r.id} className="px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="mono min-w-0 truncate text-[13px] font-semibold text-chalk-100">
                  {r.id}
                </span>
                <span className="shrink-0 text-meta text-chalk-400">
                  {r.appliesTo.join(", ")}
                </span>
              </div>
              <p className="mt-1 text-meta leading-[1.55] text-chalk-300">
                {r.description}
              </p>
              {r.matchAddedContent ? (
                <p className="mt-1 truncate font-mono text-meta text-chalk-400">
                  /{r.matchAddedContent.regex}/{r.matchAddedContent.flags ?? ""}
                </p>
              ) : null}
              {r.matchTouchedFiles ? (
                <p className="mt-1 truncate font-mono text-meta text-chalk-400">
                  glob: {r.matchTouchedFiles.glob}
                </p>
              ) : null}
            </div>
          ))}
          {snap.actions.map((a) => (
            <div key={a.id} className="px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="mono min-w-0 truncate text-[13px] font-semibold text-chalk-100">
                  {a.id}
                </span>
                <span className="shrink-0 text-meta font-semibold text-rose-300">
                  {a.effect}
                </span>
                <span className="shrink-0 text-meta text-chalk-400">
                  on {a.on.join(", ")}
                </span>
              </div>
              <p className="mt-1 text-meta leading-[1.55] text-chalk-300">
                {a.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/**
 * The read-only patch checker: runs the same engine the apply flow uses. It
 * needs no policy snapshot, so it renders immediately instead of waiting behind
 * the engine read-out's fetch.
 */
export function PatchCheckPanel() {
  const [patch, setPatch] = useState("");
  const [surface, setSurface] = useState<PolicySurface>("suggestion-apply");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<PolicyCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    if (!patch.trim()) {
      setError("Paste a unified diff into the patch box first.");
      return;
    }
    setChecking(true);
    setError(null);
    setCheck(null);
    try {
      setCheck(await api.checkPatchAgainstPolicies({ patch, surface }));
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Section flush title="Check a patch">
      <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={surface}
            ariaLabel="patch check surface"
            className="min-w-[160px]"
            onChange={(v) => setSurface(v as PolicySurface)}
            options={[
              { value: "suggestion-apply", label: "suggestion-apply" },
              { value: "bundle-apply", label: "bundle-apply" },
            ]}
          />
          <Button variant="secondary" size="sm" disabled={checking} onClick={() => void runCheck()}>
            {checking ? "Checking…" : "Run check"}
          </Button>
          <span className="text-meta text-chalk-400">Does not apply the patch.</span>
        </div>
        <textarea
          value={patch}
          onChange={(e) => setPatch(e.target.value)}
          placeholder={"diff --git a/example.ts b/example.ts\n+++ b/example.ts\n@@ -1 +1,2 @@\n ok\n+new line"}
          rows={8}
          spellCheck={false}
          className="mt-3 w-full resize-none rounded-[14px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 font-mono text-meta text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
        />
        {error ? (
          <div className="mt-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-meta text-rose-300">
            {error}
          </div>
        ) : null}
        {check ? (
          <div className="mt-2 rounded-[14px] border border-[color:var(--line)] bg-coal-700 px-3.5 py-2.5">
            <div className="text-meta text-chalk-400">
              {check.surface} - evaluated {check.ruleCountForSurface}/{check.ruleCountTotal} rule(s)
            </div>
            {check.violations.length === 0 ? (
              <div className="mt-1 text-[13px] text-emerald-400">No violations.</div>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {check.violations.map((v, i) => (
                  <li key={`${v.ruleId}-${i}`} className="text-meta text-amber-soft">
                    <span className="font-mono">{v.ruleId}</span>: {v.message}
                    {v.matchedFile ? <span className="text-chalk-400"> - {v.matchedFile}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
