// Content screens shared by every path that persists text a model or a human
// authored. Pure predicates: they answer, callers refuse.

/**
 * Reject NUL bytes and disallowed control characters. Tab, newline, and
 * carriage return are legitimate in the text this guards (YAML documents,
 * prompt prose); every other C0 control character - and DEL - is either binary
 * content or the lead-in to a terminal escape sequence, so it is refused before
 * it is stored rather than after.
 *
 * Scope, stated so no caller mistakes this for a rendering-safety guarantee:
 * C0 and DEL only. Unicode formatting characters that also change how text
 * renders - the bidi overrides and isolates (U+202A-U+202E, U+2066-U+2069),
 * the directional marks, and the line/paragraph separators (U+2028/U+2029) -
 * pass this screen and land on disk. They are not refused because the same
 * range carries legitimate mixed-direction prose, and a guard that rejects a
 * Hebrew or Arabic prompt is a worse failure than one that stores a reversed
 * one. Anything that must render this text safely has to neutralize those
 * itself.
 *
 * Returns the phrase for the refusal message, or null when the text is clean.
 *
 * Callers must screen the DECODED strings, not the serialized form: both
 * serializers in use here escape a real ESC on the way out (two characters in
 * YAML, a six-character u-escape in JSON), so scanning the bytes about to be
 * written reports clean while the value still decodes back into a live control
 * character on read.
 */
export function findControlCharIssue(text: string): string | null {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    // Allow tab (0x09), LF (0x0a), CR (0x0d). Refuse every other C0 control
    // char and DEL (0x7f).
    const isAllowed = code === 0x09 || code === 0x0a || code === 0x0d;
    if ((code <= 0x1f && !isAllowed) || code === 0x7f) {
      const hex = code.toString(16).padStart(2, "0");
      return code === 0
        ? "contains a NUL byte"
        : `contains a disallowed control character (0x${hex})`;
    }
  }
  return null;
}
