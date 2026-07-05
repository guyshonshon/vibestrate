// ── Live transcript filter ───────────────────────────────────────────────────
//
// Turns a provider's incremental stream-json stdout into typed transcript
// chunks for the live view: assistant text, thinking, and tool/sub-agent
// activity. Before this, the live filter emitted ONLY text deltas - so during
// a long tool-using stretch the live panel sat silent, which read as "the UI
// doesn't show what the model is doing".
//
// Sources (validated against real captured `claude` 2.x stream-json - same
// shapes core/turn-internals.ts parses post-hoc; that module stays a separate
// batch parser on purpose, the incremental/batch impedance is real):
//   - text:     {"type":"stream_event","event":{"type":"content_block_delta",
//                "delta":{"type":"text_delta","text":"..."}}}
//   - thinking: same, with "delta":{"type":"thinking_delta","thinking":"..."}
//   - tools:    {"type":"assistant","message":{"content":[{"type":"tool_use",
//                "name":"Read","input":{...}}]}} - complete blocks, no delta
//                accumulation needed.
//
// Pure + dependency-free (no node imports) so web/shell could reuse it.
// Display-only; NEVER the control path. Tolerant: a malformed line is skipped.

type JsonObj = Record<string, unknown>;

export type TranscriptChunkKind = "text" | "thinking" | "tool" | "subagent";

export type TranscriptChunk = {
  kind: TranscriptChunkKind;
  text: string;
};

const SUBAGENT_TOOLS = new Set(["Agent", "Task"]);
const LABEL_FIELDS = [
  "file_path",
  "path",
  "command",
  "pattern",
  "query",
  "url",
  "description",
  "prompt",
] as const;
const MAX_LABEL = 120;

/** Compact one-line label for a tool call: `Read · src/core/x.ts`. */
export function toolUseLabel(name: string, input: unknown): string {
  let target: string | null = null;
  if (input && typeof input === "object") {
    const o = input as JsonObj;
    for (const f of LABEL_FIELDS) {
      if (typeof o[f] === "string" && (o[f] as string).trim()) {
        target = (o[f] as string).trim();
        break;
      }
    }
  }
  if (!target) return name;
  const flat = target.replace(/\s+/g, " ");
  return `${name} · ${flat.length > MAX_LABEL ? `${flat.slice(0, MAX_LABEL)}…` : flat}`;
}

function chunksFromLine(o: JsonObj): TranscriptChunk[] {
  // Incremental deltas: visible text + thinking.
  if (o.type === "stream_event") {
    const ev = o.event as JsonObj | undefined;
    if (ev?.type !== "content_block_delta") return [];
    const delta = ev.delta as JsonObj | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return [{ kind: "text", text: delta.text }];
    }
    if (
      delta?.type === "thinking_delta" &&
      typeof delta.thinking === "string"
    ) {
      return [{ kind: "thinking", text: delta.thinking }];
    }
    return [];
  }
  // Complete assistant messages: tool_use blocks (text blocks here would
  // duplicate the deltas above, so only tools are taken from this shape).
  if (o.type === "assistant") {
    const blocks = (o.message as JsonObj | undefined)?.content;
    if (!Array.isArray(blocks)) return [];
    const out: TranscriptChunk[] = [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const block = b as JsonObj;
      if (block.type !== "tool_use" || typeof block.name !== "string") continue;
      out.push({
        kind: SUBAGENT_TOOLS.has(block.name) ? "subagent" : "tool",
        text: toolUseLabel(block.name, block.input),
      });
    }
    return out;
  }
  return [];
}

/**
 * Incremental filter: feed raw stdout chunks (not line-aligned), get typed
 * transcript chunks for whole lines as they complete. Never throws.
 */
export function createTranscriptFilter(): (chunk: string) => TranscriptChunk[] {
  let buf = "";
  return (chunk: string): TranscriptChunk[] => {
    buf += chunk;
    const out: TranscriptChunk[] = [];
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let o: JsonObj;
      try {
        o = JSON.parse(line) as JsonObj;
      } catch {
        continue;
      }
      if (o && typeof o === "object") out.push(...chunksFromLine(o));
    }
    return out;
  };
}
