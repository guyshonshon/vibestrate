// The dashboard's HTTP surface: builds the Fastify app, sets the security
// posture, mounts the route modules from `src/server/routes/`, and serves the
// built UI bundle. `startServer` is what `vibe ui` and `vibe run --ui` start,
// and what the route tests boot.
//
// Source order: options and the `/api/v1` URL rewrite -> the UI-bundle lookup
// -> `startServer`, inside which the security hooks, the error handler, a few
// inline routes (health, self-shutdown, favicon), the route registrations, the
// `/api/*` catch-all that keeps unmatched API paths inside the bearer gate, the
// static / SPA handlers, then the optional managed scheduler sit in that order.
//
// The posture the route modules assume, and that must not be weakened here:
//   - Loopback by default. Binding a non-loopback host without an API token
//     throws before `listen` rather than serving an unauthenticated API.
//   - The guards are app-level `onRequest` hooks, not per-route code: the Host
//     rebinding check (loopback binds only - a non-loopback bind cannot
//     enumerate its own reachable names and already requires the bearer token),
//     the Origin allow-list, the Sec-Fetch-Site check on mutating methods, and
//     the bearer gate when a token is configured. A handler in `routes/` does
//     not repeat any of them.
//   - The bearer gate scopes itself by the route pattern the router RESOLVED,
//     so a new `/api/...` route added below is covered without touching it.
//
// Handlers here stay thin on purpose. This module wires and guards; behaviour
// belongs in the route modules.

// Same single source the CLI uses for `vibe --version`; the bundler inlines it.
import pkg from "../../package.json";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { registerRunsRoutes } from "./routes/runs.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";
import { registerDiffRoutes } from "./routes/diff.js";
import { registerNotesRoutes } from "./routes/notes.js";
import { registerSkillsRoutes } from "./routes/skills.js";
import { registerFlowsRoutes } from "./routes/flows.js";
import { registerComposerPresetsRoutes } from "./routes/composer-presets.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerSetupRoutes } from "./routes/setup.js";
import { registerApprovalsRoutes } from "./routes/approvals.js";
import { registerRoadmapRoutes } from "./routes/roadmap.js";
import { registerTasksRoutes } from "./routes/tasks.js";
import { registerIntegrationRoutes } from "./routes/integration.js";
import { registerWorkspaceRoutes } from "./routes/workspace.js";
import { registerQueueRoutes } from "./routes/queue.js";
import { registerIssuesRoutes } from "./routes/issues.js";
import { registerProposalsRoutes } from "./routes/proposals.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerProjectRoutes } from "./routes/project.js";
import { registerParamsRoutes } from "./routes/params.js";
import { registerConfigRoutes } from "./routes/config.js";
import { registerAnnotationsRoutes } from "./routes/annotations.js";
import { registerBudgetRoutes } from "./routes/budget.js";
import { registerConsultRoutes } from "./routes/consult.js";
import { registerSupervisorRoutes } from "./routes/supervisor.js";
import { registerSpecUpRoutes } from "./routes/spec-up.js";
import { registerGitRoutes } from "./routes/git.js";
import { registerRoleWorkRoutes } from "./routes/agent-work.js";
import { registerCodeReferenceRoutes } from "./routes/code-references.js";
import { registerCodebaseEventRoutes } from "./routes/codebase-events.js";
import { registerEditorRoutes } from "./routes/editor.js";
import { registerSuggestionRoutes } from "./routes/suggestions.js";
import { registerBundlesRoutes } from "./routes/bundles.js";
import { registerValidationRoutes } from "./routes/validation.js";
import {
  registerTerminalRoutes,
  type TerminalRoutesDeps,
} from "./routes/terminal.js";
import { registerPoliciesRoutes } from "./routes/policies.js";
import { registerCodebaseMapRoutes } from "./routes/codebase-map.js";
import { registerTodosRoutes } from "./routes/todos.js";
import {
  HttpError,
  bearerToken,
  isAllowedRequestHost,
  isLoopbackHost,
  timingSafeEqualStr,
} from "./security.js";
import { recordIssue } from "../core/stores/issues-store.js";
import { formatError, toIssueInput } from "../core/error-format.js";
import { relativizeRoot } from "../utils/redact-paths.js";

export const DEFAULT_VIBESTRATE_PORT = 4317;

/** Canonical version prefix. Requests to `/api/v1/...` are rewritten to
 *  `/api/...` before routing so the versioned contract and the bundled UI
 *  (which still calls `/api/...`) share one handler set. Bump alongside a
 *  breaking payload change and keep the old prefix routing for a deprecation
 *  window. */
export const API_VERSION_PREFIX = "/api/v1";

/** Does a registered route pattern live in the API namespace? Takes a route
 *  pattern (`/api/runs/:id`), never a raw request URL - see the bearer gate in
 *  `startServer` for why the distinction is load-bearing. */
function isApiRoute(routePattern: string): boolean {
  return routePattern === "/api" || routePattern.startsWith("/api/");
}

/**
 * Strip a leading `/api/v1` so a versioned client and the bundled UI hit the
 * same handlers. Runs in Fastify's `rewriteUrl` (before routing), so handlers
 * and logs see the canonical `/api/...` path. Anything that isn't exactly
 * `/api/v1`, `/api/v1/...`, or `/api/v1?...` is returned untouched (so paths
 * like `/api/version` are never mangled).
 */
export function rewriteVersionedApiUrl(url: string): string {
  const p = API_VERSION_PREFIX;
  if (url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`)) {
    return `/api${url.slice(p.length)}`;
  }
  return url;
}

export type StartServerOptions = {
  projectRoot: string;
  port?: number;
  host?: string;
  uiDir?: string;
  logger?: boolean;
  /**
   * Optional bearer token. When set, every `/api/*` request must carry
   * `Authorization: Bearer <token>` (constant-time compared). Defaults to the
   * `VIBESTRATE_API_TOKEN` env var. When a non-loopback host is bound without a
   * token, the server refuses to start (fail-closed) rather than expose an
   * unauthenticated API on the network.
   */
  apiToken?: string;
  /** Optional driver injection for the terminal feature (tests). */
  terminalDriver?: TerminalRoutesDeps["driver"];
  /** Spawn the scheduler as a managed subprocess of the UI server.
   *  Default false (safe for tests / library users). The `vibe ui`
   *  CLI flips it to true so the dashboard owns the scheduler's
   *  lifecycle out of the box. */
  withScheduler?: boolean;
  /** Called after `POST /api/server/shutdown` has stopped the scheduler and
   *  closed the HTTP server. The `vibe ui` CLI passes `() => process.exit(0)`
   *  so a navigator "Close" actually ends the process; tests omit it so the
   *  in-process server just closes without killing the runner. */
  onShutdownRequested?: () => void;
};

export type StartedServer = {
  app: FastifyInstance;
  url: string;
  port: number;
  host: string;
  uiAvailable: boolean;
  /** Pid of the managed scheduler child, when one is running. */
  schedulerPid: number | null;
  close: () => Promise<void>;
};

const here = path.dirname(fileURLToPath(import.meta.url));

async function locateUiDir(explicit?: string): Promise<string | null> {
  const candidates = [
    explicit,
    // Source layout (tsx dev): src/server/server.ts → ../../dist/ui
    path.resolve(here, "..", "..", "dist", "ui"),
    // Bundled layout (dist/index.js): dist/ui sits beside the bundle.
    path.resolve(here, "ui"),
    path.resolve(here, "..", "ui"),
  ].filter((c): c is string => typeof c === "string");
  for (const c of candidates) {
    try {
      const stat = await fs.stat(c);
      if (stat.isDirectory()) {
        const indexPath = path.join(c, "index.html");
        const idxStat = await fs.stat(indexPath).catch(() => null);
        if (idxStat) return c;
      }
    } catch {
      // try next
    }
  }
  return null;
}

export async function startServer(opts: StartServerOptions): Promise<StartedServer> {
  const port = opts.port ?? DEFAULT_VIBESTRATE_PORT;
  const host = opts.host ?? "127.0.0.1";

  // Auth posture. A token (explicit or `VIBESTRATE_API_TOKEN`) turns on bearer
  // auth for every `/api/*` request. Binding a non-loopback host *without* a
  // token is a footgun - refuse to start so we never expose an unauthenticated
  // API on a real interface.
  const envToken = process.env.VIBESTRATE_API_TOKEN;
  const apiToken =
    opts.apiToken && opts.apiToken.length > 0
      ? opts.apiToken
      : envToken && envToken.length > 0
        ? envToken
        : null;
  if (!isLoopbackHost(host) && !apiToken) {
    throw new HttpError(
      400,
      `Refusing to bind ${host} without an API token. Non-loopback binds expose the API on the network; set VIBESTRATE_API_TOKEN (or pass apiToken) to require a bearer token, or bind 127.0.0.1.`,
    );
  }

  const app = Fastify({
    logger: opts.logger === true,
    disableRequestLogging: !opts.logger,
    // Alias the versioned contract onto the unversioned handlers before
    // routing. `/api/v1/flows` → `/api/flows`; everything else is untouched.
    rewriteUrl: (req) => rewriteVersionedApiUrl(req.url ?? "/"),
    // Forcibly close keep-alive sockets on app.close() so SSE clients
    // (codebase watcher, run-events tail, provider-stream tail) don't
    // hold the shutdown open for the OS's TCP timeout. Without this,
    // Ctrl+C could hang for minutes waiting for browser tabs to
    // notice the connection went away.
    forceCloseConnections: true,
  });

  // Fastify 5 rejects empty `application/json` bodies by default with
  // "Body cannot be empty when content-type is set to 'application/json'".
  // Several of our action routes (POST /api/runs/:id/pause, /resume,
  // /api/queue/run, etc.) are body-less by design - let those work
  // without forcing every caller to send `"{}"`.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      const text = typeof body === "string" ? body : String(body ?? "");
      if (text.trim().length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // Lock down to localhost + block cross-site CSRF on state-changing routes.
  // Two layers:
  //   1. Origin: when present it must resolve to a local host - and a MALFORMED
  //      Origin is now refused (fail-closed), not waved through.
  //   2. Sec-Fetch-Site: reject a request a browser marked `cross-site` /
  //      `cross-origin`, on EVERY method. Every modern browser sends this header,
  //      so it closes the gap where a cross-site request carries no Origin at
  //      all. Non-browser clients (curl, scripts, the CLI's own calls) omit it
  //      and stay allowed - they're local and not a CSRF vector.
  //
  //      This ran on mutating methods only until a scan of the GET routes showed
  //      why that is not enough. A browser sends NO Origin header for an `<img>`
  //      or a no-cors fetch, so layer 1 never fires, and a GET skipped layer 2
  //      entirely: any page the owner happened to visit could make this server
  //      execute a GET handler. That is not hypothetical here - `/api/setup/
  //      summary` shells out to every known coding CLI to detect providers, so
  //      the cheapest version of the attack spawns processes on the owner's
  //      machine in a loop. The response stays unreadable cross-origin (no CORS
  //      headers are ever sent), so this is about the side effect and the cost,
  //      not about exfiltration.
  //
  //      `none` stays allowed on purpose: that is a user typing the URL or
  //      opening a bookmark, which is how someone reaches the dashboard at all.
  // Enforced only on a loopback bind: a non-loopback bind cannot know its own
  // reachable hostname, and `startServer` already made a bearer token mandatory
  // there.
  const enforceRequestHost = isLoopbackHost(host);
  app.addHook("onRequest", async (req, reply) => {
    // Runs before the Origin check: it is the cheapest fail-closed test, and it
    // is the only one that catches a rebound GET, which carries no Origin at all.
    if (enforceRequestHost && !isAllowedRequestHost(req.hostname)) {
      await reply
        .code(403)
        .send({ error: "Request Host is not a local address for this server." });
      return;
    }
    const origin = req.headers["origin"];
    if (typeof origin === "string" && origin.length > 0) {
      let allowed = false;
      try {
        const url = new URL(origin);
        allowed =
          url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          url.hostname === host;
      } catch {
        allowed = false; // malformed origin -> refuse (fail closed)
      }
      if (!allowed) {
        await reply.code(403).send({ error: "Cross-origin requests are not allowed." });
        return;
      }
    }
    const site = req.headers["sec-fetch-site"];
    // Browser-sent: same-origin / same-site / none are fine; cross-site /
    // cross-origin are CSRF. Absent (non-browser) is allowed.
    if (
      typeof site === "string" &&
      site !== "same-origin" &&
      site !== "same-site" &&
      site !== "none"
    ) {
      await reply.code(403).send({ error: "Cross-site requests are not allowed." });
      return;
    }
  });

  // Optional bearer-token gate. Off by default (loopback, no token) so the
  // local-first single-user flow stays friction-free. When a token is
  // configured, every API request must present it (constant-time compared).
  // Static UI assets and the favicon stay open - they carry no secrets and the
  // UI needs them before it can attach a token.
  //
  // Scope is decided from the route the router RESOLVED, never from the raw
  // request URL. The router percent-decodes path segments and accepts an
  // absolute-form request target, so `/%61pi/health` and
  // `http://host/api/health` both reach the `/api/health` handler while
  // neither string starts with "/api/" - a raw-string prefix test waves those
  // straight past the gate. Keying on the registered route pattern also means
  // a newly added `/api/...` route is gated automatically, and `/api/v1/...`
  // is covered because rewriteUrl de-versions it before routing.
  if (apiToken) {
    app.addHook("onRequest", async (req, reply) => {
      const routeUrl = req.routeOptions.url;
      // An unrouted request carries no route pattern, so we cannot prove it is
      // outside API scope - refuse it rather than guess.
      const apiScoped = typeof routeUrl === "string" ? isApiRoute(routeUrl) : true;
      if (!apiScoped) return;
      const presented = bearerToken(req.headers["authorization"]);
      if (!presented || !timingSafeEqualStr(presented, apiToken)) {
        await reply
          .code(401)
          .header("WWW-Authenticate", "Bearer")
          .send({
            error: "Missing or invalid API token.",
            kind: "unauthorized",
            title: "Unauthorized",
            hint: "Send Authorization: Bearer <VIBESTRATE_API_TOKEN>.",
          });
      }
    });
  }

  // Map errors → typed JSON, AND record server-side failures into
  // .vibestrate/issues.ndjson so the failure inbox surface (panel +
  // dashboard badge) can show every problem the user might have
  // missed. 4xx caused by client input are NOT recorded (would
  // flood the stream); 5xx and uncaught errors always are.
  app.setErrorHandler(async (error: unknown, req, reply) => {
    if (error instanceof HttpError) {
      if (error.statusCode >= 500) {
        await recordIssue(
          opts.projectRoot,
          toIssueInput(error, {
            route: req.url,
            method: req.method,
            status: error.statusCode,
          }),
        ).catch(() => {});
      }
      const f = formatError(error);
      return reply.code(error.statusCode).send({
        error: error.message,
        kind: f.kind,
        title: relativizeRoot(f.title, opts.projectRoot),
        ...(f.hint ? { hint: relativizeRoot(f.hint, opts.projectRoot) } : {}),
      });
    }
    if (error && typeof error === "object" && "validation" in error) {
      const f = formatError(error);
      return reply.code(400).send({
        error: relativizeRoot(f.detail, opts.projectRoot),
        kind: f.kind,
        title: relativizeRoot(f.title, opts.projectRoot),
        ...(f.hint ? { hint: relativizeRoot(f.hint, opts.projectRoot) } : {}),
      });
    }
    const f = formatError(error);
    // The issue record keeps the detail verbatim - it is a local file, and the
    // absolute path is the useful part when debugging. The response does not:
    // filesystem errors put the server's own absolute path in `detail`, and
    // this body can travel to a client that is not the machine running the
    // server. Project-relative says the same thing without the home directory.
    await recordIssue(
      opts.projectRoot,
      toIssueInput(error, { route: req.url, method: req.method }),
    ).catch(() => {});
    reply.code(500).send({
      error: relativizeRoot(f.detail, opts.projectRoot),
      kind: f.kind,
      // title and hint too, not just detail: formatError's generic branch uses
      // the raw message as the title, so every errno without a hardcoded title
      // - ELOOP among them, which is what O_NOFOLLOW raises when it wins its
      // race - puts the same absolute path here.
      title: relativizeRoot(f.title, opts.projectRoot),
      ...(f.hint ? { hint: relativizeRoot(f.hint, opts.projectRoot) } : {}),
    });
  });

  // Health.
  app.get("/api/health", async () => ({ ok: true, projectRoot: opts.projectRoot }));

  /** What version of vibestrate is serving this dashboard. Same package.json the
   *  CLI reads for `vibe --version`, inlined by the bundler, so the number on
   *  screen can never drift from the binary that drew it. */
  app.get("/api/version", async () => ({ version: pkg.version }));

  // The managed scheduler handle, assigned after `app.listen` below. Declared
  // here so the self-shutdown route can stop it. Stays null when the server
  // runs without a managed scheduler (tests / `--no-scheduler`).
  let schedulerHandle: { stop: () => Promise<void>; pid: () => number | null } | null = null;

  // Self-shutdown - the inverse of the navigator's "Open". Stops this project's
  // scheduler, closes the HTTP server, then hands off to the process owner (the
  // `vibe ui` CLI calls `process.exit`). Loopback-gated like every `/api/*`
  // route; a non-loopback bind requires the bearer token. Idempotent.
  let shutdownRequested = false;
  app.post("/api/server/shutdown", async (_req, reply) => {
    if (shutdownRequested) return { ok: true, alreadyShuttingDown: true };
    shutdownRequested = true;
    void reply
      .header("connection", "close")
      .send({ ok: true, shuttingDown: true });
    // Flush the response first, then tear down + hand off.
    setTimeout(() => {
      void (async () => {
        try {
          if (schedulerHandle) await schedulerHandle.stop();
        } catch {
          /* best-effort */
        }
        try {
          await app.close();
        } catch {
          /* best-effort */
        }
        opts.onShutdownRequested?.();
      })();
    }, 80);
    return reply;
  });

  // Inline favicon - kills the noisy `/favicon.ico 404` log line that
  // every browser fires by default. Tiny accent-cyan terminal glyph
  // matching the dashboard chrome. Long-cache since it's static.
  const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0b0e13"/><path d="M8 11l5 5-5 5" fill="none" stroke="#3dd6f5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="15" y1="22" x2="24" y2="22" stroke="#3dd6f5" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  app.get("/favicon.ico", async (_req, reply) => {
    return reply
      .type("image/svg+xml")
      .header("Cache-Control", "public, max-age=86400")
      .send(FAVICON_SVG);
  });
  app.get("/favicon.svg", async (_req, reply) => {
    return reply
      .type("image/svg+xml")
      .header("Cache-Control", "public, max-age=86400")
      .send(FAVICON_SVG);
  });

  await registerRunsRoutes(app, { projectRoot: opts.projectRoot });
  await registerSpecUpRoutes(app, { projectRoot: opts.projectRoot });
  await registerArtifactRoutes(app, { projectRoot: opts.projectRoot });
  await registerDiffRoutes(app, { projectRoot: opts.projectRoot });
  await registerNotesRoutes(app, { projectRoot: opts.projectRoot });
  await registerSkillsRoutes(app, { projectRoot: opts.projectRoot });
  await registerFlowsRoutes(app, { projectRoot: opts.projectRoot });
  await registerComposerPresetsRoutes(app, { projectRoot: opts.projectRoot });
  await registerMetricsRoutes(app, { projectRoot: opts.projectRoot });
  await registerSetupRoutes(app, { projectRoot: opts.projectRoot });
  await registerApprovalsRoutes(app, { projectRoot: opts.projectRoot });
  await registerRoadmapRoutes(app, { projectRoot: opts.projectRoot });
  await registerTasksRoutes(app, { projectRoot: opts.projectRoot });
  await registerIntegrationRoutes(app, { projectRoot: opts.projectRoot });
  await registerWorkspaceRoutes(app, { projectRoot: opts.projectRoot });
  await registerQueueRoutes(app, { projectRoot: opts.projectRoot });
  await registerIssuesRoutes(app, { projectRoot: opts.projectRoot });
  await registerProposalsRoutes(app, { projectRoot: opts.projectRoot });
  await registerNotificationRoutes(app, { projectRoot: opts.projectRoot });
  await registerProjectRoutes(app, { projectRoot: opts.projectRoot });
  await registerParamsRoutes(app, { projectRoot: opts.projectRoot });
  await registerConfigRoutes(app, { projectRoot: opts.projectRoot });
  await registerAnnotationsRoutes(app, { projectRoot: opts.projectRoot });
  await registerBudgetRoutes(app, { projectRoot: opts.projectRoot });
  await registerConsultRoutes(app, { projectRoot: opts.projectRoot });
  await registerSupervisorRoutes(app, { projectRoot: opts.projectRoot });
  await registerGitRoutes(app, { projectRoot: opts.projectRoot });
  await registerRoleWorkRoutes(app, { projectRoot: opts.projectRoot });
  await registerCodeReferenceRoutes(app, { projectRoot: opts.projectRoot });
  await registerCodebaseEventRoutes(app, { projectRoot: opts.projectRoot });
  await registerEditorRoutes(app, { projectRoot: opts.projectRoot });
  await registerSuggestionRoutes(app, { projectRoot: opts.projectRoot });
  await registerBundlesRoutes(app, { projectRoot: opts.projectRoot });
  await registerValidationRoutes(app, { projectRoot: opts.projectRoot });
  await registerTerminalRoutes(app, {
    projectRoot: opts.projectRoot,
    driver: opts.terminalDriver,
  });
  await registerPoliciesRoutes(app, { projectRoot: opts.projectRoot });
  await registerCodebaseMapRoutes(app, { projectRoot: opts.projectRoot });
  await registerTodosRoutes(app, { projectRoot: opts.projectRoot });
  const { registerProvidersRoutes } = await import("./routes/providers.js");
  await registerProvidersRoutes(app, { projectRoot: opts.projectRoot });

  // Terminal catch-all for the API namespace. Without it an unmatched
  // `/api/...` path falls through to the static handler's `/*` route, which
  // sits outside the bearer gate - an unauthenticated caller could then map
  // which endpoints exist by telling a 404 apart from a 401. The router
  // prefers more specific patterns, so this never shadows a real route.
  app.all("/api/*", async (_req, reply) =>
    reply.code(404).send({ error: "Not found." }),
  );

  const uiDir = await locateUiDir(opts.uiDir);
  let uiAvailable = false;
  if (uiDir) {
    await app.register(fastifyStatic, {
      root: uiDir,
      prefix: "/",
      decorateReply: false,
      // Hashed `/assets/*` files are immutable and safe to cache for a
      // year; HTML must always revalidate so a redeploy doesn't leave
      // stale chunk references behind in browser cache.
      // @fastify/static v10 passes a FastifyReply here (v9 passed the raw
      // ServerResponse), so set cache headers via reply.header, not setHeader.
      setHeaders: (reply, filePath) => {
        if (/\/assets\//.test(filePath)) {
          reply.header("Cache-Control", "public, max-age=31536000, immutable");
        } else if (/\.html?$/.test(filePath)) {
          reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    });
    // SPA fallback: any non-API GET that didn't match → index.html.
    // Important caveat: don't 200 with an HTML fallback for requests
    // that look like static assets (have a file extension like .js,
    // .css, .map, .json, .svg, .png). Those should 404 honestly so
    // the browser surfaces "module not found" instead of the
    // confusing "Expected JS module but got text/html" error that
    // shows up when an old html page tries to import a chunk that
    // was renamed after a rebuild.
    const ASSET_EXT_RE = /\.[a-z0-9]{1,8}$/i;
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "Not found." });
      }
      const pathOnly = req.url.split("?")[0] ?? "";
      if (ASSET_EXT_RE.test(pathOnly)) {
        return reply
          .code(404)
          .type("text/plain")
          .send(`asset not found: ${pathOnly}`);
      }
      const indexPath = path.join(uiDir, "index.html");
      const html = await fs.readFile(indexPath, "utf8");
      return reply
        .type("text/html")
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .send(html);
    });
    uiAvailable = true;
  } else {
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "Not found." });
      }
      return reply
        .type("text/html")
        .send(
          `<!doctype html><meta charset="utf-8"><title>Vibestrate</title><body style="font-family:ui-monospace,Menlo,Consolas,monospace;background:#0b0e13;color:#cfd8e3;padding:24px;line-height:1.5"><h1 style="margin:0 0 8px">Vibestrate</h1><p>The dashboard UI bundle is not built yet.</p><p>Run <code>pnpm build:ui</code> from the Vibestrate project, then restart the server.</p></body>`,
        );
    });
  }

  await app.listen({ port, host });
  // Resolve the actual bound port (matters when port=0 is passed in tests).
  const addresses = app.addresses();
  const actualAddr = addresses[0];
  const actualPort = actualAddr ? actualAddr.port : port;
  const safeHost = host === "0.0.0.0" ? "127.0.0.1" : host;

  // Default: the UI server owns the scheduler subprocess. Killing the
  // UI sends SIGTERM to the scheduler and waits for it to finish.
  // Pass `withScheduler: false` to opt out (CI, tests, or when the
  // user manages the scheduler in a separate terminal).
  if (opts.withScheduler === true) {
    const { startManagedScheduler } = await import(
      "../scheduler/managed-scheduler.js"
    );
    schedulerHandle = await startManagedScheduler({
      projectRoot: opts.projectRoot,
    });
  }

  return {
    app,
    url: `http://${safeHost}:${actualPort}`,
    port: actualPort,
    host: safeHost,
    uiAvailable,
    schedulerPid: schedulerHandle?.pid() ?? null,
    close: async () => {
      if (schedulerHandle) await schedulerHandle.stop();
      await app.close();
    },
  };
}
