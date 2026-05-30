import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  fetchHubIndex,
  searchHub,
  installFlowFromHub,
} from "../src/flows/hub/flow-hub.js";
import type { FetchImpl } from "../src/flows/runtime/flow-portability.js";

const INDEX = JSON.stringify({
  schemaVersion: 1,
  flows: [
    {
      name: "deep-refactor",
      latest: "1.1.0",
      versions: ["1.0.0", "1.1.0"],
      label: "Deep Refactor",
      description: "A thorough refactor flow.",
      tags: ["refactor", "python"],
      author: "someone",
    },
    { name: "quick-fix", latest: "2.0.0", versions: ["2.0.0"], tags: ["fix"] },
  ],
});

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

// Serves index.json + the flow.yml by URL substring; 404 otherwise.
function routerFetch(routes: { match: string; body: string }[]): FetchImpl {
  return async (url) => {
    const hit = routes.find((r) => url.includes(r.match));
    return {
      ok: !!hit,
      status: hit ? 200 : 404,
      headers: { get: () => null },
      text: async () => hit?.body ?? "not found",
    };
  };
}

const BASE = "http://hub.test";

describe("flow hub — index", () => {
  it("fetches + validates the index", async () => {
    const r = await fetchHubIndex({
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([{ match: "/index.json", body: INDEX }]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.flows.map((f) => f.name)).toEqual(["deep-refactor", "quick-fix"]);
  });

  it("reports invalid JSON / schema failures", async () => {
    const bad = await fetchHubIndex({
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([{ match: "/index.json", body: "{ not json" }]),
    });
    expect(bad.ok).toBe(false);
    const wrong = await fetchHubIndex({
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([{ match: "/index.json", body: '{"schemaVersion":1}' }]),
    });
    expect(wrong.ok).toBe(false);
  });

  it("searchHub filters by name / tag / description", async () => {
    const r = await fetchHubIndex({
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([{ match: "/index.json", body: INDEX }]),
    });
    if (!r.ok) throw new Error("index");
    expect(searchHub(r.value, "python").map((f) => f.name)).toEqual(["deep-refactor"]);
    expect(searchHub(r.value, "fix").map((f) => f.name)).toEqual(["quick-fix"]);
    expect(searchHub(r.value, "")).toHaveLength(2);
  });
});

describe("flow hub — install", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-hub-"));
  });

  it("installs the latest flow.yml into the project", async () => {
    const r = await installFlowFromHub({
      projectRoot: dir,
      name: "deep-refactor",
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl: routerFetch([
        { match: "/index.json", body: INDEX },
        { match: "/flows/deep-refactor/1.1.0/flow.yml", body: FLOW_YAML },
      ]),
    });
    expect(r.ok).toBe(true);
    // It was written under .vibestrate/flows/.
    const written = await fs.readFile(
      path.join(dir, ".vibestrate", "flows", "deep-refactor", "flow.yml"),
      "utf8",
    );
    expect(written).toContain("id: deep-refactor");
  });

  it("404s an unknown flow name and an unknown version", async () => {
    const fetchImpl = routerFetch([{ match: "/index.json", body: INDEX }]);
    const missing = await installFlowFromHub({
      projectRoot: dir,
      name: "ghost",
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(404);
    const badVersion = await installFlowFromHub({
      projectRoot: dir,
      name: "deep-refactor",
      version: "9.9.9",
      baseUrl: BASE,
      allowPrivateHosts: true,
      fetchImpl,
    });
    expect(badVersion.ok).toBe(false);
  });
});
