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
import { registerQueueRoutes } from "./routes/queue.js";
import { registerIssuesRoutes } from "./routes/issues.js";
import { registerProposalsRoutes } from "./routes/proposals.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerProjectRoutes } from "./routes/project.js";
import { registerAnnotationsRoutes } from "./routes/annotations.js";
import { registerBudgetRoutes } from "./routes/budget.js";
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
import {
  HttpError,
  bearerToken,
  isLoopbackHost,
  timingSafeEqualStr,
} from "./security.js";
import { recordIssue } from "../core/issues-store.js";
import { formatError, toIssueInput } from "../core/error-format.js";

export const DEFAULT_VIBESTRATE_PORT = 4317;

/** Canonical version prefix. Requests to `/api/v1/...` are rewritten to
 *  `/api/...` before routing so the versioned contract and the bundled UI
 *  (which still calls `/api/...`) share one handler set. Bump alongside a
 *  breaking payload change and keep the old prefix routing for a deprecation
 *  window. */
export const API_VERSION_PREFIX = "/api/v1";

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
  // token is a footgun — refuse to start so we never expose an unauthenticated
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
  // /api/queue/run, etc.) are body-less by design — let those work
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

  // Lock down to localhost: refuse forwarded host headers, allow only local origins.
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers["origin"];
    if (typeof origin === "string" && origin.length > 0) {
      try {
        const url = new URL(origin);
        const allowed =
          url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          url.hostname === host;
        if (!allowed) {
          await reply.code(403).send({ error: "Cross-origin requests are not allowed." });
        }
      } catch {
        // Malformed origin: continue to next handler.
      }
    }
  });

  // Optional bearer-token gate. Off by default (loopback, no token) so the
  // local-first single-user flow stays friction-free. When a token is
  // configured, every `/api/*` request must present it (constant-time
  // compared). Static UI assets and the favicon stay open — they carry no
  // secrets and the UI needs them before it can attach a token. The url here
  // is already de-versioned (rewriteUrl ran before routing), so `/api/v1/*`
  // is covered by the same `/api/` check.
  if (apiToken) {
    app.addHook("onRequest", async (req, reply) => {
      if (!req.url.startsWith("/api/")) return;
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
        title: f.title,
        ...(f.hint ? { hint: f.hint } : {}),
      });
    }
    if (error && typeof error === "object" && "validation" in error) {
      const f = formatError(error);
      return reply.code(400).send({
        error: f.detail,
        kind: f.kind,
        title: f.title,
        ...(f.hint ? { hint: f.hint } : {}),
      });
    }
    const f = formatError(error);
    await recordIssue(
      opts.projectRoot,
      toIssueInput(error, { route: req.url, method: req.method }),
    ).catch(() => {});
    reply.code(500).send({
      error: f.detail,
      kind: f.kind,
      title: f.title,
      ...(f.hint ? { hint: f.hint } : {}),
    });
  });

  // Health.
  app.get("/api/health", async () => ({ ok: true, projectRoot: opts.projectRoot }));

  // Inline favicon — kills the noisy `/favicon.ico 404` log line that
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
  await registerQueueRoutes(app, { projectRoot: opts.projectRoot });
  await registerIssuesRoutes(app, { projectRoot: opts.projectRoot });
  await registerProposalsRoutes(app, { projectRoot: opts.projectRoot });
  await registerNotificationRoutes(app, { projectRoot: opts.projectRoot });
  await registerProjectRoutes(app, { projectRoot: opts.projectRoot });
  await registerAnnotationsRoutes(app, { projectRoot: opts.projectRoot });
  await registerBudgetRoutes(app, { projectRoot: opts.projectRoot });
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
  const { registerProvidersRoutes } = await import("./routes/providers.js");
  await registerProvidersRoutes(app, { projectRoot: opts.projectRoot });

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
      setHeaders: (res, filePath) => {
        if (/\/assets\//.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (/\.html?$/.test(filePath)) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
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
  let schedulerHandle: { stop: () => Promise<void>; pid: () => number | null } | null = null;
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
