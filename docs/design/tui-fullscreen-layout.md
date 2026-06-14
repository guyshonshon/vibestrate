# TUI: full-screen, fixed-size shell layout

Status: shipped (0.7.86)

## Problem

The Ink shell (`vibe`) rendered into the **normal** terminal buffer at its
natural content height. Anything that changed the rendered height - most acutely
the autocomplete list opening / growing / shrinking as you type `config …` -
grew the frame, and when the frame reached the terminal height Ink flips to
append/scroll mode (its threshold is `>=`). The result: the whole panel resized
and the line you were typing on jumped. Three narrower fixes (move the overlay
out of the prompt box; reserve a fixed slot; put the prompt above the body) each
reduced but did not remove it, because the app could still grow past the
viewport and scroll.

## Decision

Make the shell a real full-screen app on a **fixed canvas**:

1. **Alternate screen buffer.** `render(<App/>, { alternateScreen: true })`
   (Ink 7 native). The app owns a separate screen - like `vim` / `htop` - and
   the user's terminal contents are restored on exit. No scrollback pollution.
2. **Fill the terminal.** The root box is `height = terminalRows`
   (`useTerminalSize`). Filling exactly the viewport hits Ink's fullscreen
   detection (`outputHeight >= viewportRows`), which drops the trailing newline
   that would otherwise cause a scroll.
3. **Prompt above a shrinking body.** Order is header -> context+prompt ->
   completion slot -> body. The body is `flexGrow:1` + `overflow:"hidden"` +
   `minHeight:0`, so when the completion slot opens the **body clips** to make
   room. The prompt is above the body, so it never moves; the body absorbs the
   space.

The completion list itself renders in a fixed-height slot
(`COMPLETION_SLOT_ROWS`), so narrowing matches (7 -> 1) never resizes anything
even within the open state.

## Trade-offs

- **No in-shell scrollback after quit** - standard for alternate-screen TUIs;
  run output shows in the pane while running and artifacts persist on disk.
- **Pages clip to the viewport** instead of scrolling the terminal. For pages
  that need more room, add per-page internal scrolling (follow-up), rather than
  letting the terminal grow.
- If a terminal shows a one-row jitter at the bottom, switch `height={rows}` to
  `rows - 1` (the classic full-height off-by-one). Not observed at 100x30 in the
  PTY smoke.

## Verification

- Headless render spike (`tests/shell-prompt-layout.test.ts`): prompt row is
  identical with the list closed vs open; frame never exceeds the viewport; the
  body clips instead of the app growing (incl. a bordered body).
- PTY smoke of the built shell: confirmed it enters the alternate screen,
  renders the `config` completion inside it, and restores the terminal on exit.

## Out of scope

A GUI desktop app (Tauri/Electron wrapping the web dashboard) and a compiled
single-file binary were discussed and **deferred** - the full-screen TUI covers
the "feels like an app" need without a new toolchain.
