import type { FastifyInstance } from "fastify";
import { HttpError } from "../security.js";
import { TerminalService } from "../../terminal/terminal-service.js";
import {
  TerminalError,
  type TerminalDriver,
} from "../../terminal/terminal-types.js";
import { loadNodePtyDriver } from "../../terminal/terminal-driver.js";

export type TerminalRoutesDeps = {
  projectRoot: string;
  /** Inject a fake driver in tests. Defaults to the lazily-loaded node-pty
   *  driver in production. */
  driver?: TerminalDriver;
};

/**
 * Terminal REST + WebSocket routes.
 *
 * Hard rules (mirror the route docstrings):
 *   - No HTTP endpoint accepts a shell command string. Browser keystrokes
 *     ride a WebSocket to an already-created PTY's stdin only.
 *   - CWD is always the run's worktree, resolved server-side from the run's
 *     state.json — never user-supplied.
 *   - Project root is never an allowed CWD in V0.
 *   - All endpoints refuse with 403 when policies.allowInteractiveTerminal
 *     is false or node-pty is not loadable in this environment.
 */
export async function registerTerminalRoutes(
  app: FastifyInstance,
  deps: TerminalRoutesDeps,
): Promise<void> {
  const driver = deps.driver ?? (await loadNodePtyDriver());
  const service = new TerminalService(deps.projectRoot, driver);

  // Kill any live PTYs on server close. Sessions persisted to disk keep
  // their createdAt; closedAt is filled in by onExit.
  app.addHook("onClose", async () => service.shutdown());

  app.get("/api/terminal/availability", async () => service.availability());

  app.get("/api/terminal/sessions", async () => ({
    sessions: await service.list(),
  }));

  app.post<{
    Body: {
      runId?: string;
      cols?: number;
      rows?: number;
    };
  }>("/api/terminal/sessions", async (req) => {
    const body = req.body ?? {};
    const runId = (body.runId ?? "").toString();
    if (!runId) throw new HttpError(400, "runId is required.");
    try {
      const session = await service.create({
        runId,
        cols: Number(body.cols ?? 80),
        rows: Number(body.rows ?? 24),
      });
      return { session };
    } catch (err) {
      if (err instanceof TerminalError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
  });

  app.get<{ Params: { id: string } }>(
    "/api/terminal/sessions/:id",
    async (req) => {
      try {
        return { session: await service.get(req.params.id) };
      } catch (err) {
        if (err instanceof TerminalError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: { cols?: number; rows?: number };
  }>("/api/terminal/sessions/:id/resize", async (req) => {
    const body = req.body ?? {};
    try {
      await service.resize(
        req.params.id,
        Number(body.cols ?? 80),
        Number(body.rows ?? 24),
      );
      return { ok: true };
    } catch (err) {
      if (err instanceof TerminalError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>(
    "/api/terminal/sessions/:id/close",
    async (req) => {
      try {
        return { session: await service.close(req.params.id) };
      } catch (err) {
        if (err instanceof TerminalError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );

  // Register the WebSocket plugin lazily — it pulls in `ws`, which we don't
  // want to load on test runs that never touch terminal I/O. The plugin
  // installs `.get(... , { websocket: true }, handler)` support.
  let websocketReady = false;
  async function ensureWebsocket(): Promise<void> {
    if (websocketReady) return;
    const wsPlugin = await import("@fastify/websocket");
    await app.register(wsPlugin.default);
    websocketReady = true;
  }

  await ensureWebsocket();

  // ─── PTY I/O channel ─────────────────────────────────────────────────────
  // The ONLY job of this socket is to ferry bytes between the browser and an
  // already-created PTY. There is no command-execution payload, no eval,
  // no shell-out from the server — Fastify hands us text frames, we
  // `write()` them to a live PTY's stdin, and PTY output (text) is sent
  // back. JSON frames are recognized for resize/ping only.
  app.get<{ Params: { id: string } }>(
    "/api/terminal/sessions/:id/ws",
    { websocket: true },
    (socket, req) => {
      const id = req.params.id;
      const proc = service.liveProcess(id);
      if (!proc) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: `Session ${id} is not live in this server. Create a new session.`,
          }),
        );
        socket.close(1011, "session not live");
        return;
      }
      const unsubData = proc.onData((chunk) => {
        try {
          socket.send(chunk);
        } catch {
          // socket gone; cleanup via onExit / unbind below
        }
      });
      const unsubExit = proc.onExit(({ exitCode }) => {
        try {
          socket.send(
            JSON.stringify({ type: "exit", exitCode }),
          );
        } catch {
          // ignore
        }
        try {
          socket.close(1000, "pty exited");
        } catch {
          // ignore
        }
      });

      socket.on("message", (data: Buffer | string) => {
        const text = typeof data === "string" ? data : data.toString("utf8");
        // Recognise JSON control frames. Plain text is forwarded as
        // keystrokes — the shell decides what to do with them.
        if (text.length > 1 && (text[0] === "{" || text[0] === "[")) {
          try {
            const parsed = JSON.parse(text) as {
              type?: string;
              cols?: number;
              rows?: number;
            };
            if (parsed && parsed.type === "resize") {
              const c = Math.max(2, Math.min(1024, Number(parsed.cols) || 80));
              const r = Math.max(2, Math.min(1024, Number(parsed.rows) || 24));
              try {
                proc.resize(c, r);
              } catch {
                // ignore
              }
              return;
            }
            if (parsed && parsed.type === "ping") return;
            // Unknown JSON payload — drop, do NOT pass to the PTY as a
            // command. This is the line the spec is most worried about.
            return;
          } catch {
            // Not JSON — fall through and treat as keystrokes.
          }
        }
        try {
          proc.write(text);
        } catch {
          // ignore
        }
      });

      socket.on("close", () => {
        unsubData();
        unsubExit();
      });
    },
  );
}
