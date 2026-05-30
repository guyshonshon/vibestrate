import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api.js";
import type {
  PolicyCheckResult,
  PolicyStoreSnapshot,
  PolicySurface,
} from "../../lib/types.js";

/**
 * Read-only Policies surface.
 *
 *   - Lists rule files + each rule's id, description, appliesTo,
 *     touched-file glob, added-content regex summary, and message.
 *   - Surfaces malformed rule files (parse / schema / regex / glob errors).
 *   - Surfaces duplicate rule ids.
 *   - Mirrors `vibe policies doctor` so the user has the same signal
 *     they would on the CLI.
 *   - Provides a "Check patch" panel that calls the same engine the CLI
 *     and the apply flow call — paste a patch, see violations. Does NOT
 *     apply anything, does NOT execute anything.
 *
 * Editing rules from the browser is intentionally out of scope for V0.
 * Authoring stays file-based in .vibestrate/policies/*.yml.
 */
export function PoliciesPanel() {
  const [snap, setSnap] = useState<PolicyStoreSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patch, setPatch] = useState("");
  const [surface, setSurface] = useState<PolicySurface>("suggestion-apply");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<PolicyCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getPolicies()
      .then((r) => {
        if (!cancelled) {
          setSnap(r);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runCheck() {
    if (!patch.trim()) {
      setError("Paste a unified diff into the patch box first.");
      return;
    }
    setChecking(true);
    setError(null);
    setCheck(null);
    try {
      const r = await api.checkPatchAgainstPolicies({
        patch,
        surface,
      });
      setCheck(r);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-4 p-4 text-[12px]">
      <header>
        <h2 className="text-[13px] font-medium text-vibestrate-fg">Policies</h2>
        <p className="mt-0.5 text-[10.5px] text-vibestrate-fg-muted">
          User-defined rules in <code>.vibestrate/policies/*.yml</code>. Rules can
          refuse a suggestion or bundle apply; they never bypass built-in
          safety checks. Authoring is file-based.
        </p>
      </header>

      {error ? (
        <div className="rounded border border-vibestrate-fail/40 bg-vibestrate-fail/10 px-2 py-1 text-vibestrate-fail">
          {error}
        </div>
      ) : null}

      {!snap ? (
        <div className="text-vibestrate-fg-muted">Loading…</div>
      ) : (
        <>
          <section>
            <h3 className="text-[11px] uppercase tracking-[0.1em] text-vibestrate-fg-muted">
              Status
            </h3>
            <div className="mt-1 vibestrate-mono text-[10.5px] text-vibestrate-fg-dim">
              {snap.rules.length} active rule(s) across {snap.ruleFiles.length}{" "}
              file(s).{" "}
              {snap.rules.length > 0 ? (
                <span className="text-vibestrate-success">
                  policies are loaded and apply
                </span>
              ) : (
                <span>policies are loaded but empty — no refusals will fire</span>
              )}
              .
            </div>
          </section>

          {snap.malformedFiles.length > 0 ? (
            <section className="rounded border border-vibestrate-fail/40 bg-vibestrate-fail/10 p-2">
              <h3 className="text-[11px] uppercase tracking-[0.1em] text-vibestrate-fail">
                Malformed files (skipped)
              </h3>
              <ul className="mt-1 space-y-1 text-[10.5px] text-vibestrate-fail">
                {snap.malformedFiles.map((m) => (
                  <li key={m.file}>
                    <div className="vibestrate-mono truncate">{m.file}</div>
                    <div className="text-vibestrate-fg-muted">{m.reason}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {snap.duplicateIds.length > 0 ? (
            <section className="rounded border border-vibestrate-warn/40 bg-vibestrate-warn/10 p-2 text-[10.5px] text-vibestrate-warn">
              <span className="font-medium">Duplicate ids:</span>{" "}
              {snap.duplicateIds.join(", ")} — first occurrence wins; resolve by
              renaming the rule(s).
            </section>
          ) : null}

          <section>
            <h3 className="text-[11px] uppercase tracking-[0.1em] text-vibestrate-fg-muted">
              Rule files
            </h3>
            <ul className="mt-1 space-y-1">
              {snap.ruleFiles.length === 0 ? (
                <li className="text-vibestrate-fg-muted">
                  No <code>.vibestrate/policies/*.yml</code> files.
                </li>
              ) : (
                snap.ruleFiles.map((f) => (
                  <li
                    key={f.file}
                    className="rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1.5"
                  >
                    <div className="vibestrate-mono truncate text-vibestrate-fg">{f.file}</div>
                    <div className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                      {f.ruleIds.length === 0 && f.actionIds.length === 0
                        ? "(empty)"
                        : [
                            f.ruleIds.length > 0
                              ? `rules: ${f.ruleIds.join(", ")}`
                              : null,
                            f.actionIds.length > 0
                              ? `actions: ${f.actionIds.join(", ")}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join("  ·  ")}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-[0.1em] text-vibestrate-fg-muted">
              Rules
            </h3>
            <ul className="mt-1 space-y-1">
              {snap.rules.length === 0 ? (
                <li className="text-vibestrate-fg-muted">No rules loaded.</li>
              ) : (
                snap.rules.map((r) => (
                  <li
                    key={r.id}
                    className="rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{r.id}</span>
                      <span className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                        {r.appliesTo.join(", ")}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-vibestrate-fg-dim">{r.description}</p>
                    {r.matchTouchedFiles ? (
                      <p className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                        touched-files glob: {r.matchTouchedFiles.glob}
                      </p>
                    ) : null}
                    {r.matchAddedContent ? (
                      <p className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                        added-content regex: /{r.matchAddedContent.regex}/
                        {r.matchAddedContent.flags ?? ""}
                      </p>
                    ) : null}
                    <p className="text-[10.5px] text-vibestrate-fg-muted">
                      message: {r.message}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-[0.1em] text-vibestrate-fg-muted">
              Action policies (Action Broker)
            </h3>
            <ul className="mt-1 space-y-1">
              {snap.actions.length === 0 ? (
                <li className="text-vibestrate-fg-muted">
                  No action policies loaded.
                </li>
              ) : (
                snap.actions.map((a) => (
                  <li
                    key={a.id}
                    className="rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{a.id}</span>
                      <span className="vibestrate-mono text-[10px] text-vibestrate-fail">
                        {a.effect}
                      </span>
                      <span className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                        on {a.on.join(", ")}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-vibestrate-fg-dim">
                      {a.description}
                    </p>
                    {a.match?.providerId ? (
                      <p className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                        providerId: {a.match.providerId}
                      </p>
                    ) : null}
                    {a.match?.commandRegex ? (
                      <p className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                        command regex: /{a.match.commandRegex}/
                        {a.match.commandFlags ?? ""}
                      </p>
                    ) : null}
                    {a.match?.pathGlob ? (
                      <p className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                        path glob: {a.match.pathGlob}
                      </p>
                    ) : null}
                    {a.match?.status ? (
                      <p className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                        status: {a.match.status}
                      </p>
                    ) : null}
                    <p className="text-[10.5px] text-vibestrate-fg-muted">
                      message: {a.message}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded border border-vibestrate-border bg-vibestrate-panel-2 p-2">
            <h3 className="text-[11px] uppercase tracking-[0.1em] text-vibestrate-fg-muted">
              Check patch
            </h3>
            <p className="text-[10.5px] text-vibestrate-fg-muted">
              Paste a unified diff. Runs the same engine the apply flow uses.
              Does <strong>not</strong> apply the patch and does{" "}
              <strong>not</strong> run any command.
            </p>
            <div className="mt-2 flex items-center gap-2 text-[10.5px]">
              <label className="flex items-center gap-1">
                surface:
                <select
                  value={surface}
                  onChange={(e) => setSurface(e.target.value as PolicySurface)}
                  className="vibestrate-mono rounded border border-vibestrate-border bg-vibestrate-panel px-1 py-0.5"
                >
                  <option value="suggestion-apply">suggestion-apply</option>
                  <option value="bundle-apply">bundle-apply</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void runCheck()}
                disabled={checking}
                className="rounded border border-vibestrate-accent/40 bg-vibestrate-accent-soft/30 px-2 py-0.5 text-vibestrate-fg hover:bg-vibestrate-accent-soft/50 disabled:opacity-60"
              >
                {checking ? "Checking…" : "Run check"}
              </button>
            </div>
            <textarea
              value={patch}
              onChange={(e) => setPatch(e.target.value)}
              placeholder={"diff --git a/example.ts b/example.ts\n--- a/example.ts\n+++ b/example.ts\n@@ -1 +1,2 @@\n ok\n+new line"}
              className="vibestrate-mono mt-2 w-full rounded border border-vibestrate-border bg-vibestrate-panel px-2 py-1.5 text-[10.5px]"
              rows={10}
              spellCheck={false}
            />
            {check ? (
              <div className="mt-2 rounded border border-vibestrate-border bg-vibestrate-panel px-2 py-1.5">
                <div className="vibestrate-mono text-[10.5px] text-vibestrate-fg-dim">
                  surface: {check.surface} · evaluated{" "}
                  {check.ruleCountForSurface}/{check.ruleCountTotal} rule(s)
                </div>
                {check.violations.length === 0 ? (
                  <div className="mt-1 text-vibestrate-success">
                    No violations. Built-in safety checks (path/content secret
                    scan) still apply at the actual apply call site.
                  </div>
                ) : (
                  <ul className="mt-1 space-y-1 text-vibestrate-warn">
                    {check.violations.map((v, i) => (
                      <li key={`${v.ruleId}-${i}`}>
                        <span className="vibestrate-mono">{v.ruleId}</span>:{" "}
                        {v.message}
                        {v.matchedFile ? (
                          <span className="vibestrate-mono text-vibestrate-fg-muted">
                            {"  · "}
                            {v.matchedFile}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
