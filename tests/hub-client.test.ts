import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  searchHubFlows,
  pullHubFlow,
  installFlowFromHub,
} from "../src/flows/hub/hub-client.js";
import type { FetchImpl } from "../src/flows/runtime/flow-portability.js";

const FLOW_YAML = `id: deep-refactor
version: 1
label: Deep Refactor
description: A flow installed from the hub.
seats:
  builder:
    label: Builder
steps:
  - id: build
    label: Build
    kind: agent-turn
    seat: builder
`;

const SHA = createHash("sha256").update(FLOW_YAML, "utf8").digest("hex");

const SEARCH = JSON.stringify({
  flows: [
    {
      ref: "deep-refactor@1.1.0",
      name: "deep-refactor",
      verified: true,
      version: "1.1.0",
      tags: ["refactor"],
      diagnosis: { verdict: "ok" },
    },
    { ref: "quick-fix@2.0.0", name: "quick-fix", verified: false, version: "2.0.0" },
  ],
});

function routerFetch(
  routes: { match: string; status?: number; body: string }[],
): FetchImpl {
  return async (url) => {
    const hit = routes.find((r) => url.includes(r.match));
    return {
      ok: hit ? (hit.status ?? 200) < 400 : false,
      status: hit?.status ?? (hit ? 200 : 404),
      headers: { get: () => null },
      text: async () => hit?.body ?? "not found",
    };
  };
}

const BASE = "http://hub.test";

describe("hub-client - search", () => {
  it("fetches + validates the flow list", async () => {
    const r = await searchHubFlows({
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([{ match: "/api/hub/flows", body: SEARCH }]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.map((f) => f.ref)).toEqual([
        "deep-refactor@1.1.0",
        "quick-fix@2.0.0",
      ]);
      expect(r.value[0]!.verified).toBe(true);
    }
  });

  it("sends only the provided query params", async () => {
    let seen = "";
    const fetchImpl: FetchImpl = async (url) => {
      seen = url;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ flows: [] }),
      };
    };
    await searchHubFlows({
      baseUrl: BASE,
      allowPrivateHosts: true,
      q: "refactor",
      tag: "python",
      limit: 10,
      fetchImpl,
    });
    expect(seen).toContain("q=refactor");
    expect(seen).toContain("tag=python");
    expect(seen).toContain("limit=10");
    expect(seen).not.toContain("author=");
  });

  it("reports invalid JSON and schema failures", async () => {
    const bad = await searchHubFlows({
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([{ match: "/api/hub/flows", body: "{ not json" }]),
    });
    expect(bad.ok).toBe(false);
    const wrong = await searchHubFlows({
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([
        { match: "/api/hub/flows", body: '{"flows":[{"name":"no-ref"}]}' },
      ]),
    });
    expect(wrong.ok).toBe(false);
  });
});

describe("hub-client - pull", () => {
  it("pulls and verifies sha256", async () => {
    const body = JSON.stringify({
      ref: "deep-refactor@1.1.0",
      name: "deep-refactor",
      content: FLOW_YAML,
      sha256: SHA,
    });
    const r = await pullHubFlow({
      ref: "deep-refactor@1.1.0",
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([{ match: "/api/hub/pull/", body }]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.content).toContain("id: deep-refactor");
  });

  it("rejects a sha256 mismatch (integrity guard)", async () => {
    const body = JSON.stringify({
      ref: "x",
      content: FLOW_YAML,
      sha256: "0".repeat(64),
    });
    const r = await pullHubFlow({
      ref: "x",
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([{ match: "/api/hub/pull/", body }]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/sha256 mismatch/i);
  });
});

describe("hub-client - install", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-hub-"));
  });

  it("pulls by ref and writes the flow into the project", async () => {
    const body = JSON.stringify({
      ref: "deep-refactor@1.1.0",
      content: FLOW_YAML,
      sha256: SHA,
    });
    const r = await installFlowFromHub({
      projectRoot: dir,
      ref: "deep-refactor@1.1.0",
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([{ match: "/api/hub/pull/", body }]),
    });
    expect(r.ok).toBe(true);
    const written = await fs.readFile(
      path.join(dir, ".vibestrate", "flows", "deep-refactor", "flow.yml"),
      "utf8",
    );
    expect(written).toContain("id: deep-refactor");
  });

  it("fails closed (502) when the pull fails", async () => {
    const r = await installFlowFromHub({
      projectRoot: dir,
      ref: "ghost",
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(502);
  });
});
