/**
 * Entity identity icons - the single source of truth for how each core model
 * (flow / crew / persona / task / run) is drawn. One symbol per model, reused
 * everywhere (composer, cards, nav, run tree) so the visual becomes memorable
 * and "connectable" for the user.
 *
 * Style: "Set 2 - Geometric" (chosen 2026-06-27). Constructed, single-hue,
 * abstract. The Flow glyph deliberately reuses the ascending-bars motif so the
 * icon and the in-card flow bars read as the same idea.
 *
 * All glyphs draw in `currentColor` (fill + stroke), so the caller sets the
 * color with a text utility (`text-violet-soft`, `text-chalk-400`, ...) and the
 * icon themes/inverts for free in light and dark.
 */
import type { SVGProps } from "react";

export type EntityKind = "flow" | "crew" | "persona" | "task" | "run";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Flow - ascending bars (echoes the in-card flow step bars). */
export function FlowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="13" width="3.4" height="8" rx="1.2" fill="currentColor" fillOpacity="0.45" />
      <rect x="8" y="9.5" width="3.4" height="11.5" rx="1.2" fill="currentColor" fillOpacity="0.65" />
      <rect x="13" y="6" width="3.4" height="15" rx="1.2" fill="currentColor" fillOpacity="0.85" />
      <rect x="18" y="3" width="3.4" height="18" rx="1.2" fill="currentColor" />
    </Svg>
  );
}

/** Crew - a connected triad of nodes (a team / network). */
export function CrewIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6.5 7.5 H17.5 M6.5 7.5 L12 18 M17.5 7.5 L12 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeOpacity="0.5"
        strokeLinecap="round"
      />
      <circle cx="6.5" cy="7.5" r="2.6" fill="currentColor" />
      <circle cx="17.5" cy="7.5" r="2.6" fill="currentColor" />
      <circle cx="12" cy="18" r="2.6" fill="currentColor" />
    </Svg>
  );
}

/** Persona - a facet/diamond with a centered lens (the supervisor's view). */
export function PersonaIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </Svg>
  );
}

/** Task - a card with a check (a unit of work, done or to do). */
export function TaskIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 12.2 L11 15.2 L16.2 9.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Run - a forward double-chevron (execution / play). */
export function RunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6 5.5 L12.5 12 L6 18.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 5.5 L19 12 L12.5 18.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const ICONS: Record<EntityKind, (p: IconProps) => React.JSX.Element> = {
  flow: FlowIcon,
  crew: CrewIcon,
  persona: PersonaIcon,
  task: TaskIcon,
  run: RunIcon,
};

export const ENTITY_LABEL: Record<EntityKind, string> = {
  flow: "Flow",
  crew: "Crew",
  persona: "Persona",
  task: "Task",
  run: "Run",
};

/** Render the icon for an entity kind: <EntityIcon entity="crew" size={20} /> */
export function EntityIcon({ entity, ...props }: IconProps & { entity: EntityKind }) {
  const Icon = ICONS[entity];
  return <Icon {...props} />;
}
