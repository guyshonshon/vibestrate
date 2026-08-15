/**
 * Route-level skeleton shapes.
 *
 * A dozen routes gate their whole body on one fetch and lead with the same
 * header, so the header's bone geometry lives here once instead of being
 * retyped per page. Anything reusable beyond routes belongs in
 * `components/design/Skeleton.tsx`; this file only mirrors layouts that
 * `app/routes/` owns.
 */
import {
  Skeleton,
  SkeletonBlock,
} from "../../components/design/Skeleton.js";

/**
 * A hero number that has not arrived yet.
 *
 * Deliberately a bare bone with no `Skeleton` root: on these pages the title,
 * purpose and actions around the number are already real and clickable, so
 * sweeping a sheen over them or marking the whole header aria-busy would both
 * claim more is missing than actually is.
 */
export function HeroNumber({ w = 52 }: { w?: number }) {
  return <SkeletonBlock h={30} w={w} radius={8} />;
}

/**
 * PageHero's frame in bones: the washed state column, the headline block, the
 * divided metric strip and the footer band, at the same paddings and dividers,
 * so the header does not resize when the page's data lands.
 */
export function PageHeroSkeleton({
  state = true,
  metrics = 4,
  footer = true,
  label = "Loading",
}: {
  state?: boolean;
  /** Cells in the divided strip. 0 drops the strip, matching a metric-less hero. */
  metrics?: number;
  footer?: boolean;
  label?: string;
}) {
  return (
    <Skeleton
      label={label}
      className="flex overflow-hidden rounded-[22px] border border-[color:var(--line)] bg-coal-600"
    >
      {state ? (
        <div className="flex w-[216px] shrink-0 flex-col justify-center gap-2 border-r border-[color:var(--line)] bg-coal-500/50 px-6 py-6">
          <SkeletonBlock h={30} w={72} radius={8} />
          <SkeletonBlock tone="text" h={14} w={104} />
          <SkeletonBlock className="mt-1" tone="text" h={12} w={132} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-6 px-6 pb-5 pt-6">
          <div className="min-w-0 flex-1">
            <SkeletonBlock h={26} w="34%" radius={8} />
            <div className="mt-3 flex flex-col gap-2">
              <SkeletonBlock tone="text" h={14} w="72%" />
              <SkeletonBlock tone="text" h={14} w="48%" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SkeletonBlock w={96} h={30} bordered />
          </div>
        </div>

        {metrics > 0 ? (
          <div className="flex border-t border-[color:var(--line)]">
            {Array.from({ length: metrics }, (_, i) => (
              <div
                key={i}
                className="min-w-0 flex-1 border-l border-[color:var(--line-soft)] px-5 py-4 first:border-l-0"
              >
                <SkeletonBlock h={30} w={52} radius={8} />
                <SkeletonBlock className="mt-2" tone="text" h={13} w={64} />
              </div>
            ))}
          </div>
        ) : null}

        {footer ? (
          <div className="border-t border-[color:var(--line)] bg-coal-500/45 px-6 py-3.5">
            <SkeletonBlock tone="text" h={13} w="42%" />
          </div>
        ) : null}
      </div>
    </Skeleton>
  );
}
