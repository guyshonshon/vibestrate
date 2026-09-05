import { describe, it, expect } from "vitest";
import { probeModels } from "../src/providers/probe-models.js";

/**
 * These endpoints are user-configurable and every request carries a credential -
 * an API key, or the collector's auth token. Letting the HTTP client follow a
 * 3xx would re-issue the request, credential attached, to a host nothing
 * validated. None of them has a legitimate reason to redirect, so they refuse.
 */
describe("credential-bearing fetches refuse redirects", () => {
  it("probeModels asks for manual redirects and refuses a 3xx", async () => {
    let askedRedirect: string | undefined;
    const res = await probeModels({
      api: "openai",
      chatUrl: "https://api.example.com/v1/chat/completions",
      requireKey: false,
      fetchImpl: async (_url: string, init: { redirect?: string }) => {
        askedRedirect = init.redirect;
        return { ok: false, status: 302, text: async () => "" };
      },
    } as never);
    expect(askedRedirect).toBe("manual");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("redirect");
  });

  // The telemetry exporter (exportRunToOtlp) carries the same change and the
  // same shape. It is not exercised here because it reads a real run directory
  // from disk to build the trace, which is a disproportionate fixture for two
  // lines; it is covered by inspection and by typecheck, not by this test.
});
