/**
 * Loading skeletons - the one placeholder vocabulary for the whole app.
 *
 * A skeleton MIRRORS the geometry of the thing that is arriving: the same
 * tiles, rows, columns and card outlines, drawn as bones. That is the whole
 * contract. A centered headline with two sentences of prose is not a loading
 * state, it is a different screen that jumps to another layout when the data
 * lands - which is what these replace.
 *
 * Derived from the one real skeleton the app already had (the codebase map
 * panel): tinted blocks, hairline borders on framed shapes, 10px radius on
 * solid shapes and 6px on text bars.
 *
 * Rules baked in so call sites cannot get them wrong:
 *  - No pulsing. A single low-contrast sheen sweeps left to right, once per
 *    loading region, and rests between passes. It is linear, not eased: an
 *    ease-in-out loop is what reads as breathing.
 *  - The sheen lives on the region, not the bone. Per-bone sweeps run at a
 *    speed proportional to each bone's own width, so a panel of mixed-width
 *    bones desynchronises into visual noise.
 *  - prefers-reduced-motion drops the sheen entirely and leaves static bones.
 *  - One live region per loading area, announced once. The bones themselves
 *    are aria-hidden, so a screen reader hears "Loading runs", not a wall of
 *    empty boxes.
 */
import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "./cn.js";

/**
 * Bone fill is an alpha neutral rather than a coal step, because coal inverts
 * between themes: `coal-500` is #2b2b2e in dark but #f1f1f3 in light, so a
 * coal-tinted bone on a white card is invisible. An alpha overlay lightens a
 * dark surface and darkens a light one, which is the same trick the `--line`
 * tokens use.
 */
const SKELETON_CSS = `
:root {
  --sk-bone: rgba(255, 255, 255, 0.05);
  --sk-bone-strong: rgba(255, 255, 255, 0.085);
  --sk-sheen: rgba(255, 255, 255, 0.06);
}
:root.light {
  --sk-bone: rgba(20, 18, 30, 0.055);
  --sk-bone-strong: rgba(20, 18, 30, 0.09);
  --sk-sheen: rgba(20, 18, 30, 0.045);
}
@keyframes vibestrate-skeleton-sweep {
  0%   { transform: translateX(-135%); }
  55%  { transform: translateX(135%); }
  100% { transform: translateX(135%); }
}
.vs-skeleton { position: relative; isolation: isolate; overflow: hidden; }
.vs-skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(100deg, transparent 34%, var(--sk-sheen) 50%, transparent 66%);
  animation: vibestrate-skeleton-sweep 2.6s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .vs-skeleton::after { display: none; }
}
`;

/** Nested regions collapse to plain wrappers - see `Skeleton`. */
const InsideSkeleton = createContext(false);

export type SkeletonLen = number | string;

/** A number is px; a string is any CSS length ("60%", "12ch", "auto"). */
function len(v: SkeletonLen | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "number" ? `${v}px` : v;
}

function pick(xs: readonly number[], i: number): number {
  return xs[i % xs.length] ?? 100;
}

/**
 * The root of one loading region. Wrap the bones for a panel, a list, a page
 * section - whatever swaps to real content in a single step.
 *
 * Carries the live region and the sheen, so composing bones without it gives
 * silent, static blocks. A `Skeleton` nested inside another renders as a plain
 * wrapper: a second sheen would cross the first, and a second live region would
 * make a screen reader announce the same load twice.
 */
export function Skeleton({
  label = "Loading",
  className,
  style,
  children,
}: {
  /** Announced once. Name the thing, e.g. "Loading runs". */
  label?: string;
  /** Layout for the region: padding, flex/grid, gaps. */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const nested = useContext(InsideSkeleton);
  if (nested) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <>
      {/* React hoists and de-duplicates this by href, so the primitive stays
       * self-contained instead of leaking keyframes into the global sheet. */}
      <style href="vibestrate-skeleton" precedence="medium">
        {SKELETON_CSS}
      </style>
      <div
        role="status"
        aria-busy="true"
        className={cn("vs-skeleton", className)}
        style={style}
      >
        <span className="sr-only">{label}</span>
        <InsideSkeleton.Provider value={true}>
          {/* `contents` keeps the bones as direct children of the region's own
           * flex/grid layout. */}
          <div aria-hidden="true" className="contents">
            {children}
          </div>
        </InsideSkeleton.Provider>
      </div>
    </>
  );
}

export type SkeletonTone = "block" | "text";

/**
 * One bone. `block` is a solid shape (tile, button, avatar, chart body);
 * `text` is the fainter bar that stands in for a line of type.
 *
 * Geometry goes through `style`, never a class: Tailwind generates utilities by
 * scanning literal source text, so an interpolated `h-[${n}px]` produces no CSS.
 */
export function SkeletonBlock({
  w = "100%",
  h = 12,
  radius,
  tone = "block",
  bordered = false,
  className,
  style,
}: {
  w?: SkeletonLen;
  h?: SkeletonLen;
  /** px. Defaults to 10 for `block`, 6 for `text`. */
  radius?: number;
  tone?: SkeletonTone;
  /** Hairline frame, for bones standing in for framed tiles and controls. */
  bordered?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        bordered && "border border-[color:var(--line-soft)]",
        className,
      )}
      style={{
        width: len(w),
        height: len(h),
        borderRadius: radius ?? (tone === "text" ? 6 : 10),
        background: tone === "text" ? "var(--sk-bone)" : "var(--sk-bone-strong)",
        // A pixel width is an intentionally fixed shape, so it holds its size
        // under flex pressure; a percentage or auto width is meant to give.
        flexShrink: typeof w === "number" ? 0 : undefined,
        ...style,
      }}
    />
  );
}

/** Line lengths that read as prose instead of a solid rectangle. */
const PROSE_RHYTHM = [100, 92, 78, 96, 84] as const;

/**
 * A run of text bars. The last line is cut short, the way a real paragraph
 * ends, so the block does not read as a filled panel.
 */
export function SkeletonText({
  lines = 3,
  width = "prose",
  size = 12,
  gap = 8,
  className,
}: {
  lines?: number;
  /** `full` for mono/terminal bodies, `narrow` for captions under a title. */
  width?: "prose" | "full" | "narrow";
  /** Bar height in px. Bones are not type, so this is free of the 12px text floor. */
  size?: number;
  /** px between bars. */
  gap?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)} style={{ gap }}>
      {Array.from({ length: Math.max(0, lines) }, (_, i) => {
        const base =
          width === "full"
            ? 100
            : width === "narrow"
              ? Math.min(pick(PROSE_RHYTHM, i), 70)
              : pick(PROSE_RHYTHM, i);
        const pct = i === lines - 1 && lines > 1 ? Math.min(base, 62) : base;
        return <SkeletonBlock key={i} tone="text" h={size} w={`${pct}%`} />;
      })}
    </div>
  );
}

const ROW_TITLE_RHYTHM = [72, 54, 84, 46, 66, 60] as const;
const ROW_META_RHYTHM = [38, 30, 46, 26, 34] as const;

export type SkeletonRowLead = "dot" | "icon" | "avatar";

const LEAD_SIZE: Record<SkeletonRowLead, number> = {
  dot: 8,
  icon: 16,
  avatar: 28,
};

/**
 * A repeated list row: file rows, finding rows, commit rows, run rows, feed
 * entries. Widths vary per row so the stack reads as a list of different
 * things rather than a striped block.
 */
export function SkeletonRows({
  rows = 4,
  lead,
  meta = false,
  trailing = false,
  divided = false,
  className,
}: {
  rows?: number;
  /** Leading mark: status dot, file/kind icon, or an avatar. */
  lead?: SkeletonRowLead;
  /** Second, shorter bar under the title - a path, a timestamp, a role. */
  meta?: boolean;
  /** Right-aligned short bar - a count, a duration, a relative time. */
  trailing?: boolean;
  /** Hairline between rows, for rows that sit inside a framed card. */
  divided?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", !divided && "gap-2.5", className)}>
      {Array.from({ length: Math.max(0, rows) }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-2.5",
            divided && "py-2.5",
            divided && i > 0 && "border-t border-[color:var(--line-soft)]",
          )}
        >
          {lead ? (
            <SkeletonBlock
              w={LEAD_SIZE[lead]}
              h={LEAD_SIZE[lead]}
              radius={lead === "icon" ? 6 : 999}
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <SkeletonBlock
              tone="text"
              h={12}
              w={`${pick(ROW_TITLE_RHYTHM, i)}%`}
            />
            {meta ? (
              <SkeletonBlock
                tone="text"
                h={10}
                w={`${pick(ROW_META_RHYTHM, i)}%`}
              />
            ) : null}
          </div>
          {trailing ? <SkeletonBlock tone="text" h={10} w={44} /> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * A row of StatTile-shaped bones. `sm` matches the compact card-row tile, `lg`
 * the prominent header metric, so the row does not resize when the numbers land.
 */
export function SkeletonStats({
  count = 4,
  size = "sm",
  className,
}: {
  count?: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  const g =
    size === "lg"
      ? { w: 116, h: 62, radius: 14 }
      : { w: 92, h: 52, radius: 10 };
  return (
    <div
      className={cn("flex flex-wrap", size === "lg" ? "gap-2" : "gap-1.5", className)}
    >
      {Array.from({ length: Math.max(0, count) }, (_, i) => (
        <SkeletonBlock key={i} w={g.w} h={g.h} radius={g.radius} bordered />
      ))}
    </div>
  );
}

const CELL_RHYTHM = [86, 58, 52, 54, 44, 48, 68, 22] as const;

/**
 * A column-aligned table. Pass `columns` as a count for equal columns, or as an
 * array of widths (px numbers or CSS lengths, `"1fr"` included) to mirror a
 * table whose columns are not equal.
 */
export function SkeletonTable({
  columns = 4,
  rows = 6,
  head = true,
  className,
}: {
  columns?: number | ReadonlyArray<SkeletonLen>;
  rows?: number;
  head?: boolean;
  className?: string;
}) {
  const template =
    typeof columns === "number"
      ? `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`
      : columns.map((c) => len(c) ?? "1fr").join(" ");
  const count = typeof columns === "number" ? Math.max(1, columns) : columns.length;

  return (
    <div className={className}>
      {head ? (
        <div
          className="grid items-center gap-3 border-b border-[color:var(--line-soft)] px-4 py-2.5"
          style={{ gridTemplateColumns: template }}
        >
          {Array.from({ length: count }, (_, c) => (
            <SkeletonBlock key={c} tone="text" h={10} w={`${pick([54, 40, 46], c)}%`} />
          ))}
        </div>
      ) : null}
      {Array.from({ length: Math.max(0, rows) }, (_, r) => (
        <div
          key={r}
          className={cn(
            "grid items-center gap-3 px-4 py-3",
            (r > 0 || head) && "border-t border-[color:var(--line-soft)]",
          )}
          style={{ gridTemplateColumns: template }}
        >
          {Array.from({ length: count }, (_, c) => (
            <SkeletonBlock
              key={c}
              tone="text"
              h={12}
              w={`${pick(CELL_RHYTHM, c + r)}%`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A grid of card outlines: title, two lines, and a footer control pair. Draws
 * its own hairline frame, so it stands in for cards that bring their own chrome
 * rather than for cards already sitting inside a framed cell.
 */
export function SkeletonCards({
  count = 4,
  columns = 2,
  height = 148,
  className,
}: {
  count?: number;
  columns?: number;
  /** px. Match the real card so the grid does not jump. */
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("grid gap-3", className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: Math.max(0, count) }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-[16px] border border-[color:var(--line-soft)] p-4"
          style={{ height }}
        >
          <SkeletonBlock h={14} w={`${pick([56, 44, 68, 50], i)}%`} />
          <SkeletonText lines={2} size={11} gap={7} />
          <div className="mt-auto flex gap-1.5">
            <SkeletonBlock w={64} h={22} />
            <SkeletonBlock w={44} h={22} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A rising area silhouette - enough shape to read as a chart, not as data. */
const AREA_CLIP =
  "polygon(0% 74%, 9% 60%, 19% 68%, 29% 43%, 39% 52%, 50% 31%, 61% 42%, 71% 25%, 82% 35%, 91% 19%, 100% 27%, 100% 100%, 0% 100%)";

const BAR_RHYTHM = [92, 71, 58, 44, 33, 21] as const;

export type SkeletonChartVariant = "area" | "bars" | "donut" | "grid";

/**
 * A chart-shaped placeholder. Metrics panels are fixed-height board tiles, so
 * pass the same `height` the real chart renders at.
 *
 * `area` for trend charts, `bars` for the horizontal by-role breakdowns,
 * `donut` for the outcome ring, `grid` for the day-by-hour heatmap.
 */
export function SkeletonChart({
  variant = "area",
  height = 240,
  className,
}: {
  variant?: SkeletonChartVariant;
  /** px. */
  height?: number;
  className?: string;
}) {
  if (variant === "donut") {
    const d = Math.min(height, 200);
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ height }}
      >
        <div
          style={{
            width: d,
            height: d,
            borderRadius: 999,
            border: `${Math.round(d * 0.17)}px solid var(--sk-bone-strong)`,
          }}
        />
      </div>
    );
  }

  if (variant === "bars") {
    return (
      <div
        className={cn("flex flex-col justify-between", className)}
        style={{ height }}
      >
        {BAR_RHYTHM.map((pct, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonBlock tone="text" h={10} w={72} />
            <SkeletonBlock h={14} w={`${pct}%`} radius={6} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "grid") {
    // The activity heatmap is a fixed day-by-hour matrix, so the placeholder is
    // the same matrix rather than a tunable grid.
    return (
      <div className={cn("flex flex-col gap-1", className)} style={{ height }}>
        {Array.from({ length: 7 }, (_, r) => (
          <div key={r} className="flex flex-1 gap-1">
            {Array.from({ length: 24 }, (_, c) => (
              <div
                key={c}
                className="flex-1 rounded-[3px]"
                style={{
                  background:
                    (r + c) % 3 === 0 ? "var(--sk-bone-strong)" : "var(--sk-bone)",
                }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} style={{ height }}>
      <div
        className="flex-1"
        style={{ background: "var(--sk-bone-strong)", clipPath: AREA_CLIP }}
      />
      <div className="flex justify-between">
        {Array.from({ length: 7 }, (_, i) => (
          <SkeletonBlock key={i} tone="text" h={9} w={26} />
        ))}
      </div>
    </div>
  );
}
