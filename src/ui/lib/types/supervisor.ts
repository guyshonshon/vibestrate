// Supervisor Control: the durable conversation, and the streamed turn.
//
// The view types the dashboard renders, plus the wire contract for a turn.
// `src/ui/lib/api/supervisors.ts` re-exports these so importers keep the one
// `lib/api/supervisors.js` specifier.

export type SupervisorActionRecordView = {
  intent: string;
  summary: string;
  targetKind: "task" | "checklist" | "queue" | "run" | "none";
  targetId: string | null;
  ok: boolean;
  error: string | null;
  undone: boolean;
};

/**
 * A button offered under an answer.
 *
 * MODEL-ADJACENT AND THEREFORE UNTRUSTED. The server maps a closed
 * recommendation vocabulary onto these, but the client re-checks every one
 * before it renders (see toSafeRoute in SupervisorControl): a route kind must
 * match a hand-written literal set, and any id must be one the server already
 * committed to in the same message's action record. Anything that fails the
 * check is dropped rather than rendered dead.
 *
 * Neither kind ever fires on its own. `prompt` fills the composer and focuses
 * it; `navigate` changes the hash. Nothing here writes.
 */
export type SupervisorAnswerAction =
  | { kind: "prompt"; label: string; prompt: string }
  | { kind: "navigate"; label: string; route: SupervisorNavigateTarget };

/** A proposed route, still unvalidated. Narrowed to the app's `Route` union by
 *  the client's own allowlist, never by `serializeRoute` - that function
 *  serializes any string it is handed and so is not a validator. */
export type SupervisorNavigateTarget = { kind: string } & Record<string, unknown>;

export type SupervisorMessageView = {
  id: string;
  role: "user" | "supervisor" | "system";
  text: string;
  createdAt: string;
  action: SupervisorActionRecordView | null;
  /** Buttons under this answer. Absent on user/system turns and on any answer
   *  the answerer had no recommendation for. */
  actions?: SupervisorAnswerAction[];
};

export type SupervisorThreadView = {
  id: string;
  title: string;
  runId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: SupervisorMessageView[];
};

export type SupervisorThreadSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  runId: string | null;
  messageCount: number;
};

export type SupervisorPauseView = {
  paused: boolean;
  reason: string;
  updatedAt: string;
};

// ── The streamed turn ──────────────────────────────────────────────────────

/** Same split the provider transcript filter already produces
 *  (src/providers/adapters/stream-transcript.ts), carried through unchanged so
 *  the chat does not invent a second reasoning vocabulary. */
export type SupervisorTurnChunkKind = "text" | "thinking" | "tool" | "subagent";

export type SupervisorTurnChunk = {
  kind: SupervisorTurnChunkKind;
  text: string;
};

/**
 * Server -> client events for one turn, SSE-framed on the turn POST's own
 * response body.
 *
 * `user` lands first and carries the PERSISTED user message, which is what lets
 * the optimistic echo be replaced by the real record rather than sitting beside
 * it. `done` carries the whole thread because that is the shape the turn route
 * already returns, so reconciliation is a single assignment.
 *
 * There is no `stopped` event: a stop is a client abort, so the socket is gone
 * before the server could send one. The stopped turn is rendered from local
 * state and reconciled on the next thread read.
 */
export type SupervisorTurnEvent =
  | { type: "user"; message: SupervisorMessageView }
  | { type: "chunk"; chunk: SupervisorTurnChunk }
  | { type: "done"; thread: SupervisorThreadView }
  /** A turn that failed after the stream opened, so it cannot be an HTTP status
   *  line. `status`, `kind`, `title` and `hint` are the same fields the server's
   *  error handler puts on a JSON error body, carried here so the chat classifies
   *  a mid-stream failure exactly like every other failed request. */
  | {
      type: "error";
      error: {
        message: string;
        status?: number;
        kind?: string;
        title?: string;
        hint?: string;
      };
    };
