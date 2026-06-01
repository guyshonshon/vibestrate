import React from "react";
import { Box, Text } from "ink";
import { FOCAL_CARD_PROPS, ACCENT, ACCENT_BRIGHT, ACCENT_DIM } from "../theme.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { windowFromTop } from "../output-window.js";
import { DOCS_WEBSITE } from "../docs-source.js";
import type { MdLine } from "../markdown-render.js";
import type { DocsState } from "../ui-state.js";

/** Render one parsed Markdown line's styled spans onto a single Ink <Text>. */
function MdLineView({ line }: { line: MdLine }) {
  if (line.length === 0) return <Text> </Text>;
  return (
    <Text>
      {line.map((s, i) => (
        <Text
          key={i}
          color={s.color}
          bold={s.bold}
          dimColor={s.dim}
          italic={s.italic}
          underline={s.underline}
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

/**
 * In-shell docs browser: a topic list on the left, the selected page rendered
 * with terminal Markdown on the right. ↑↓ pick a topic, PgUp/PgDn (or j/k)
 * scroll the page, `o` opens the docs website, Esc closes.
 */
export function DocsOverlay({ docs }: { docs: DocsState }) {
  const { rows } = useTerminalSize();
  const height = Math.max(6, rows - 12);
  const win = windowFromTop(docs.lines, docs.scroll, height);
  const current = docs.topics[docs.index];

  return (
    <Box {...FOCAL_CARD_PROPS} flexDirection="column">
      <Box>
        <Text bold color={ACCENT_BRIGHT}>
          Docs
        </Text>
        <Text dimColor>
          {"   "}
          {current ? `${current.section} · ${current.label}` : "loading…"}
        </Text>
      </Box>
      {docs.error ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">{docs.error}</Text>
          <Text dimColor>
            Read them at <Text color={ACCENT}>{DOCS_WEBSITE}</Text> · press{" "}
            <Text color={ACCENT}>o</Text> to open · Esc to close
          </Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="row">
          {/* Topic list */}
          <Box flexDirection="column" width="26%" marginRight={1}>
            {docs.topics.map((t, i) => (
              <Text
                key={t.slug}
                color={i === docs.index ? ACCENT : undefined}
                inverse={i === docs.index}
                wrap="truncate-end"
              >
                {i === docs.index ? "▌ " : "  "}
                {t.label}
              </Text>
            ))}
          </Box>
          {/* Rendered page */}
          <Box
            flexDirection="column"
            flexGrow={1}
            borderStyle="single"
            borderColor={ACCENT_DIM}
            borderTop={false}
            borderRight={false}
            borderBottom={false}
            paddingLeft={1}
          >
            {docs.loadingContent ? (
              <Text dimColor>loading…</Text>
            ) : (
              <>
                {win.above > 0 ? (
                  <Text dimColor>↑ {win.above} more · PgUp</Text>
                ) : null}
                {win.lines.map((line, i) => (
                  <MdLineView key={i} line={line} />
                ))}
                {win.below > 0 ? (
                  <Text dimColor>↓ {win.below} more · PgDn</Text>
                ) : null}
              </>
            )}
          </Box>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          <Text color={ACCENT}>↑↓/jk</Text> scroll · <Text color={ACCENT}>Space/b</Text>{" "}
          page · <Text color={ACCENT}>[ ]</Text> topic · <Text color={ACCENT}>o</Text>{" "}
          website · <Text color={ACCENT}>Esc</Text> close
        </Text>
      </Box>
    </Box>
  );
}
