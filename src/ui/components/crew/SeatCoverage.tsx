import { useState } from "react";
import type { CrewView } from "../../lib/types.js";
import { annularPath } from "../design/ring.js";
import { ToneDot, type ChipTone } from "../design/Chip.js";
import { cn } from "../design/cn.js";
import {
  TONE_TEXT,
  TONE_LINE,
  TONE_WIRE,
  WORKTYPE_LABEL,
  type SeatCoverageEntry,
  type SeatStatus,
} from "./helpers.js";

type SeatArc = {
  seat: string;
  roleLabel: string;
  groupKey: string;
  tone: ChipTone;
  status: SeatStatus;
  d: string;
};

// The relation as a shape: one ring = the full set of seats, each seat an arc
// coloured by the role that fills it, so a role's seats read as one coloured
// wedge. Empty seats are hollow dashed gaps. Centre = the coverage count, or
// the hovered seat -> its role.
export function SeatCoverage({
  seats,
  coverage,
  crew,
}: {
  seats: string[];
  coverage: Map<string, SeatCoverageEntry>;
  crew: CrewView;
}) {
  const [hoverSeat, setHoverSeat] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  if (seats.length === 0) return null;

  const uncovered = seats.filter((s) => coverage.get(s)?.status === "uncovered");
  const ambiguous = seats.filter((s) => coverage.get(s)?.status === "ambiguous");
  const filled = seats.length - uncovered.length;

  // On the ring, adjacent roles must be visually distinct - so colour by role
  // order through the palette, not by the toneForId hash (which clusters
  // several roles onto the same hue and blurs their wedges together).
  const PALETTE: ChipTone[] = [
    "violet",
    "emerald",
    "amber",
    "sky",
    "rose",
    "neutral",
  ];
  const roleTone = (roleId: string): ChipTone =>
    PALETTE[
      Math.max(
        0,
        crew.roles.findIndex((r) => r.id === roleId),
      ) % PALETTE.length
    ]!;

  // Ordered seat list, grouped: each role's covered seats, then a "several
  // takers" group, then the empty seats. Sectors of the ring, in this order.
  const items: {
    seat: string;
    roleLabel: string;
    groupKey: string;
    tone: ChipTone;
    status: SeatStatus;
  }[] = [];
  for (const role of crew.roles) {
    for (const seat of role.seats) {
      if (coverage.get(seat)?.status !== "covered") continue;
      items.push({
        seat,
        roleLabel: role.label,
        groupKey: role.id,
        tone: roleTone(role.id),
        status: "covered",
      });
    }
  }
  for (const seat of ambiguous) {
    items.push({
      seat,
      roleLabel: `${coverage.get(seat)!.roleIds.length} roles`,
      groupKey: "__amb",
      tone: "amber",
      status: "ambiguous",
    });
  }
  for (const seat of uncovered) {
    items.push({
      seat,
      roleLabel: "unassigned",
      groupKey: "__unc",
      tone: "rose",
      status: "uncovered",
    });
  }

  const total = items.length;
  const groups = new Set(items.map((i) => i.groupKey)).size;
  const cx = 90;
  const cy = 90;
  const ro = 82;
  const ri = 56;
  const groupGap = 0.05;
  const seatGap = 0.028;
  const usable = Math.PI * 2 - groupGap * groups;
  const seatAngle = usable / total;

  const arcs: SeatArc[] = [];
  let a = -Math.PI / 2;
  let prevKey: string | null = null;
  for (const it of items) {
    if (prevKey !== null && it.groupKey !== prevKey) a += groupGap;
    const d = annularPath(cx, cy, ri, ro, a, a + seatAngle - seatGap);
    arcs.push({ ...it, d });
    a += seatAngle;
    prevKey = it.groupKey;
  }

  const hovered = hoverSeat ? arcs.find((x) => x.seat === hoverSeat) : null;
  const hoveredGroup =
    !hovered && hoverKey ? arcs.find((x) => x.groupKey === hoverKey) : null;

  const lit = (arc: SeatArc) => {
    if (hoverSeat) return arc.seat === hoverSeat;
    if (hoverKey) return arc.groupKey === hoverKey;
    return true;
  };

  // The group currently hovered (via an arc or a legend row) - drives the
  // detail tree on the right.
  const activeKey = hoverSeat
    ? (arcs.find((x) => x.seat === hoverSeat)?.groupKey ?? null)
    : hoverKey;
  let activeGroup: {
    label: string;
    tone: ChipTone;
    seats: string[];
    workType?: string;
  } | null = null;
  if (activeKey === "__amb") {
    activeGroup = { label: "Several takers", tone: "amber", seats: ambiguous };
  } else if (activeKey === "__unc") {
    activeGroup = { label: "Unassigned", tone: "rose", seats: uncovered };
  } else if (activeKey) {
    const role = crew.roles.find((r) => r.id === activeKey);
    if (role) {
      activeGroup = {
        label: role.label,
        tone: roleTone(role.id),
        workType:
          WORKTYPE_LABEL[role.permissions] ??
          role.permissions.replace(/_/g, " "),
        seats: role.seats.filter(
          (s) => coverage.get(s)?.status === "covered",
        ),
      };
    }
  }

  return (
    <div className="flex w-full max-w-[640px] items-stretch gap-5 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5">
        <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
          <svg width="180" height="180" viewBox="0 0 180 180">
            {arcs.map((arc) => {
              const empty = arc.status === "uncovered";
              return (
                <path
                  key={arc.seat}
                  d={arc.d}
                  onMouseEnter={() => setHoverSeat(arc.seat)}
                  onMouseLeave={() => setHoverSeat(null)}
                  className={cn(
                    "cursor-default transition-opacity duration-150",
                    empty ? "text-rose-300" : TONE_TEXT[arc.tone],
                    lit(arc) ? "opacity-100" : "opacity-25",
                  )}
                  fill="currentColor"
                  fillOpacity={empty ? 0.1 : 0.9}
                  stroke="currentColor"
                  strokeOpacity={empty ? 0.55 : 0}
                  strokeWidth={1}
                  strokeDasharray={empty ? "3 3" : undefined}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {hovered ? (
              <>
                <span className="max-w-[110px] truncate font-mono text-[12.5px] font-semibold text-chalk-100">
                  {hovered.seat}
                </span>
                <span
                  className={cn(
                    "text-[10.5px]",
                    hovered.status === "uncovered"
                      ? "text-rose-300"
                      : hovered.status === "ambiguous"
                        ? "text-amber-soft"
                        : "text-chalk-400",
                  )}
                >
                  {hovered.status === "covered" ? "→ " : ""}
                  {hovered.roleLabel}
                </span>
              </>
            ) : hoveredGroup ? (
              <>
                <span className="max-w-[110px] truncate text-[13px] font-bold text-chalk-100">
                  {hoveredGroup.groupKey === "__amb"
                    ? "Several takers"
                    : hoveredGroup.groupKey === "__unc"
                      ? "Unassigned"
                      : hoveredGroup.roleLabel}
                </span>
                <span className="text-[10.5px] text-chalk-400">
                  {arcs.filter((x) => x.groupKey === hoveredGroup.groupKey).length}{" "}
                  seat
                  {arcs.filter((x) => x.groupKey === hoveredGroup.groupKey)
                    .length === 1
                    ? ""
                    : "s"}
                </span>
              </>
            ) : (
              <>
                <span className="text-[24px] font-extrabold leading-none text-chalk-100">
                  {filled}
                  <span className="text-chalk-400">/{seats.length}</span>
                </span>
                <span className="mt-1 text-[10.5px] text-chalk-400">
                  seats filled
                </span>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {crew.roles.map((role) => {
            const count = role.seats.filter(
              (s) => coverage.get(s)?.status === "covered",
            ).length;
            if (count === 0) return null;
            return (
              <div
                key={role.id}
                onMouseEnter={() => setHoverKey(role.id)}
                onMouseLeave={() => setHoverKey(null)}
                className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[12px] transition-colors hover:bg-coal-500/50"
              >
                <ToneDot tone={roleTone(role.id)} />
                <span className="truncate font-medium text-chalk-100">
                  {role.label}
                </span>
                <span className="ml-auto shrink-0 text-[10px] text-chalk-400">
                  {WORKTYPE_LABEL[role.permissions] ??
                    role.permissions.replace(/_/g, " ")}
                </span>
                <span className="w-3 shrink-0 text-right font-mono text-[11px] text-chalk-400">
                  {count}
                </span>
              </div>
            );
          })}
          {ambiguous.length > 0 ? (
            <div
              onMouseEnter={() => setHoverKey("__amb")}
              onMouseLeave={() => setHoverKey(null)}
              className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[12px] transition-colors hover:bg-coal-500/50"
            >
              <ToneDot tone="amber" />
              <span className="truncate font-medium text-amber-soft">
                Several takers
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-chalk-400">
                {ambiguous.length}
              </span>
            </div>
          ) : null}
          {uncovered.length > 0 ? (
            <div
              onMouseEnter={() => setHoverKey("__unc")}
              onMouseLeave={() => setHoverKey(null)}
              className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[12px] transition-colors hover:bg-coal-500/50"
            >
              <ToneDot tone="rose" />
              <span className="truncate font-medium text-rose-300">
                Unassigned - assign below
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-rose-300">
                {uncovered.length}
              </span>
            </div>
          ) : null}
        </div>

        <SeatPyramid group={activeGroup} activeSeat={hoverSeat} />
      </div>
  );
}

// The hover detail: the role at the top, the seats it takes wired beneath it -
// a role apex over its seats, connected by a tone-coloured trunk + elbows.
function SeatPyramid({
  group,
  activeSeat,
}: {
  group: {
    label: string;
    tone: ChipTone;
    seats: string[];
    workType?: string;
  } | null;
  activeSeat: string | null;
}) {
  return (
    <div className="flex w-[196px] shrink-0 flex-col rounded-[14px] border border-[color:var(--line)] bg-coal-800/50 p-3">
      {!group ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-center text-[11px] leading-[1.5] text-chalk-400">
            Hover a role to see
            <br />
            the seats it takes
          </span>
        </div>
      ) : (
        <div>
          <div
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-[9px] border px-2.5 py-1",
              TONE_LINE[group.tone],
            )}
          >
            <ToneDot tone={group.tone} />
            <span className="truncate text-[11.5px] font-semibold text-chalk-100">
              {group.label}
            </span>
          </div>
          {group.seats.length === 0 ? (
            <div className="mt-2 pl-1 text-[11px] italic text-chalk-400">
              no seats
            </div>
          ) : (
            <div className="mt-2">
              {group.workType ? (
                <div className="mb-1 pl-1 text-[10.5px] font-semibold text-chalk-400">
                  {group.workType}
                </div>
              ) : null}
              <div
                className={cn(
                  "relative ml-[10px] space-y-1.5 border-l-2 pl-4",
                  TONE_LINE[group.tone],
                )}
              >
                {group.seats.map((seat) => (
                  <div key={seat} className="relative flex items-center">
                    <span
                      className={cn(
                        "absolute -left-4 top-1/2 h-px w-4 -translate-y-1/2",
                        TONE_WIRE[group.tone],
                      )}
                    />
                    <span
                      className={cn(
                        "rounded-[7px] px-2 py-[3px] font-mono text-[11px]",
                        seat === activeSeat
                          ? "bg-coal-500 text-chalk-100"
                          : "bg-coal-600 text-chalk-200",
                      )}
                    >
                      {seat}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
