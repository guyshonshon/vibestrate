/**
 * Escape a value so it survives as one cell of a markdown table.
 *
 * Five report writers each did `value.replace(/\|/g, "\\|")` and each had the
 * same hole: escaping the pipe without first escaping the backslash. A title
 * ending in `\` becomes `\\|`, which is an escaped backslash followed by a live
 * pipe - the cell breaks open and the rest of the row shifts one column left.
 * Run titles and step text are user-supplied, so this is reachable by typing.
 *
 * Newlines get the same treatment for the same reason: a raw newline ends the
 * row, so a multi-line title silently ate the columns after it.
 */
export function mdCell(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}
