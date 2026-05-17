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
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerSetupRoutes } from "./routes/setup.js";
import { registerApprovalsRoutes } from "./routes/approvals.js";
import { registerRoadmapRoutes } from "./routes/roadmap.js";
import { registerTasksRoutes } from "./routes/tasks.js";
import { registerQueueRoutes } from "./routes/queue.js";
import { registerIssuesRoutes } from "./routes/issues.js";
import { registerProposalsRoutes } from "./routes/proposals.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerProjectRoutes } from "./routes/project.js";
import { registerGitRoutes } from "./routes/git.js";
import { registerAgentWorkRoutes } from "./routes/agent-work.js";
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
import { HttpError } from "./security.js";
import { recordIssue } from "../core/issues-store.js";

export const DEFAULT_AMACO_PORT = 4317;

export type StartServerOptions = {
  projectRoot: string;
  port?: number;
  host?: string;
  uiDir?: string;
  logger?: boolean;
  /** Optional driver injection for the terminal feature (tests). */
  terminalDriver?: TerminalRoutesDeps["driver"];
};

export type StartedServer = {
  app: FastifyInstance;
  url: string;
  port: number;
  host: string;
  uiAvailable: boolean;
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
  const port = opts.port ?? DEFAULT_AMACO_PORT;
  const host = opts.host ?? "127.0.0.1";

  const app = Fastify({
    logger: opts.logger === true,
    disableRequestLogging: !opts.logger,
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

  // Map errors → typed JSON, AND record server-side failures into
  // .amaco/issues.ndjson so the failure inbox surface (panel +
  // dashboard badge) can show every problem the user might have
  // missed. 4xx caused by client input are NOT recorded (would
  // flood the stream); 5xx and uncaught errors always are.
  app.setErrorHandler(async (error: unknown, req, reply) => {
    if (error instanceof HttpError) {
      if (error.statusCode >= 500) {
        await recordIssue(opts.projectRoot, {
          kind: "server-route",
          message: error.message,
          context: {
            route: req.url,
            method: req.method,
            status: error.statusCode,
          },
        }).catch(() => {});
      }
      return reply.code(error.statusCode).send({ error: error.message });
    }
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    if (error && typeof error === "object" && "validation" in error) {
      return reply.code(400).send({ error: message });
    }
    await recordIssue(opts.projectRoot, {
      kind: "server-uncaught",
      message,
      detail: error instanceof Error ? (error.stack ?? undefined) : undefined,
      context: { route: req.url, method: req.method },
    }).catch(() => {});
    reply.code(500).send({ error: message });
  });

  // Health.
  app.get("/api/health", async () => ({ ok: true, projectRoot: opts.projectRoot }));

  await registerRunsRoutes(app, { projectRoot: opts.projectRoot });
  await registerArtifactRoutes(app, { projectRoot: opts.projectRoot });
  await registerDiffRoutes(app, { projectRoot: opts.projectRoot });
  await registerNotesRoutes(app, { projectRoot: opts.projectRoot });
  await registerSkillsRoutes(app, { projectRoot: opts.projectRoot });
  await registerMetricsRoutes(app, { projectRoot: opts.projectRoot });
  await registerSetupRoutes(app, { projectRoot: opts.projectRoot });
  await registerApprovalsRoutes(app, { projectRoot: opts.projectRoot });
  await registerRoadmapRoutes(app, { projectRoot: opts.projectRoot });
  await registerTasksRoutes(app, { projectRoot: opts.projectRoot });
  await registerQueueRoutes(app, { projectRoot: opts.projectRoot });
  await registerIssuesRoutes(app, { projectRoot: opts.projectRoot });
  await registerProposalsRoutes(app, { projectRoot: opts.projectRoot });
  await registerNotificationRoutes(app, { projectRoot: opts.projectRoot });
  await registerProjectRoutes(app, { projectRoot: opts.projectRoot });
  await registerGitRoutes(app, { projectRoot: opts.projectRoot });
  await registerAgentWorkRoutes(app, { projectRoot: opts.projectRoot });
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

  const uiDir = await locateUiDir(opts.uiDir);
  let uiAvailable = false;
  if (uiDir) {
    await app.register(fastifyStatic, {
      root: uiDir,
      prefix: "/",
      decorateReply: false,
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
      return reply.type("text/html").send(html);
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
          `<!doctype html><meta charset="utf-8"><title>Amaco</title><body style="font-family:ui-monospace,Menlo,Consolas,monospace;background:#0b0e13;color:#cfd8e3;padding:24px;line-height:1.5"><h1 style="margin:0 0 8px">Amaco</h1><p>The dashboard UI bundle is not built yet.</p><p>Run <code>pnpm build:ui</code> from the Amaco project, then restart the server.</p></body>`,
        );
    });
  }

  await app.listen({ port, host });
  // Resolve the actual bound port (matters when port=0 is passed in tests).
  const addresses = app.addresses();
  const actualAddr = addresses[0];
  const actualPort = actualAddr ? actualAddr.port : port;
  const safeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return {
    app,
    url: `http://${safeHost}:${actualPort}`,
    port: actualPort,
    host: safeHost,
    uiAvailable,
    close: () => app.close(),
  };
}
