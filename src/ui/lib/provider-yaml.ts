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

/** The editor's working shape for one provider - a superset spanning every
 *  provider type. `renderProviderYaml` emits only the fields the chosen
 *  `type` actually uses. */
export type EditorProviderConfig =
  | { type: "cli"; command: string; args: string[]; input: "stdin" | "arg" }
  | {
      type: "http-api";
      api: "anthropic" | "openai";
      baseUrl: string;
      model: string;
      apiKey: string;
      maxTokens: number;
      headers?: Record<string, string>;
    }
  | {
      type: "localhost-proxy";
      api: "openai" | "ollama";
      baseUrl: string;
      model: string;
      apiKey?: string;
      maxTokens: number;
    };

export function renderProviderYaml(
  id: string,
  config: EditorProviderConfig,
): string {
  const head = ["providers:", `  ${id}:`];
  if (config.type === "cli") {
    const argsLine =
      config.args.length === 0
        ? "    args: []"
        : `    args: [${config.args.map((a) => yamlQuote(a)).join(", ")}]`;
    return [
      ...head,
      "    type: cli",
      `    command: ${yamlQuote(config.command)}`,
      argsLine,
      `    input: ${config.input}`,
    ].join("\n");
  }
  const lines = [
    ...head,
    `    type: ${config.type}`,
    `    api: ${config.api}`,
    `    baseUrl: ${yamlQuote(config.baseUrl)}`,
    `    model: ${yamlQuote(config.model)}`,
  ];
  // apiKey is an env reference (`env:NAME`), never a literal secret.
  if (config.type === "http-api") {
    lines.push(`    apiKey: ${yamlQuote(config.apiKey)}`);
  } else if (config.apiKey) {
    lines.push(`    apiKey: ${yamlQuote(config.apiKey)}`);
  }
  lines.push(`    maxTokens: ${config.maxTokens}`);
  if (config.type === "http-api" && config.headers) {
    const entries = Object.entries(config.headers);
    if (entries.length > 0) {
      lines.push("    headers:");
      for (const [k, v] of entries) {
        lines.push(`      ${yamlQuote(k)}: ${yamlQuote(v)}`);
      }
    }
  }
  return lines.join("\n");
}
