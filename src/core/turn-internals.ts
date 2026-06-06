// ── Turn internals (audit graph Phase C) ────────────────────────────────────
//
// Extract what a provider did *inside* a single turn - tool calls and sub-agent
// spawns - from its raw stream-json stdout. This is the "opaque box" made
// visible, but only where the provider actually streams structured events
// (claude-code `--output-format stream-json`); plain text output yields nothing
// and the turn stays honestly "opaque" in the audit.
//
// Grounded in real captured `claude` stream-json (v2.x): assistant messages carry
// `content[]` blocks; a `tool_use` block has a `name` + `input`; a sub-agent is a
// `tool_use` whose name is `Agent`/`Task` (input has a `description`). The
// sub-agent's OWN internals are not in the parent stream (they run inside the
// tool) - the parent sees the spawn + its result, which is the honest boundary.
//
// Pure + dependency-free. Design: docs/design/run-audit-graph.md (Phase C).

export type TurnToolUse = { name: string; count: number };
export type TurnSubAgent = { name: string; description: string | null };
export type TurnInternals = {
  /** True iff we recognized provider stream-json events (else: opaque). */
  streamParsed: boolean;
  /** Tool calls grouped by name (sub-agent spawns excluded - see subAgents). */
  tools: TurnToolUse[];
  subAgents: TurnSubAgent[];
};

const SUBAGENT_TOOLS = new Set(["Agent", "Task"]);
const STREAM_EVENT_TYPES = new Set([
  "system",
  "assistant",
  "user",
  "result",
  "rate_limit_event",
]);

/** Parse a turn's raw stdout (ndjson stream-json) into its internal activity. */
export function extractTurnInternals(raw: string): TurnInternals {
  const toolCounts = new Map<string, number>();
  const subAgents: TurnSubAgent[] = [];
  let streamParsed = false;

  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    let e: unknown;
    try {
      e = JSON.parse(s);
    } catch {
      continue;
    }
    if (!e || typeof e !== "object") continue;
    const ev = e as { type?: unknown; message?: unknown };
    if (typeof ev.type === "string" && STREAM_EVENT_TYPES.has(ev.type)) {
      streamParsed = true;
    }
    if (ev.type !== "assistant") continue;
    const blocks = (ev.message as { content?: unknown } | undefined)?.content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const block = b as { type?: unknown; name?: unknown; input?: unknown };
      if (block.type !== "tool_use" || typeof block.name !== "string") continue;
      if (SUBAGENT_TOOLS.has(block.name)) {
        const input = (block.input ?? {}) as { description?: unknown };
        subAgents.push({
          name: block.name,
          description:
            typeof input.description === "string" ? input.description : null,
        });
      } else {
        toolCounts.set(block.name, (toolCounts.get(block.name) ?? 0) + 1);
      }
    }
  }

  const tools = [...toolCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { streamParsed, tools, subAgents };
}
