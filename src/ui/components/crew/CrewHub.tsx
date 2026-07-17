import { Plus } from "lucide-react";
import type { CrewView, DiscoveredFlow } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import {
  HeroCard,
  type HeroMetric,
  type HeroTone,
} from "../design/HeroCard.js";
import { EntityIcon } from "../design/EntityIcon.js";
import { Section } from "../layout/PageShell.js";
import { computeCoverage } from "./helpers.js";

export function CrewHub({
  crews,
  defaultCrew,
  flows,
  settingDefault,
  onOpen,
  onSetDefault,
}: {
  crews: CrewView[] | null;
  defaultCrew: string | null;
  flows: DiscoveredFlow[];
  settingDefault: boolean;
  onOpen: (crewId: string) => void;
  onSetDefault: (crewId: string) => void;
}) {
  return (
    <Section
      title="Your crews"
      action={
        crews && crews.length > 0 ? (
          <span className="mono text-[12px] text-chalk-400">
            {crews.length} {crews.length === 1 ? "crew" : "crews"}
          </span>
        ) : null
      }
    >
      <p className="mb-4 max-w-[74ch] text-[13px] leading-[1.55] text-chalk-300">
        Each crew is a roster of roles. Pick one to configure its roles,
        profiles, and seats - or set the one runs use by default.
      </p>

      {!crews ? (
        <div className="text-[13px] text-chalk-300">Loading crews…</div>
      ) : crews.length === 0 ? (
        // Empty state is a CTA, not a dead end - a preset below installs one.
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-6 py-8 text-center">
          <p className="text-[13px] text-chalk-300">
            No crews yet. Install a ready-made preset to get your first roster.
          </p>
          <div className="mt-3 flex justify-center">
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
              onClick={() => {
                document
                  .getElementById("crew-presets")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              Add a crew preset
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {crews.map((c) => {
            const { knownSeats, coverage } = computeCoverage(c, flows);
            const uncovered = knownSeats.filter(
              (s) => coverage.get(s)?.status === "uncovered",
            ).length;
            const ambiguous = knownSeats.filter(
              (s) => coverage.get(s)?.status === "ambiguous",
            ).length;
            const isDefault = c.id === defaultCrew;
            // The status column carries roster health: gaps beat ambiguity
            // beats readiness; the default crew reads emerald.
            const tone: HeroTone =
              uncovered > 0
                ? "rose"
                : ambiguous > 0
                  ? "amber"
                  : isDefault
                    ? "emerald"
                    : "violet";
            const status =
              uncovered > 0 ? "gaps" : isDefault ? "default" : "ready";
            const statusSub =
              uncovered > 0
                ? `${uncovered} seat${uncovered === 1 ? "" : "s"} open`
                : isDefault
                  ? "runs by default"
                  : ambiguous > 0
                    ? `${ambiguous} ambiguous`
                    : "seats filled";
            const metrics: HeroMetric[] = [
              { value: c.roles.length, label: c.roles.length === 1 ? "role" : "roles" },
              uncovered > 0
                ? { value: uncovered, label: "uncovered", valueClass: "text-rose-300" }
                : { value: "all", label: "seats filled", valueClass: "text-emerald-400" },
              ...(ambiguous > 0
                ? [{ value: ambiguous, label: "ambiguous", valueClass: "text-amber-soft" }]
                : []),
            ];
            return (
              <HeroCard
                key={c.id}
                size="md"
                tone={tone}
                overline="Crew"
                status={status}
                statusSub={statusSub}
                title={
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="inline-flex min-w-0 items-center gap-2 bg-transparent p-0 text-left transition hover:text-violet-soft"
                  >
                    <EntityIcon
                      entity="crew"
                      size={15}
                      className="shrink-0 text-violet-soft"
                    />
                    <span className="truncate">{c.label}</span>
                  </button>
                }
                metrics={metrics}
                footer={
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpen(c.id)}
                    >
                      Configure
                    </Button>
                    {!isDefault ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={settingDefault}
                        onClick={() => onSetDefault(c.id)}
                      >
                        Set default
                      </Button>
                    ) : null}
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </Section>
  );
}
