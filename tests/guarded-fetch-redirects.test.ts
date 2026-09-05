import { describe, it, expect } from "vitest";
import { fetchGuardedText } from "../src/core/guarded-fetch.js";

/**
 * The SSRF guard runs on the URL a caller supplied, and `fetch` follows a 3xx
 * on its own - so a public host answering `302 Location: http://127.0.0.1/...`
 * walked straight past a check that had already passed. Redirects are followed
 * by hand now and every hop is re-checked.
 *
 * `example.com` and `www.iana.org` are used because the guard resolves the host
 * and fails closed on a resolution error: an invented name would be refused
 * before any of this logic ran, and the test would pass without testing it.
 */
type FakeRes = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

function scriptedFetch(script: Record<string, { status: number; location?: string; body?: string }>) {
  const asked: string[] = [];
  const impl = async (
    url: string,
    init: { signal: AbortSignal; redirect?: "manual" | "follow" },
  ): Promise<FakeRes> => {
    asked.push(url);
    // The guard must ask for manual redirects; following them itself is the bug.
    expect(init.redirect).toBe("manual");
    const hit = script[url] ?? { status: 404 };
    return {
      ok: hit.status >= 200 && hit.status < 300,
      status: hit.status,
      headers: { get: (n) => (n.toLowerCase() === "location" ? (hit.location ?? null) : null) },
      text: async () => hit.body ?? "",
    };
  };
  return { impl, asked };
}

describe("fetchGuardedText - redirects", () => {
  it("refuses a redirect from a public host to loopback", async () => {
    const { impl, asked } = scriptedFetch({
      "https://example.com/flow.yml": { status: 302, location: "http://127.0.0.1:4317/api/runs" },
      "http://127.0.0.1:4317/api/runs": { status: 200, body: "SECRET-LOCAL-DATA" },
    });
    const res = await fetchGuardedText({ url: "https://example.com/flow.yml", fetchImpl: impl as never });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("127.0.0.1");
    // The loopback hop was never requested.
    expect(asked).toEqual(["https://example.com/flow.yml"]);
  });

  it("still follows a redirect between public hosts", async () => {
    const { impl } = scriptedFetch({
      "https://example.com/a.yml": { status: 301, location: "https://www.iana.org/b.yml" },
      "https://www.iana.org/b.yml": { status: 200, body: "id: moved" },
    });
    const res = await fetchGuardedText({ url: "https://example.com/a.yml", fetchImpl: impl as never });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.text).toBe("id: moved");
  });

  it("gives up on a redirect loop instead of following it forever", async () => {
    const { impl } = scriptedFetch({
      "https://example.com/x": { status: 302, location: "https://example.com/x" },
    });
    const res = await fetchGuardedText({ url: "https://example.com/x", fetchImpl: impl as never });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("Too many redirects");
  });

  it("refuses a redirect to a non-http scheme", async () => {
    const { impl } = scriptedFetch({
      "https://example.com/j": { status: 302, location: "file:///etc/passwd" },
    });
    const res = await fetchGuardedText({ url: "https://example.com/j", fetchImpl: impl as never });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("non-http");
  });
});
