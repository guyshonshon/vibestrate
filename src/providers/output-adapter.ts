// Provider output adapters — normalize any provider's stdout (plain text,
// JSON, or streaming-JSON) down to one contract so amaco's supervision,
// live panel, and metrics consume a single shape. See
// docs/design/provider-structured-output.md.
//
// The cardinal rule (it gates supervision): the control parsers
// (HUMAN_APPROVAL / DECISION / VERIFICATION) read ONLY `responseText`. An
// adapter must extract that losslessly, and a structured stream it can't parse
// must THROW (the turn fails loud) — never silently hand back garbage, which
// would let a missed approval marker slip an executor past a human gate.

/** Native usage metrics when the format carries them; null for text-only. */
export type NormalizedMetrics = {
  model: string | null;
  totalCostUsd: number | null;
  perModelCost: { model: string; costUsd: number }[];
  tokenUsage: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheCreation?: number;
  } | null;
  toolCallCount: number | null;
  sessionId: string | null;
};

export type NormalizedTurn = {
  /** The assistant's response text — the ONLY thing control parsers read. */
  responseText: string;
  /** Native metrics, or null when the format doesn't carry them. */
  metrics: NormalizedMetrics | null;
};

export class OutputAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutputAdapterError";
  }
}

export interface ProviderOutputAdapter {
  readonly id: string;
  /** Raw stdout → normalized turn. Throws on an unparseable structured stream
   *  so the caller fails the turn loudly (never proceeds on garbage). */
  finalize(rawStdout: string): NormalizedTurn;
  /**
   * Optional: build a stateful filter that turns raw stdout chunks into
   * human-readable text for the live panel (display only, never the control
   * path). Stateful because chunks aren't line-aligned — a structured adapter
   * buffers partial lines. Absent ⇒ the caller streams chunks verbatim.
   */
  createLiveFilter?(): (rawChunk: string) => string;
}

/**
 * The default, provider-agnostic adapter: stdout *is* the response text, no
 * native metrics, chunks stream verbatim. This is exactly amaco's behavior
 * before adapters existed, so every provider that hasn't opted into a richer
 * format keeps working unchanged.
 */
export const textOutputAdapter: ProviderOutputAdapter = {
  id: "text",
  finalize: (rawStdout) => ({ responseText: rawStdout, metrics: null }),
};
