import { useState } from "react";
import { api, ApiError } from "../../lib/api.js";
import type {
  PolicyCheckResult,
  PolicyStoreSnapshot,
  PolicySurface,
} from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { Select } from "../design/Select.js";

/**
 * Engine & tools - the hard, file-authored deterministic engine
 * (.vibestrate/policies/*.yml) shown READ-ONLY (authoring stays file-based), plus
 * the check-patch tool. This is the fail-closed security layer, distinct from the
 * owner-authored soft policies.
 */
export function EngineToolsPanel({ snap }: { snap: PolicyStoreSnapshot }) {
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

  const hasIssues = snap.malformedFiles.length > 0 || snap.duplicateIds.length > 0;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[13px] font-semibold text-chalk-100">Deterministic engine</h3>
        <p className="mt-0.5 text-[11.5px] text-chalk-300">
          Hard, fail-closed rules in <code className="font-mono text-chalk-400">.vibestrate/policies/*.yml</code>.
          Authoring stays file-based; this is a read-out.
        </p>

        {hasIssues ? (
          <div className="mt-2.5 space-y-1.5">
            {snap.malformedFiles.map((m) => (
              <div key={m.file} className="rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">
                <span className="font-mono">{m.file}</span> - {m.reason}
              </div>
            ))}
            {snap.duplicateIds.length > 0 ? (
              <div className="rounded-[12px] border border-amber-soft/30 bg-amber-soft/10 px-3 py-2 text-[11.5px] text-amber-soft">
                Duplicate ids (first wins): {snap.duplicateIds.join(", ")}
              </div>
            ) : null}
          </div>
        ) : null}

        {snap.rules.length === 0 && snap.actions.length === 0 ? (
          <div className="mt-2.5 rounded-[14px] border border-dashed border-[color:var(--line)] px-4 py-6 text-center text-[12.5px] text-chalk-400">
            No <code className="font-mono">.vibestrate/policies/*.yml</code> rules.
          </div>
        ) : (
          <div className="mt-2.5 space-y-1.5">
            {snap.rules.map((r) => (
              <div key={r.id} className="rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-chalk-100">{r.id}</span>
                  <span className="text-[11px] text-chalk-400">{r.appliesTo.join(", ")}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-chalk-300">{r.description}</p>
                {r.matchAddedContent ? (
                  <p className="mt-0.5 font-mono text-[11px] text-chalk-400">
                    /{r.matchAddedContent.regex}/{r.matchAddedContent.flags ?? ""}
                  </p>
                ) : null}
                {r.matchTouchedFiles ? (
                  <p className="mt-0.5 font-mono text-[11px] text-chalk-400">glob: {r.matchTouchedFiles.glob}</p>
                ) : null}
              </div>
            ))}
            {snap.actions.map((a) => (
              <div key={a.id} className="rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-chalk-100">{a.id}</span>
                  <span className="text-[11px] font-semibold text-rose-300">{a.effect}</span>
                  <span className="text-[11px] text-chalk-400">on {a.on.join(", ")}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-chalk-300">{a.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-chalk-100">Check a patch</h3>
        <p className="mt-0.5 text-[11.5px] text-chalk-300">
          Paste a unified diff to run the same engine the apply flow uses. Does not apply the patch or run anything.
        </p>
        <div className="mt-2.5 flex items-center gap-2">
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
        </div>
        <textarea
          value={patch}
          onChange={(e) => setPatch(e.target.value)}
          placeholder={"diff --git a/example.ts b/example.ts\n+++ b/example.ts\n@@ -1 +1,2 @@\n ok\n+new line"}
          rows={9}
          spellCheck={false}
          className="mt-2 w-full resize-none rounded-[14px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 font-mono text-[11.5px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
        />
        {error ? (
          <div className="mt-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
            {error}
          </div>
        ) : null}
        {check ? (
          <div className="mt-2 rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-3.5 py-2.5">
            <div className="text-[11.5px] text-chalk-400">
              {check.surface} - evaluated {check.ruleCountForSurface}/{check.ruleCountTotal} rule(s)
            </div>
            {check.violations.length === 0 ? (
              <div className="mt-1 text-[12.5px] text-emerald-400">
                No violations. Built-in secret/path safety still applies at the real apply site.
              </div>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {check.violations.map((v, i) => (
                  <li key={`${v.ruleId}-${i}`} className="text-[12px] text-amber-soft">
                    <span className="font-mono">{v.ruleId}</span>: {v.message}
                    {v.matchedFile ? <span className="text-chalk-400"> - {v.matchedFile}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
