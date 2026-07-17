import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ProviderCatalogResponse } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { Chip } from "../design/Chip.js";
import { Section } from "../layout/PageShell.js";
import { ErrorView } from "../../lib/error-view.js";

/**
 * Capability catalog - the in-UI mirror of `vibe provider catalog`. Shows the
 * model/effort knobs the Profile editor offers per provider, where each came
 * from (built-in vs your `.vibestrate/providers-catalog.yml` overlay), and the
 * overlay's status. Read-only: the overlay is hand-authored (auto-probe is a
 * planned, opt-in step), so this surfaces it rather than editing it.
 */
export function ProviderCatalogPanel() {
  const [data, setData] = useState<ProviderCatalogResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function loadCatalog() {
    try {
      setError(null);
      setData(await api.getProviderCatalog());
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      const r = await api.refreshProviderCatalog({});
      const updated = r.findings.filter((f) => f.status === "added");
      const failed = r.findings.filter((f) => f.status === "probe-failed");
      const deltas = updated
        .filter((f) => (f.added?.length ?? 0) > 0 || (f.removed?.length ?? 0) > 0)
        .map((f) => {
          const a = f.added?.length ? `+${f.added.join(", ")}` : "";
          const rem = f.removed?.length ? `-${f.removed.join(", ")}` : "";
          return `${f.providerId}: ${[a, rem].filter(Boolean).join(" ")}`;
        });
      setNote(
        failed.length > 0
          ? `Detected ${updated.length}; ${failed.length} failed - ${failed[0]!.providerId}: ${failed[0]!.detail ?? "probe failed"}`
          : deltas.length > 0
            ? `Detected real models - ${deltas.join(" · ")}`
            : updated.length > 0
              ? `Updated ${updated.length} provider(s) from their real catalog.`
              : "No changes - built-in + your overlay already match what the providers report.",
      );
      setData(await api.getProviderCatalog());
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // A failed catalog load is a recoverable state, not a silent hide - surface a
  // compact error with a retry so the capability panel doesn't just vanish.
  if (!data)
    return error ? (
      <Section title="Capability catalog">
        <ErrorView err={error} compact onRetry={() => void loadCatalog()} />
      </Section>
    ) : null;
  // Only show providers that actually expose a knob (or are overlaid) - hides
  // the many CLIs with no model/effort spec, which would just be noise.
  const ids = Object.keys(data.catalog)
    .filter((id) => {
      const c = data.catalog[id]!;
      return c.models.length > 0 || c.powerLevels.length > 0 || data.sources[id] === "overlay";
    })
    .sort();

  return (
    <Section
      title="Capability catalog"
      action={
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<RefreshCw size={13} />}
          disabled={busy}
          title="Detect each provider's real models/efforts (codex `debug models`, else --help) and write them to the overlay (local only)"
          onClick={() => void refresh()}
        >
          {busy ? "Detecting…" : "Refresh from providers"}
        </Button>
      }
    >
      <p className="mb-3 max-w-[74ch] text-[12.5px] leading-[1.55] text-chalk-300">
        Models & effort per provider - the model and effort knobs the Profile
        editor offers, built-in plus your overlay.{" "}
        <code className="text-violet-soft">vibe provider catalog</code> shows the
        same.
      </p>

      {note ? (
        <div className="mb-3 rounded-[12px] border border-[color:var(--line)] bg-coal-500/60 px-3 py-2 text-[12px] text-chalk-300">
          {note}
        </div>
      ) : null}

      <div className="mb-3 text-[12px]">
        {data.overlay.present ? (
          <span className="inline-flex items-center gap-2">
            <Chip tone="violet">overlay active</Chip>
            <code className="mono text-[11.5px] text-chalk-400">
              {data.overlay.path}
            </code>
          </span>
        ) : (
          <span className="text-chalk-400">
            No overlay. Create{" "}
            <code className="mono text-chalk-300">{data.overlay.path}</code> to
            add or refine a provider's models / effort.
          </span>
        )}
      </div>

      <div className="space-y-2">
        {ids.map((id) => {
          const c = data.catalog[id]!;
          const overlaid = data.sources[id] === "overlay";
          return (
            <div
              key={id}
              className="rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="mono text-[13.5px] font-medium text-chalk-100">
                  {id}
                </span>
                <Chip tone={overlaid ? "violet" : "neutral"}>
                  {overlaid ? "overlay" : "built-in"}
                </Chip>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-chalk-300">
                <span>
                  <span className="text-chalk-400">models </span>
                  {c.models.length ? (
                    <span className="mono text-chalk-200">
                      {c.models.join(", ")}
                    </span>
                  ) : (
                    <span className="text-chalk-400">
                      {c.modelEnabled ? "free-text" : "n/a"}
                    </span>
                  )}
                </span>
                <span>
                  <span className="text-chalk-400">effort </span>
                  {c.powerLevels.length ? (
                    <span className="mono text-chalk-200">
                      {c.powerLevels.join(" / ")}
                    </span>
                  ) : (
                    <span className="text-chalk-400">none</span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
