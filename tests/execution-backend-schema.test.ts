import { describe, it, expect } from "vitest";
import { executionBackendIdSchema } from "../src/core/execution/execution-backend-schema.js";

/**
 * `remote-sandbox` and `cloud-runner` were accepted by config and had no
 * implementation, so `selectExecutionBackend` fell through to the host backend -
 * a run configured for isolation silently ran unisolated. Removing them is the
 * fix, but an existing project.yml still carries the value, and `backend` is a
 * surviving field, so the parse fails rather than being stripped. That failure
 * reaches every command through loadConfig, so it has to name the fix.
 */
describe("executionBackendIdSchema", () => {
  it("accepts the backends that exist", () => {
    expect(executionBackendIdSchema.safeParse("local-worktree").success).toBe(true);
    expect(executionBackendIdSchema.safeParse("docker").success).toBe(true);
  });

  it("refuses a removed backend rather than silently running on the host", () => {
    for (const removed of ["remote-sandbox", "cloud-runner"]) {
      const r = executionBackendIdSchema.safeParse(removed);
      expect(r.success, `${removed} must not validate`).toBe(false);
    }
  });

  // The whole point of the custom message: a bare "invalid enum value" tells the
  // owner nothing, and this error blocks every command until they act on it.
  it("tells the owner what to set instead", () => {
    for (const removed of ["remote-sandbox", "cloud-runner"]) {
      const r = executionBackendIdSchema.safeParse(removed);
      const message = r.success ? "" : r.error.issues[0]?.message ?? "";
      expect(message, `${removed} message must name the key`).toContain(
        "execution.backend",
      );
      expect(message, `${removed} message must name the replacement`).toContain(
        "local-worktree",
      );
      expect(message, `${removed} message must say why`).toMatch(/never implemented|host/i);
    }
  });

  it("leaves an unrelated bad value on the default message", () => {
    const r = executionBackendIdSchema.safeParse("nonsense");
    expect(r.success).toBe(false);
    const message = r.success ? "" : r.error.issues[0]?.message ?? "";
    expect(message).not.toContain("was removed");
  });
});
