import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, type CrewPresetView, type PresetBlockView } from "../../lib/api.js";
import { serializeRoute, type Route } from "../../app/route.js";
import { Button } from "../design/Button.js";
import { StatTile } from "../design/StatTile.js";
import { EntityIcon } from "../design/EntityIcon.js";
import { ErrorState, type ErrorAction } from "../design/ErrorState.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonStats,
  SkeletonText,
} from "../design/Skeleton.js";
import { ErrorView } from "../../lib/error-view.js";
import type { Toast } from "../design/useToast.js";
import { Section } from "../layout/PageShell.js";

/** Ready-made crews (fast / thorough / cheap / local) the user can install with
 *  one click - parity with `vibe crew presets`. Self-contained: fetches its own
 *  list (with availability + what each would do) and asks the parent to reload
 *  the crews hub after an install. */

// Alternating row surfaces, the same pair the Profiles page stripes its cards
// with. coal-650 is the step that already sits between the card surface and the
// page behind it, and it inverts on its own in light theme. Keep the two lists
// on one pair so the app has a single stripe, not two that nearly match.
const ROW_SURFACE = ["bg-coal-600", "bg-coal-650"] as const;

function navTo(route: Route): void {
  window.location.hash = serializeRoute(route);
}

/** What the user can do about a preset that will not build here. Every case
 *  ends somewhere they can act, because a refusal with no route out is the
 *  defect this surface was rewritten to remove. `reason` is the server's own
 *  sentence, kept only as the fallback for a case this build does not know -
 *  a newer server can send one, and one unreadable row must not blank the list. */
function blockPanel(
  block: PresetBlockView | undefined,
  reason: string | undefined,
): { title: string; hint?: string; actions: ErrorAction[] } {
  switch (block?.code) {
    case "no_cheap_model":
      return {
        title: `No cheaper model is designated for ${block.provider}`,
        hint: `This preset works by dropping to a provider's cheapest model, and ${block.provider} has none named. A profile pinned to a cheaper model, with a crew built on it, lands in the same place.`,
        actions: [
          { label: "Pick a cheaper model", onClick: () => navTo({ kind: "profiles" }) },
          {
            label: "Compose a crew",
            onClick: () => navTo({ kind: "crew-editor", crewId: null }),
          },
        ],
      };
    case "no_effort_levels":
      return {
        title: `${block.provider} exposes one effort level`,
        hint: `Effort is the knob this preset turns, so the crew would come out identical to your default. A crew you compose still sets its own review-loop count, and claude or codex bring real effort levels.`,
        actions: [
          {
            label: "Compose a crew",
            onClick: () => navTo({ kind: "crew-editor", crewId: null }),
          },
          { label: "Add a provider", onClick: () => navTo({ kind: "providers" }) },
        ],
      };
    case "no_local_provider":
      return {
        title: "No local provider is configured",
        hint: "A local crew needs a provider that runs on this machine, such as ollama or another CLI you already have installed.",
        actions: [
          { label: "Add a local provider", onClick: () => navTo({ kind: "providers" }) },
        ],
      };
    case "provider_missing":
      return {
        title: `Your default crew runs on ${block.provider}, which is not configured`,
        hint: `Every preset is built on that provider, so all of them are stuck until it exists or the crew's profile points at one you have.`,
        actions: [
          { label: `Add ${block.provider}`, onClick: () => navTo({ kind: "providers" }) },
          { label: "Repoint the profile", onClick: () => navTo({ kind: "profiles" }) },
        ],
      };
    default:
      return {
        title: "This preset does not apply to your setup",
        hint: reason,
        actions: [{ label: "Open config", onClick: () => navTo({ kind: "config" }) }],
      };
  }
}

export function CrewPresets({
  onInstalled,
  flash,
}: {
  onInstalled: () => void;
  flash: (t: Toast) => void;
}) {
  const [presets, setPresets] = useState<CrewPresetView[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  // Keyed by preset id: an install refusal belongs on the row that caused it,
  // where it has room for the fix. A toast would drop the server's hint.
  const [installError, setInstallError] = useState<{ id: string; err: unknown } | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const r = await api.getCrewPresets();
      setPresets(r.presets);
    } catch (err) {
      setLoadError(err);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function install(id: string) {
    setBusy(id);
    setInstallError(null);
    try {
      const res = await api.installCrewPreset(id);
      flash({ kind: "ok", text: `Added the "${res.crewId}" crew on profile ${res.profileId}.` });
      await load();
      onInstalled();
    } catch (err) {
      setInstallError({ id, err });
    } finally {
      setBusy(null);
    }
  }

  // A project with no config yet has no presets to offer, and the crews hub
  // above already carries that empty state.
  if (!loadError && presets && presets.length === 0) return null;

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
          Each preset is your default crew's roster tuned one way - faster, more
          thorough, cheaper, or local. Installing one adds a crew and its profile
          to <span className="mono text-chalk-100">project.yml</span> and leaves
          what you already have in place.
        </p>

        {loadError ? (
          <ErrorView
            compact
            err={loadError}
            onRetry={() => void load()}
            actions={[{ label: "Open config", onClick: () => navTo({ kind: "config" }) }]}
          />
        ) : !presets ? (
          <Skeleton
            label="Loading crew presets"
            className="flex flex-col divide-y divide-[color:var(--line-soft)] overflow-hidden rounded-[18px] border border-[color:var(--line)]"
          >
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <SkeletonBlock w={16} h={16} radius={5} />
                      <SkeletonBlock tone="text" h={13} w={`${[38, 30, 46, 34][i]}%`} />
                    </div>
                    <SkeletonText lines={2} size={11} gap={6} />
                    <SkeletonStats count={3} className="mt-1" />
                  </div>
                  <SkeletonBlock w={96} h={28} />
                </div>
              </div>
            ))}
          </Skeleton>
        ) : (
          // Each preset is its own container, not a row in a divided list, and
          // the track is sized so a card stays card-shaped. A two-column grid
          // on a wide page gave 584px cards, which read as slabs however they
          // were bordered - auto-fill packs as many ~270px cards as fit and
          // stops them growing past 340px on an ultrawide screen.
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,340px))]">
            {presets.map((p) => {
              // `already_local` is the one refusal that is really a satisfied
              // state - the user has what the preset offers - so it reads as
              // covered rather than as a problem with a button on it.
              const covered =
                p.block?.code === "already_local" ? p.block.provider : null;
              const blocked = !p.installed && !p.available && covered === null;
              const panel = blocked ? blockPanel(p.block, p.reason) : null;
              return (
                <div
                  key={p.id}
                  className={`flex flex-col rounded-[16px] border p-4 transition ${
                    p.installed || covered !== null
                      ? "border-emerald-400/25 bg-emerald-400/[0.05]"
                      : blocked
                        ? "border-amber-soft/25 bg-amber-soft/[0.05]"
                        : "border-[color:var(--line)] bg-coal-600 hover:border-violet-soft/25"
                  }`}
                >
                  {/* Stacked, not a row with the action shoved to the right
                      edge: at card width the button belongs under what it acts
                      on. An installed or covered preset says so with its green
                      wash and its button ("Open crew" vs "Add to crews"), so it
                      carries no status word. */}
                  <div className="flex items-center gap-2">
                    <EntityIcon
                      entity="crew"
                      size={16}
                      className="shrink-0 text-violet-soft"
                    />
                    <span className="min-w-0 truncate text-[13.5px] font-bold text-chalk-100">
                      {p.label}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-chalk-300">
                    {covered !== null
                      ? `Your default crew already runs on ${covered}, which is local.`
                      : p.description}
                  </p>
                  {p.available && p.effect ? (
                    <div className="mt-2.5 flex flex-wrap items-stretch gap-1">
                      {effectStats(p.effect).map((s, n) => (
                        <StatTile key={n} value={s.value} label={s.label} />
                      ))}
                    </div>
                  ) : null}
                  {p.installed || p.available ? (
                    // mt-auto pins the action to the card's floor so a short
                    // description does not leave the button floating mid-card
                    // while its neighbour's sits lower.
                    <div className="mt-auto pt-3">
                      {p.installed ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          onClick={() => navTo({ kind: "crew", crewId: p.id })}
                        >
                          Open crew
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          disabled={busy === p.id}
                          iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
                          onClick={() => void install(p.id)}
                        >
                          {busy === p.id ? "Adding…" : "Add to crews"}
                        </Button>
                      )}
                    </div>
                  ) : null}

                  {panel ? (
                    <ErrorState
                      compact
                      inset
                      className="mt-3"
                      title={panel.title}
                      hint={panel.hint}
                      actions={panel.actions}
                    />
                  ) : null}

                  {installError?.id === p.id ? (
                    <ErrorView
                      compact
                      inset
                      className="mt-3"
                      err={installError.err}
                      onRetry={() => void install(p.id)}
                      actions={[
                        { label: "Open config", onClick: () => navTo({ kind: "config" }) },
                      ]}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
