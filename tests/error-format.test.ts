import { describe, it, expect } from "vitest";
import {
  formatError,
  formatErrorLine,
  toIssueInput,
} from "../src/core/error-format.js";

describe("formatError", () => {
  it("maps spawn ENOENT to a friendly install hint", () => {
    const err = Object.assign(new Error("spawn claude ENOENT"), {
      code: "ENOENT",
      syscall: "spawn",
    });
    const f = formatError(err);
    expect(f.kind).toBe("spawn-enoent");
    expect(f.title).toContain("claude");
    expect(f.hint).toMatch(/PATH/);
  });

  it("maps fs ENOENT (non-spawn) to file-not-found", () => {
    const err = Object.assign(new Error("ENOENT: no such file"), {
      code: "ENOENT",
      path: "/tmp/missing.txt",
    });
    const f = formatError(err);
    expect(f.kind).toBe("fs-enoent");
    expect(f.detail).toContain("/tmp/missing.txt");
  });

  it("maps EADDRINUSE with port number", () => {
    const err = Object.assign(new Error("listen EADDRINUSE 0.0.0.0:4317"), {
      code: "EADDRINUSE",
      port: 4317,
    });
    const f = formatError(err);
    expect(f.kind).toBe("port-in-use");
    expect(f.title).toContain("4317");
    expect(f.hint).toMatch(/--port/);
  });

  it("maps Fastify-style 409 HttpError", () => {
    const err = Object.assign(new Error("Task is linked to active run."), {
      statusCode: 409,
    });
    const f = formatError(err);
    expect(f.kind).toBe("http-409");
    expect(f.hint).toMatch(/already in flight/);
  });

  it("maps ZodError by name", () => {
    const err = Object.assign(new Error("Invalid input"), { name: "ZodError" });
    const f = formatError(err);
    expect(f.kind).toBe("validation");
    expect(f.hint).toMatch(/Fix the highlighted/);
  });

  it("passes through an already-formatted error unchanged", () => {
    const f = { kind: "test", title: "t", detail: "d", hint: "h" } as const;
    expect(formatError(f)).toBe(f);
  });

  it("formatErrorLine combines title + hint", () => {
    const err = Object.assign(new Error("listen EADDRINUSE"), {
      code: "EADDRINUSE",
      port: 9999,
    });
    expect(formatErrorLine(err)).toMatch(/9999.*--port/);
  });

  it("toIssueInput maps to the recordIssue shape", () => {
    const err = Object.assign(new Error("ENOENT"), {
      code: "ENOENT",
      path: "/x",
    });
    const issue = toIssueInput(err, { runId: "run-1" });
    expect(issue.kind).toBe("fs-enoent");
    expect(issue.message).toBe("File not found");
    expect(issue.fix).toBeTruthy();
    expect(issue.context).toEqual({ runId: "run-1" });
  });

  it("falls back gracefully on unknown errors", () => {
    const f = formatError("a bare string");
    expect(f.kind).toBe("error");
    expect(f.title).toBe("a bare string");
  });
});
