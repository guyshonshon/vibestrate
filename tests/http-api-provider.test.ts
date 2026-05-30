import { describe, it, expect, afterEach } from "vitest";
import {
  runHttpApiProvider,
  type FetchLike,
} from "../src/providers/http-api-provider.js";
import { providerConfigSchema } from "../src/providers/provider-schema.js";
import { providerCapabilitiesForConfig as caps } from "../src/providers/provider-capabilities.js";

// A fake fetch that records the request and replays a canned body.
function fakeFetch(
  body: unknown,
  opts: { ok?: boolean; status?: number } = {},
): { fetch: FetchLike; calls: { url: string; headers: Record<string, string>; body: string }[] } {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      statusText: opts.ok === false ? "Error" : "OK",
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
  };
  return { fetch, calls };
}

const input = {
  providerId: "p",
  prompt: "say hi",
  cwd: "/tmp",
};

afterEach(() => {
  delete process.env.TEST_API_KEY;
});

describe("runHttpApiProvider — anthropic", () => {
  it("builds the messages request and maps usage to real metrics", async () => {
    process.env.TEST_API_KEY = "sk-secret-123456";
    const config = providerConfigSchema.parse({
      type: "http-api",
      api: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
      apiKey: "env:TEST_API_KEY",
    });
    const { fetch, calls } = fakeFetch({
      model: "claude-sonnet-4-5",
      content: [{ type: "text", text: "hi there" }],
      usage: { input_tokens: 12, output_tokens: 3, cache_read_input_tokens: 5 },
    });
    const r = await runHttpApiProvider(config as never, input, fetch);
    expect(r.normalized.responseText).toBe("hi there");
    expect(r.normalized.metrics?.tokenUsage).toEqual({
      input: 12,
      output: 3,
      cacheRead: 5,
      cacheCreation: undefined,
    });
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]!.headers["x-api-key"]).toBe("sk-secret-123456");
    expect(calls[0]!.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("errors clearly when the env var is unset, without leaking", async () => {
    const config = providerConfigSchema.parse({
      type: "http-api",
      api: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "m",
      apiKey: "env:TEST_API_KEY",
    });
    const { fetch } = fakeFetch({});
    await expect(runHttpApiProvider(config as never, input, fetch)).rejects.toThrow(
      /TEST_API_KEY/,
    );
  });

  it("redacts the key from an HTTP error body", async () => {
    process.env.TEST_API_KEY = "sk-secret-abcdef";
    const config = providerConfigSchema.parse({
      type: "http-api",
      api: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "m",
      apiKey: "env:TEST_API_KEY",
    });
    const { fetch } = fakeFetch("auth failed for sk-secret-abcdef", {
      ok: false,
      status: 401,
    });
    await expect(
      runHttpApiProvider(config as never, input, fetch),
    ).rejects.toThrow(/\[redacted\]/);
  });
});

describe("runHttpApiProvider — openai + ollama", () => {
  it("openai: chat/completions + usage → metrics", async () => {
    process.env.TEST_API_KEY = "sk-openai-123456";
    const config = providerConfigSchema.parse({
      type: "http-api",
      api: "openai",
      baseUrl: "https://api.openai.com",
      model: "gpt-4o",
      apiKey: "env:TEST_API_KEY",
    });
    const { fetch, calls } = fakeFetch({
      model: "gpt-4o",
      choices: [{ message: { content: "yo" } }],
      usage: { prompt_tokens: 8, completion_tokens: 2 },
    });
    const r = await runHttpApiProvider(config as never, input, fetch);
    expect(r.normalized.responseText).toBe("yo");
    expect(r.normalized.metrics?.tokenUsage).toEqual({ input: 8, output: 2 });
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0]!.headers["authorization"]).toBe("Bearer sk-openai-123456");
  });

  it("localhost ollama: /api/chat, no key needed, real token counts", async () => {
    const config = providerConfigSchema.parse({
      type: "localhost-proxy",
      api: "ollama",
      baseUrl: "http://localhost:11434",
      model: "qwen3.5",
    });
    const { fetch, calls } = fakeFetch({
      model: "qwen3.5",
      message: { content: "local hi" },
      prompt_eval_count: 20,
      eval_count: 7,
    });
    const r = await runHttpApiProvider(config as never, input, fetch);
    expect(r.normalized.responseText).toBe("local hi");
    expect(r.normalized.metrics?.tokenUsage).toEqual({ input: 20, output: 7 });
    expect(calls[0]!.url).toBe("http://localhost:11434/api/chat");
    expect(calls[0]!.headers["authorization"]).toBeUndefined();
  });
});

describe("provider schema safety", () => {
  it("rejects a literal API key (must be an env-ref)", () => {
    expect(
      providerConfigSchema.safeParse({
        type: "http-api",
        api: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "m",
        apiKey: "sk-literal-key",
      }).success,
    ).toBe(false);
  });

  it("rejects http-api over http:// or pointed at localhost", () => {
    expect(
      providerConfigSchema.safeParse({
        type: "http-api",
        api: "openai",
        baseUrl: "http://api.openai.com",
        model: "m",
        apiKey: "env:K",
      }).success,
    ).toBe(false);
    expect(
      providerConfigSchema.safeParse({
        type: "http-api",
        api: "openai",
        baseUrl: "https://localhost:8080",
        model: "m",
        apiKey: "env:K",
      }).success,
    ).toBe(false);
  });

  it("rejects a localhost-proxy pointed at an external host", () => {
    expect(
      providerConfigSchema.safeParse({
        type: "localhost-proxy",
        api: "openai",
        baseUrl: "https://api.openai.com",
        model: "m",
      }).success,
    ).toBe(false);
  });

  it("non-CLI providers report real token usage in capabilities", () => {
    const cfg = providerConfigSchema.parse({
      type: "http-api",
      api: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "m",
      apiKey: "env:K",
    });
    expect(caps(cfg as never).reportsTokenUsage).toBe(true);
  });
});
