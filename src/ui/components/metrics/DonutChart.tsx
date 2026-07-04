import type { ReactNode } from "react";
import { Group } from "@visx/group";
import { Pie } from "@visx/shape";

export type DonutSlice = { key: string; value: number; color: string };

/**
 * A thick rounded-cap donut (the reference "Digit" style) via visx Pie. Slices
 * sum to the whole, so no track is drawn; `cornerRadius` rounds every cap and a
 * small `padAngle` sets them apart. Centre is a free slot for the headline.
 */
export function DonutChart({
  slices,
  size = 168,
  thickness = 18,
  children,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const data = slices.filter((s) => s.value > 0);
  const radius = size / 2;
  const outer = radius - 2;
  const inner = radius - thickness;
  const single = data.length === 1;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <Group top={radius} left={radius}>
          <Pie
            data={data}
            pieValue={(d) => d.value}
            outerRadius={outer}
            innerRadius={inner}
            cornerRadius={single ? 0 : thickness / 2}
            padAngle={single ? 0 : 0.035}
          >
            {(pie) =>
              pie.arcs.map((arc) => (
                <path
                  key={arc.data.key}
                  d={pie.path(arc) ?? ""}
                  fill={arc.data.color}
                />
              ))
            }
          </Pie>
        </Group>
      </svg>
      {children ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
