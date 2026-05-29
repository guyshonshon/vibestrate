// Shared helpers for composing a CLI provider's `project.yml` block in the
// dashboard's provider editors (Crew Configure modal + Providers page). One
// source of truth so the two editors can't drift.

/**
 * Whitespace-split that respects double-quoted segments, so users can pass
 * args like `"--system" "be brief"`. Good enough for CLI provider arg lists;
 * full POSIX parsing would be overkill.
 */
export function parseArgs(raw: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (const ch of raw.trim()) {
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export function yamlQuote(s: string): string {
  if (/^[a-zA-Z0-9_./-]+$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function renderProviderYaml(
  id: string,
  config: { command: string; args: string[]; input: "stdin" | "arg" },
): string {
  const argsLine =
    config.args.length === 0
      ? "    args: []"
      : `    args: [${config.args.map((a) => yamlQuote(a)).join(", ")}]`;
  return [
    "providers:",
    `  ${id}:`,
    "    type: cli",
    `    command: ${yamlQuote(config.command)}`,
    argsLine,
    `    input: ${config.input}`,
  ].join("\n");
}
