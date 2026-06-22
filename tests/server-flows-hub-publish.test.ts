import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { registerFlowsRoutes } from "../src/server/routes/flows.js";
import { HttpError } from "../src/server/security.js";
import { formatError } from "../src/core/error-format.js";

vi.mock("../src/flows/hub/hub-client.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  publishFlow: vi.fn(async () => ({
    ok: true,
    ref: "guy@my-flow:1.0.0",
    version: "1.0.0",
    sha256: "a".repeat(64),
    verified: false,
  })),
}));

vi.mock("../src/flows/runtime/flow-portability.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  exportFlowYaml: vi.fn(async () => ({
    ok: true,
    flowId: "my-flow",
    source: "project",
    yaml: "id: my-flow\nsteps: []\n",
  })),
}));

// Note: publish-guards.js is NOT mocked - the real buildPublishRef and
// runPublishPreflight run so that the !ref.ok and !pre.ok branches are tested.

async function build() {
  const app = Fastify({ logger: false });

  // Mirror the real server error handler so HttpError maps to its statusCode.
  app.setErrorHandler(async (error: unknown, _req, reply) => {
    if (error instanceof HttpError) {
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
      return reply.code(400).send({ error: f.detail, kind: f.kind, title: f.title });
    }
    const f = formatError(error);
    return reply.code(500).send({ error: f.detail, kind: f.kind, title: f.title });
  });

  await registerFlowsRoutes(app, { projectRoot: "/tmp/proj" });
  await app.ready();
  return app;
}

describe("POST /api/flows/hub/publish", () => {
  beforeEach(() => {
    delete process.env.VIBESTRATE_API_TOKEN;
    delete process.env.VIBESTRATE_HUB_TOKEN;
  });
  afterEach(() => {
    delete process.env.VIBESTRATE_API_TOKEN;
    delete process.env.VIBESTRATE_HUB_TOKEN;
    vi.clearAllMocks();
  });

  it("403s without VIBESTRATE_API_TOKEN (fail-closed)", async () => {
    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: "/api/flows/hub/publish",
      payload: { flowId: "my-flow", version: "1.0.0", handle: "guy", confirm: "publish" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("400s without the confirm literal", async () => {
    process.env.VIBESTRATE_API_TOKEN = "t";
    process.env.VIBESTRATE_HUB_TOKEN = "gho_xxxxxxxxxxxxxxxxxxxx";
    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: "/api/flows/hub/publish",
      payload: { flowId: "my-flow", version: "1.0.0", handle: "guy" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("400s when an unexpected field is present (strict schema)", async () => {
    process.env.VIBESTRATE_API_TOKEN = "t";
    process.env.VIBESTRATE_HUB_TOKEN = "gho_xxxxxxxxxxxxxxxxxxxx";
    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: "/api/flows/hub/publish",
      payload: { flowId: "my-flow", version: "1.0.0", handle: "guy", confirm: "publish", overwrite: true },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("412/400s when the hub token env-ref is unset (never 500)", async () => {
    process.env.VIBESTRATE_API_TOKEN = "t";
    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: "/api/flows/hub/publish",
      payload: { flowId: "my-flow", version: "1.0.0", handle: "guy", confirm: "publish" },
    });
    expect([400, 412]).toContain(res.statusCode);
    await app.close();
  });

  it("relays the upstream success with a valid ref", async () => {
    process.env.VIBESTRATE_API_TOKEN = "t";
    process.env.VIBESTRATE_HUB_TOKEN = "gho_xxxxxxxxxxxxxxxxxxxx";
    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: "/api/flows/hub/publish",
      payload: { flowId: "my-flow", version: "1.0.0", handle: "guy", confirm: "publish" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.ok).toBe(true);
    await app.close();
  });

  it("400s when the handle is invalid (!ref.ok branch)", async () => {
    process.env.VIBESTRATE_API_TOKEN = "t";
    process.env.VIBESTRATE_HUB_TOKEN = "gho_xxxxxxxxxxxxxxxxxxxx";
    const app = await build();
    // "BAD@HANDLE" contains '@' which is explicitly rejected by buildPublishRef
    const res = await app.inject({
      method: "POST",
      url: "/api/flows/hub/publish",
      payload: { flowId: "my-flow", version: "1.0.0", handle: "BAD@HANDLE", confirm: "publish" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("400s when the yaml contains a secret (!pre.ok branch) and does NOT call publishFlow", async () => {
    process.env.VIBESTRATE_API_TOKEN = "t";
    process.env.VIBESTRATE_HUB_TOKEN = "gho_xxxxxxxxxxxxxxxxxxxx";

    const { exportFlowYaml } = await import("../src/flows/runtime/flow-portability.js");
    const { publishFlow } = await import("../src/flows/hub/hub-client.js");

    // Inject yaml with an OpenAI-style secret so runPublishPreflight refuses
    vi.mocked(exportFlowYaml).mockResolvedValueOnce({
      ok: true,
      flowId: "my-flow",
      source: "project",
      yaml: "id: my-flow\nsteps:\n  - run: sk-" + "a".repeat(40) + "\n",
    } as never);

    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: "/api/flows/hub/publish",
      payload: { flowId: "my-flow", version: "1.0.0", handle: "guy", confirm: "publish" },
    });
    expect(res.statusCode).toBe(400);
    expect(vi.mocked(publishFlow)).not.toHaveBeenCalled();
    await app.close();
  });
});
