import { describe, it, expect } from "vitest";
import {
  modelsUrlFor,
  parseModels,
  probeModels,
  type ProbeFetch,
} from "../src/providers/probe-models.js";

/**
 * Asking a cloud provider what models it has.
 *
 * This is the one thing in a catalog refresh that leaves the machine, and it
 * spends the user's key, so the tests that matter are the ones about NOT doing
 * it and about not leaking the key when it goes wrong.
 */
const respond = (body: string, status = 200): ProbeFetch =>
  async () => ({ ok: status < 400, status, text: async () => body });

describe("the models endpoint is derived, not configured", () => {
  it("reduces an OpenAI chat url to /v1/models", () => {
    expect(modelsUrlFor("openai", "https://api.openai.com/v1/chat/completions")).toBe(
      "https://api.openai.com/v1/models",
    );
  });

  it("reduces an Anthropic messages url to /v1/models", () => {
    expect(modelsUrlFor("anthropic", "https://api.anthropic.com/v1/messages")).toBe(
      "https://api.anthropic.com/v1/models",
    );
  });

  it("uses Ollama's own tags route", () => {
    expect(modelsUrlFor("ollama", "http://127.0.0.1:11434/api/chat")).toBe(
      "http://127.0.0.1:11434/api/tags",
    );
  });

  it("keeps a self-hosted base path instead of assuming the vendor's", () => {
    expect(modelsUrlFor("openai", "https://gw.internal/proxy/v1/chat/completions")).toBe(
      "https://gw.internal/proxy/v1/models",
    );
  });

  it("returns null for something that is not a url, rather than guessing", () => {
    expect(modelsUrlFor("openai", "not a url")).toBeNull();
  });
});

describe("parsing a model list", () => {
  it("reads the OpenAI/Anthropic shape", () => {
    expect(parseModels("openai", '{"data":[{"id":"gpt-5"},{"id":"gpt-4o"}]}')).toEqual([
      "gpt-4o",
      "gpt-5",
    ]);
  });

  it("reads Ollama's shape", () => {
    expect(parseModels("ollama", '{"models":[{"name":"llama3"},{"name":"qwen"}]}')).toEqual([
      "llama3",
      "qwen",
    ]);
  });

  it("distinguishes an unreadable body from an empty list", () => {
    // Returning [] for a shape we did not understand would report "this
    // provider has no models", which the user would act on.
    expect(parseModels("openai", "<html>login</html>")).toBeNull();
    expect(parseModels("openai", '{"unexpected":true}')).toBeNull();
    expect(parseModels("openai", '{"data":[]}')).toEqual([]);
  });

  it("drops rows with no usable id rather than emitting blanks", () => {
    expect(parseModels("openai", '{"data":[{"id":"a"},{},{"id":"  "},{"id":"a"}]}')).toEqual(["a"]);
  });
});

describe("probing", () => {
  it("returns the models on success", async () => {
    const r = await probeModels({
      api: "openai",
      chatUrl: "https://api.openai.com/v1/chat/completions",
      apiKeyRef: "env:TEST_KEY_UNSET",
      requireKey: false,
      fetchImpl: respond('{"data":[{"id":"gpt-5"}]}'),
    });
    expect(r).toEqual({ ok: true, models: ["gpt-5"] });
  });

  it("refuses without a key rather than sending an unauthenticated request", async () => {
    let called = false;
    const spy: ProbeFetch = async () => {
      called = true;
      return { ok: true, status: 200, text: async () => "{}" };
    };
    const r = await probeModels({
      api: "openai",
      chatUrl: "https://api.openai.com/v1/chat/completions",
      apiKeyRef: "env:DEFINITELY_NOT_SET_ANYWHERE",
      requireKey: true,
      fetchImpl: spy,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("no-key");
    expect(called, "it made a request it had no key for").toBe(false);
  });

  it("sends each vendor its own auth scheme", async () => {
    process.env.VIBESTRATE_TEST_PROBE_KEY = "sekrit-value";
    const seen: Record<string, string>[] = [];
    const capture: ProbeFetch = async (_u, init) => {
      seen.push(init.headers);
      return { ok: true, status: 200, text: async () => '{"data":[]}' };
    };
    await probeModels({
      api: "anthropic",
      chatUrl: "https://api.anthropic.com/v1/messages",
      apiKeyRef: "env:VIBESTRATE_TEST_PROBE_KEY",
      requireKey: true,
      fetchImpl: capture,
    });
    // A bearer sent to Anthropic is ignored, and the probe would look like an
    // auth failure it is not.
    expect(seen[0]?.["x-api-key"]).toBe("sekrit-value");
    expect(seen[0]?.authorization).toBeUndefined();
    expect(seen[0]?.["anthropic-version"]).toBeTruthy();
    delete process.env.VIBESTRATE_TEST_PROBE_KEY;
  });

  it("never puts the key in an error, even when the vendor echoes it back", async () => {
    process.env.VIBESTRATE_TEST_PROBE_KEY = "sk-super-secret-value";
    const echoes: ProbeFetch = async () => ({
      ok: false,
      status: 401,
      // Some gateways reflect the Authorization header into the error body.
      text: async () => '{"error":"bad key: Bearer sk-super-secret-value"}',
    });
    const r = await probeModels({
      api: "openai",
      chatUrl: "https://api.openai.com/v1/chat/completions",
      apiKeyRef: "env:VIBESTRATE_TEST_PROBE_KEY",
      requireKey: true,
      fetchImpl: echoes,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("http");
      expect(r.reason, "the key leaked into a terminal").not.toContain("sk-super-secret-value");
    }
    delete process.env.VIBESTRATE_TEST_PROBE_KEY;
  });

  it("reports an unreachable host instead of throwing", async () => {
    const boom: ProbeFetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const r = await probeModels({
      api: "ollama",
      chatUrl: "http://127.0.0.1:11434/api/chat",
      requireKey: false,
      fetchImpl: boom,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unreachable");
  });
});
