import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../lib/api.js";
import { ErrorView } from "../../lib/error-view.js";
import type {
  PolicyStoreSnapshot,
  SafetyPoliciesConfig,
  ProjectPolicy,
} from "../../lib/types.js";
import {
  AdvancedSafetySection,
  GROUP_FRAME,
  SAFETY_GROUPS,
} from "./AdvancedSafetySection.js";
import { ProjectPoliciesSection } from "./ProjectPoliciesSection.js";
import { EnginePanel, PatchCheckPanel } from "./EngineToolsPanel.js";
import { Button } from "../design/Button.js";
import { Skeleton, SkeletonBlock } from "../design/Skeleton.js";
import { PageShell, Section } from "../layout/PageShell.js";
import { Deck, Cell } from "../layout/Deck.js";
import { PageHero, type HeroTone } from "../layout/PageHero.js";

/**
 * The project's rule surface.
 *
 * The page is FOR the owner's own policies; everything else is the frame those
 * policies run inside. So the left column leads with them and the deterministic
 * engine that backs a block, and the right column carries the gates and the
 * read-only patch checker. Two `half` cells rather than `wide` + `card`: `wide`
 * collapses to a full span below a 1360px content width, which turned the whole
 * two-column design into one very long column on a 1600px laptop.
 *
 * Every region is a `Section` heading over one bordered card, so a section
 * heading is never the same size as a row inside it.
 */
export function PoliciesPanel() {
  const [policies, setPolicies] = useState<ProjectPolicy[] | null>(null);
  const [snap, setSnap] = useState<PolicyStoreSnapshot | null>(null);
  const [safety, setSafety] = useState<SafetyPoliciesConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // The one path both the initial mount and manual retry share, so a retry
  // after a failed load re-runs exactly what mount would have done.
  const loadPolicies = useCallback(async () => {
    try {
      const r = await api.listProjectPolicies();
      setPolicies(r.policies);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPolicies();
    // Safe to degrade silently: the safety-gate config and the read-only engine
    // snapshot are secondary enrichments whose sections hold their loading
    // state rather than claiming a policy is off, and the primary policies list
    // above reports its own failures.
    api
      .getPolicies()
      .then((s) => {
        if (!cancelled) setSnap(s);
      })
      .catch(() => undefined);
    // Safe to degrade silently: see above - the safety section stays a skeleton
    // rather than showing every gate as disabled.
    api
      .getSafetyConfig()
      .then((sf) => {
        if (!cancelled) setSafety(sf);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loadPolicies]);

  async function toggleSafety(
    key: keyof Omit<SafetyPoliciesConfig, "requireApprovalAtStages">,
    value: boolean,
  ) {
    if (!safety) return;
    const prev = safety;
    setSafety({ ...safety, [key]: value }); // optimistic
    try {
      setSafety(await api.updateSafetyConfig({ [key]: value }));
      setError(null);
    } catch (err) {
      setSafety(prev);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const list = policies ?? [];
  const advise = list.filter((p) => p.confirmedAt && p.tier === "advise").length;
  const block = list.filter((p) => p.confirmedAt && p.tier === "block").length;
  const pending = list.filter((p) => !p.confirmedAt).length;

  // Unknown renders as unknown. Counting an unfetched config as zero live guards
  // put the hero on its alarm branch for the length of every load, telling the
  // owner a fail-closed gate was off while it was in fact still arriving.
  const guards = safety
    ? [
        safety.forbidMainBranchWrites,
        safety.forbidSecretsAccess,
        safety.forbidAutoPush,
        safety.forbidAutoMerge,
      ].filter(Boolean).length
    : null;

  const state: { value: string; caption: string; tone: HeroTone } =
    guards === null
      ? { value: "-", caption: "Checking guards", tone: "neutral" }
      : guards === 4
        ? { value: "4/4", caption: "Guards on", tone: "emerald" }
        : { value: `${guards}/4`, caption: "Guards off", tone: "amber" };

  return (
    <PageShell className="fade-up">
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            state={state}
            title="Policies"
            purpose="Your own rules, enforced by the reviewer and the merge gate."
            actions={
              adding ? null : (
                <Button
                  variant="primary"
                  size="sm"
                  // The walkthrough rings the way IN to authoring a rule, not the
                  // form: the form does not exist until this is pressed.
                  data-tour="policies-new"
                  iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
                  onClick={() => setAdding(true)}
                >
                  New policy
                </Button>
              )
            }
            metrics={[
              { value: policies ? advise : "-", label: "advise" },
              {
                value: policies ? block : "-",
                label: "block",
                tone: block > 0 ? "warn" : "default",
              },
              {
                value: policies ? pending : "-",
                label: "pending",
                tone: pending > 0 ? "warn" : "default",
              },
              { value: snap ? snap.rules.length + snap.actions.length : "-", label: "engine rules" },
            ]}
            footer={
              <>
                <code className="mono min-w-0 truncate text-chalk-100">
                  .vibestrate/policies/
                </code>
                <code className="mono shrink-0 rounded-[6px] bg-coal-500 px-1.5 py-0.5 text-chalk-300">
                  vibe policies list
                </code>
              </>
            }
          />
        </Cell>

        {error ? (
          <Cell size="full" reason="masthead">
            <ErrorView compact err={error} onRetry={() => void loadPolicies()} />
          </Cell>
        ) : null}

        {error ? null : (
          <>
            <Cell size="half" className="flex flex-col gap-4">
              {policies == null ? (
                <PolicyListSkeleton />
              ) : (
                <ProjectPoliciesSection
                  policies={policies}
                  adding={adding}
                  onAdding={setAdding}
                  onChanged={() => void loadPolicies()}
                />
              )}
              {snap == null ? <EngineSkeleton /> : <EnginePanel snap={snap} />}
            </Cell>

            <Cell size="half" className="flex flex-col gap-4">
              {safety == null ? (
                <SafetySkeleton />
              ) : (
                <AdvancedSafetySection
                  safety={safety}
                  onToggle={(k, v) => void toggleSafety(k, v)}
                />
              )}
              <PatchCheckPanel />
            </Cell>
          </>
        )}
      </Deck>
    </PageShell>
  );
}

/** One policy row's bones: tier label, statement, and the matcher line under it. */
function PolicyListSkeleton() {
  return (
    <Section flush title="Your policies">
      <Skeleton label="Loading policies" className={GROUP_FRAME}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={
              i > 0
                ? "flex items-start justify-between gap-3 border-t border-[color:var(--line-soft)] px-4 py-3"
                : "flex items-start justify-between gap-3 px-4 py-3"
            }
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <SkeletonBlock tone="text" h={12} w={38} />
                <SkeletonBlock tone="text" h={14} w={`${[54, 42, 62, 48][i]}%`} />
              </div>
              <SkeletonBlock tone="text" h={13} w={`${[30, 44, 26, 36][i]}%`} />
            </div>
            <SkeletonBlock w={24} h={24} />
          </div>
        ))}
      </Skeleton>
    </Section>
  );
}

function EngineSkeleton() {
  return (
    <Section flush title="Deterministic engine">
      <Skeleton label="Loading the deterministic engine" className={GROUP_FRAME}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={
              i > 0
                ? "flex flex-col gap-2 border-t border-[color:var(--line-soft)] px-4 py-3"
                : "flex flex-col gap-2 px-4 py-3"
            }
          >
            <div className="flex items-center gap-2">
              <SkeletonBlock tone="text" h={14} w={`${[34, 28, 40][i]}%`} />
              <SkeletonBlock tone="text" h={13} w={96} />
            </div>
            <SkeletonBlock tone="text" h={13} w={`${[78, 64, 70][i]}%`} />
            {/* Third bar: an engine rule always prints its matcher or glob under
              * the description, so a two-line bone would under-reserve the row. */}
            <SkeletonBlock tone="text" h={13} w={`${[36, 30, 44][i]}%`} />
          </div>
        ))}
      </Skeleton>
    </Section>
  );
}

/** Mirrors the real groups and their real row counts, so nothing reflows on arrival. */
function SafetySkeleton() {
  return (
    <>
      {SAFETY_GROUPS.map((group) => (
        <Section flush key={group.title} title={group.title}>
          <Skeleton label={`Loading ${group.title.toLowerCase()}`} className={GROUP_FRAME}>
            {group.rows.map((row, i) => (
              <div
                key={row.key}
                className={
                  i > 0
                    ? "flex items-start justify-between gap-4 border-t border-[color:var(--line-soft)] px-4 py-3"
                    : "flex items-start justify-between gap-4 px-4 py-3"
                }
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <SkeletonBlock tone="text" h={14} w={`${[52, 44, 58, 48][i % 4]}%`} />
                  {row.hint ? (
                    <SkeletonBlock tone="text" h={13} w={`${[74, 66, 80][i % 3]}%`} />
                  ) : null}
                </div>
                <SkeletonBlock w={44} h={24} radius={999} />
              </div>
            ))}
          </Skeleton>
        </Section>
      ))}
    </>
  );
}
