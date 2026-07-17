import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, type CrewPresetView } from "../../lib/api.js";
import { Button } from "../design/Button.js";
import { StatTile } from "../design/StatTile.js";
import { EntityIcon } from "../design/EntityIcon.js";
import type { Toast } from "../design/useToast.js";
import { Section } from "../layout/PageShell.js";

/** Ready-made crews (fast / thorough / cheap / local) the user can install with
 *  one click - parity with `vibe crew presets`. Self-contained: fetches its own
 *  list (with availability + what each would do) and asks the parent to reload
 *  the crews hub after an install. */
export function CrewPresets({
  onInstalled,
  flash,
}: {
  onInstalled: () => void;
  flash: (t: Toast) => void;
}) {
  const [presets, setPresets] = useState<CrewPresetView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.getCrewPresets();
      setPresets(r.presets);
    } catch {
      setPresets([]);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function install(id: string) {
    setBusy(id);
    try {
      const res = await api.installCrewPreset(id);
      flash({ kind: "ok", text: `Installed "${res.crewId}" crew (profile ${res.profileId}).` });
      await load();
      onInstalled();
    } catch (err) {
      flash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  if (!presets || presets.length === 0) return null;

  // The preset's effect surfaced as stat tiles so facts read as data, not a
  // grey dot-separated meta line.
  type Stat = { value: string | number; label: string };
  const effectStats = (e: NonNullable<CrewPresetView["effect"]>): Stat[] => {
    const rows: (Stat | null)[] = [
      { value: e.provider, label: "provider" },
      e.power ? { value: e.power, label: "effort" } : null,
      e.model ? { value: e.model, label: "model" } : null,
      e.maxReviewLoops !== null
        ? {
            value: e.maxReviewLoops,
            label: e.maxReviewLoops === 1 ? "review loop" : "review loops",
          }
        : null,
    ];
    return rows.filter((x): x is Stat => x !== null);
  };

  return (
    <div id="crew-presets">
    <Section title="Presets">
      <p className="mb-3 max-w-[74ch] text-[13px] leading-[1.55] text-chalk-300">
        Ready-made crews over the same roster as your default crew - faster, more
        thorough, cheaper, or local. Adds to{" "}
        <span className="mono text-chalk-100">project.yml</span> without
        overwriting anything.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((p) => (
          <div
            key={p.id}
            className="flex flex-col rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4"
          >
            <div className="flex items-center gap-2">
              <EntityIcon
                entity="crew"
                size={16}
                className="shrink-0 text-violet-soft"
              />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-chalk-100">
                {p.label}
              </span>
              {p.installed ? (
                <span className="shrink-0 text-[11px] font-semibold text-emerald-400">
                  installed
                </span>
              ) : !p.available ? (
                <span className="shrink-0 text-[11px] font-medium text-chalk-400">
                  n/a here
                </span>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-chalk-300">
              {p.description}
            </p>
            {!p.installed && p.available && p.effect ? (
              <div className="mt-3 flex flex-wrap items-stretch gap-1">
                {effectStats(p.effect).map((s, i) => (
                  <StatTile key={i} value={s.value} label={s.label} />
                ))}
              </div>
            ) : null}
            {!p.available && p.reason ? (
              <p className="mt-2 text-[11.5px] text-amber-soft">{p.reason}</p>
            ) : null}
            {!p.installed && p.available ? (
              <div className="mt-3.5 flex items-center gap-1.5 border-t border-[color:var(--line-soft)] pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy === p.id}
                  iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
                  onClick={() => void install(p.id)}
                >
                  {busy === p.id ? "Adding…" : "Add to crews"}
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
    </div>
  );
}
