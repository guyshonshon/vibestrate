import type { FastifyInstance } from "fastify";
import { loadConfig } from "../../project/config-loader.js";
import {
  buildProjectRoots,
  PathGuardError,
  resolveSafePath,
} from "../../core/path-guard.js";
import {
  detectEditors,
  EditorOpenError,
  openInEditor,
  validateEditorConfig,
} from "../../core/editor-service.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { runStateSchema } from "../../core/state-machine.js";
import { assertSafeRunId, HttpError } from "../security.js";
import { EventLog } from "../../core/event-log.js";

export type EditorRoutesDeps = { projectRoot: string };

export async function registerEditorRoutes(
  app: FastifyInstance,
  deps: EditorRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/editor/status", async () => {
    const candidates = await detectEditors();
    let configured = null;
    try {
      const loaded = await loadConfig(projectRoot);
      configured = {
        config: loaded.config.editor,
        validation: validateEditorConfig(loaded.config.editor),
      };
    } catch {
      configured = null;
    }
    return { candidates, configured };
  });

  app.post<{
    Body: {
      path?: string;
      runId?: string | null;
      line?: number | null;
      column?: number | null;
    };
  }>("/api/editor/open", async (req) => {
    const body = req.body ?? {};
    const requestedPath = (body.path ?? "").toString().trim();
    if (!requestedPath) throw new HttpError(400, "path is required.");

    const loaded = await loadConfig(projectRoot).catch(() => null);
    if (!loaded) {
      throw new HttpError(
        409,
        "Project is not initialised. Run `amaco init` first.",
      );
    }
    if (!loaded.config.editor.enabled) {
      throw new HttpError(
        409,
        "Editor handoff is disabled. Run `amaco editor set <command>` to enable it.",
      );
    }

    let worktreePath: string | undefined;
    let runId: string | null = null;
    if (body.runId) {
      assertSafeRunId(body.runId);
      const stateFile = runStatePath(projectRoot, body.runId);
      if (await pathExists(stateFile)) {
        const raw = await readJson<unknown>(stateFile);
        const parsed = runStateSchema.safeParse(raw);
        if (parsed.success && parsed.data.worktreePath) {
          worktreePath = parsed.data.worktreePath;
          runId = body.runId;
        }
      }
    }
    const roots = buildProjectRoots({
      projectRoot,
      worktreePath,
      worktreeLabel: runId ? `worktree:${runId}` : undefined,
    });
    let resolved;
    try {
      resolved = await resolveSafePath(requestedPath, roots);
    } catch (err) {
      if (err instanceof PathGuardError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }

    const auditLog = runId ? new EventLog(projectRoot, runId) : null;
    try {
      const result = await openInEditor({
        config: loaded.config.editor,
        resolved,
        line: body.line ?? null,
        column: body.column ?? null,
      });
      if (auditLog) {
        await auditLog.append({
          type: result.ok ? "editor.opened" : "editor.open_failed",
          message: `editor.${result.ok ? "opened" : "open_failed"}: ${resolved.relativePath}`,
          data: {
            command: result.command,
            path: resolved.relativePath,
            line: body.line ?? null,
            errorMessage: result.errorMessage,
          },
        });
      }
      if (!result.ok) {
        return {
          ok: false,
          command: result.command,
          path: resolved.relativePath,
          message:
            result.errorMessage ??
            "Editor command exited with a non-zero status.",
        };
      }
      return {
        ok: true,
        command: result.command,
        path: resolved.relativePath,
      };
    } catch (err) {
      if (err instanceof EditorOpenError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
  });
}
