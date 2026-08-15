/**
 * One ordered stacking scale for everything that floats above page content.
 *
 * When each overlay picks its own literal they drift into ties, and a tie is
 * resolved by DOM order alone: that is how a global error toast could paint
 * underneath the first-run tour and stay invisible until the tour was
 * dismissed. Anything `fixed`/`absolute` that overlaps another surface reads
 * its level from here instead of inventing a number.
 *
 * The ladder covers the whole app, not just the top rungs, so a new floating
 * surface picks a name rather than guessing a gap. Levels 10-70 record what
 * menus, docks, modals and drawers already use; those call sites still spell
 * the number as a Tailwind class and are the migration targets.
 *
 * Ordering rule at the top of the ladder: coach marks teach, so they yield to
 * anything the user must act on; errors always win, because an unseen failure
 * is worse than an interrupted tour.
 */
export const Z_LAYER = {
  /** Page content lifted over the shell background. */
  content: 10,
  /** Invisible click-catcher that closes an anchored popover. */
  popoverBackdrop: 20,
  /** Anchored menus, selects, popovers, toasts. */
  menu: 30,
  /** Always-present floating chrome: the consult orb, CLI hints. */
  dock: 40,
  /** Route-level modals and full-screen pickers. */
  modal: 50,
  /** Scrim behind a slide-in panel. */
  drawerScrim: 60,
  /** Slide-in panels and drawers. */
  drawer: 70,
  /** Coach marks / product tour. */
  coachMark: 90,
  /** App-level dialogs reachable from anywhere, such as keyboard help. */
  dialog: 100,
  /** Confirmations, which can be raised on top of another dialog. */
  confirmDialog: 110,
  /**
   * An open Select's option list, which renders in a portal on `document.body`
   * rather than beside its trigger.
   *
   * It outranks every surface above because it is a child control OF whichever
   * surface is on top - a select inside a confirmation has to draw over that
   * confirmation or it cannot be used. `menu: 30` is the rung for a list that
   * stays inside its parent's stacking context; this one has deliberately left
   * it, because an ancestor with `overflow: hidden` clips an absolutely
   * positioned list no matter which direction it opens.
   */
  anchoredMenu: 115,
  /** Unhandled-error surface. Nothing may cover this. */
  globalError: 120,
} as const;

export type ZLayer = keyof typeof Z_LAYER;
