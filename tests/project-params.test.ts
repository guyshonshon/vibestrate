import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ParamStore,
  ParamWriteError,
  buildParamSetRequests,
  normalizeParamValue,
  paramKeyFor,
  paramEnvVarName,
  isParamKey,
  resolveParamsForFlow,
  seedParamsFromStore,
  emptyParams,
  projectParamsSchema,
} from "../src/project/project-params.js";
import { projectParamsPath } from "../src/utils/paths.js";
import { resolveFlowParams } from "../src/flows/runtime/prompt-params.js";
import { flowParamSchema } from "../src/flows/schemas/flow-schema.js";
import type { FlowParam } from "../src/flows/schemas/flow-schema.js";

const NOW = "2026-06-16T00:00:00.000Z";
const def = (over: Partial<FlowParam>): FlowParam =>
  flowParamSchema.parse({ type: "string", ...over });

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-profile-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("key derivation", () => {
  it("namespaces per-flow by default, bare key when shared", () => {
    expect(paramKeyFor("website", "name", false)).toBe("website.name");
    expect(paramKeyFor("website", "niche", true)).toBe("niche");
  });

  it("accepts both shared (bare) and namespaced keys; rejects junk", () => {
    expect(isParamKey("niche")).toBe(true);
    expect(isParamKey("website.name")).toBe(true);
    expect(isParamKey("color_tokens")).toBe(true);
    expect(isParamKey("Website.Name")).toBe(false);
    expect(isParamKey("a.b.c")).toBe(false);
    expect(isParamKey("has space")).toBe(false);
  });

  it("maps camelCase and snake_case param names to the same env var", () => {
    expect(paramEnvVarName("colorTokens")).toBe("VIBESTRATE_PARAM_COLOR_TOKENS");
    expect(paramEnvVarName("color_tokens")).toBe("VIBESTRATE_PARAM_COLOR_TOKENS");
    expect(paramEnvVarName("niche")).toBe("VIBESTRATE_PARAM_NICHE");
  });
});

describe("normalizeParamValue (secret + leak guard)", () => {
  it("stores a secret param as an env:NAME ref, never the literal", () => {
    expect(
      normalizeParamValue({ key: "f.api_key", value: "OPENAI_API_KEY", setBy: "user", secret: true }),
    ).toBe("env:OPENAI_API_KEY");
    // already-formed env:NAME is accepted too
    expect(
      normalizeParamValue({ key: "f.api_key", value: "env:OPENAI_API_KEY", setBy: "user", secret: true }),
    ).toBe("env:OPENAI_API_KEY");
  });

  it("refuses a secret value that isn't a valid env var name", () => {
    expect(() =>
      normalizeParamValue({ key: "f.api_key", value: "sk-not-a-name", setBy: "user", secret: true }),
    ).toThrow(ParamWriteError);
  });

  it("refuses a non-secret value that looks like a real credential (fail closed)", () => {
    expect(() =>
      normalizeParamValue({
        key: "f.token",
        value: "sk-ant-" + "a".repeat(50),
        setBy: "user",
        secret: false,
      }),
    ).toThrow(/looks like a secret/);
  });

  it("rejects an invalid storage key", () => {
    expect(() =>
      normalizeParamValue({ key: "Bad Key", value: "x", setBy: "user", secret: false }),
    ).toThrow(ParamWriteError);
  });
});

describe("ParamStore round trip", () => {
  it("set / read / unset, persisted atomically as JSON", async () => {
    const store = new ParamStore(root);
    expect(await store.read()).toEqual(emptyParams());

    await store.set(
      [{ key: "website.name", value: "Acme", setBy: "user", secret: false }],
      NOW,
    );
    const after = await store.read();
    expect(after.values["website.name"]).toEqual({
      value: "Acme",
      setBy: "user",
      at: NOW,
      secret: false,
    });
    // file is valid against the schema
    const onDisk = JSON.parse(await fs.readFile(projectParamsPath(root), "utf8"));
    expect(() => projectParamsSchema.parse(onDisk)).not.toThrow();

    // set replaces (supersede), never duplicates
    await store.set(
      [{ key: "website.name", value: "Beta", setBy: "user", secret: false }],
      "2026-06-17T00:00:00.000Z",
    );
    expect((await store.read()).values["website.name"]!.value).toBe("Beta");

    const removed = await store.unset(["website.name"]);
    expect(removed).toEqual(["website.name"]);
    expect((await store.read()).values["website.name"]).toBeUndefined();
    expect(await store.unset(["website.name"])).toEqual([]);
  });

  it("a corrupt profile file fails loud (no silent data loss)", async () => {
    await fs.mkdir(path.dirname(projectParamsPath(root)), { recursive: true });
    await fs.writeFile(projectParamsPath(root), "{ not json", "utf8");
    await expect(new ParamStore(root).read()).rejects.toThrow();
  });
});

describe("buildParamSetRequests", () => {
  const defs = {
    name: def({ type: "string" }),
    count: def({ type: "number" }),
    tier: def({ type: "enum", values: ["a", "b"] }),
    niche: def({ type: "string", shared: true }),
    api_key: def({ type: "string", secret: true }),
  };

  it("namespaces flow params, keeps shared bare, type-checks values", () => {
    const r = buildParamSetRequests({
      flowId: "web",
      defs,
      assignments: [
        { key: "name", value: "Acme" },
        { key: "niche", value: "SaaS" },
        { key: "count", value: "5" },
      ],
    });
    expect(r.errors).toEqual([]);
    expect(r.requests.map((x) => x.key)).toEqual(["web.name", "niche", "web.count"]);
  });

  it("errors on an unknown param and a bad-typed value", () => {
    const r = buildParamSetRequests({
      flowId: "web",
      defs,
      assignments: [
        { key: "nope", value: "x" },
        { key: "count", value: "abc" },
        { key: "tier", value: "z" },
      ],
    });
    expect(r.errors.length).toBe(3);
    expect(r.requests).toEqual([]);
  });

  it("a secret param collects an env var NAME and warns when it isn't set", () => {
    const r = buildParamSetRequests({
      flowId: "web",
      defs,
      assignments: [{ key: "api_key", value: "OPENAI_API_KEY" }],
      env: {},
    });
    expect(r.errors).toEqual([]);
    expect(r.requests[0]).toMatchObject({ key: "web.api_key", value: "OPENAI_API_KEY", secret: true });
    expect(r.warnings.join(" ")).toMatch(/OPENAI_API_KEY is not set/);
  });

  it("no flow: bare key warns about project-global scope; junk key errors", () => {
    const r = buildParamSetRequests({
      flowId: null,
      defs: null,
      assignments: [
        { key: "niche", value: "SaaS" },
        { key: "web.name", value: "Acme" },
        { key: "Bad Key", value: "x" },
      ],
    });
    expect(r.requests.map((x) => x.key)).toEqual(["niche", "web.name"]);
    expect(r.warnings.join(" ")).toMatch(/project-global/);
    expect(r.errors.length).toBe(1);
  });
});

describe("resolveParamsForFlow", () => {
  it("keys by param name through the flow namespace", async () => {
    const profile = projectParamsSchema.parse({
      schemaVersion: 1,
      values: {
        "web.name": { value: "Acme", setBy: "user", at: NOW, secret: false },
        niche: { value: "SaaS", setBy: "user", at: NOW, secret: false },
        "other.name": { value: "Wrong", setBy: "user", at: NOW, secret: false },
      },
    });
    const resolved = resolveParamsForFlow(profile, "web", {
      name: def({ type: "string" }),
      niche: def({ type: "string", shared: true }),
    });
    expect(resolved.name!.value).toBe("Acme");
    expect(resolved.niche!.value).toBe("SaaS");
    expect(resolved.name!.key).toBe("web.name");
  });
});

describe("seedParamsFromStore (precedence)", () => {
  const defs = {
    name: def({ type: "string", required: true }),
    niche: def({ type: "string", shared: true }),
    count: def({ type: "number", default: 3 }),
  };
  const profile = projectParamsSchema.parse({
    schemaVersion: 1,
    values: {
      "web.name": { value: "FromProfile", setBy: "user", at: NOW, secret: false },
      niche: { value: "SaaS", setBy: "user", at: NOW, secret: false },
    },
  });

  it("explicit > env > profile, default left for the resolver", () => {
    const seeded = seedParamsFromStore(
      defs,
      "web",
      { name: "Explicit" }, // explicit wins
      profile,
      { VIBESTRATE_PARAM_NICHE: "EnvNiche" }, // env beats the profile's shared niche
    );
    expect(seeded.name).toBe("Explicit");
    expect(seeded.niche).toBe("EnvNiche");
    expect(seeded.count).toBeUndefined(); // default applied later by resolveFlowParams

    const resolved = resolveFlowParams(defs, seeded);
    expect(resolved.missing).toEqual([]);
    expect(resolved.recorded).toEqual({ name: "Explicit", niche: "EnvNiche", count: 3 });
  });

  it("profile fills a required param so the run doesn't fail fast", () => {
    const seeded = seedParamsFromStore(defs, "web", {}, profile, {});
    const resolved = resolveFlowParams(defs, seeded);
    expect(resolved.missing).toEqual([]);
    expect(resolved.recorded.name).toBe("FromProfile");
    expect(resolved.recorded.niche).toBe("SaaS");
  });

  it("nothing seeded -> required param still missing (fail-fast preserved)", () => {
    const seeded = seedParamsFromStore(defs, "web", {}, emptyParams(), {});
    const resolved = resolveFlowParams(defs, seeded);
    expect(resolved.missing).toEqual(["name"]);
  });

  it("an explicit empty value falls through to the profile/default (not provided)", () => {
    const seeded = seedParamsFromStore(
      defs,
      "web",
      { name: "", count: "" },
      profile,
      {},
    );
    expect(seeded.name).toBe("FromProfile"); // empty explicit -> profile fills
    expect("count" in seeded).toBe(false); // empty explicit dropped -> default applies
    const resolved = resolveFlowParams(defs, seeded);
    expect(resolved.recorded.name).toBe("FromProfile");
    expect(resolved.recorded.count).toBe(3);
  });
});

describe("seedParamsFromStore (secret env presence — fail-fast)", () => {
  const defs = { token: def({ type: "string", required: true, secret: true }) };
  const profile = projectParamsSchema.parse({
    schemaVersion: 1,
    values: {
      "web.token": { value: "env:MY_TOKEN", setBy: "user", at: NOW, secret: true },
    },
  });

  it("seeds a stored secret only when its env var resolves", () => {
    const withEnv = seedParamsFromStore(defs, "web", {}, profile, { MY_TOKEN: "x" });
    expect(withEnv.token).toBe("env:MY_TOKEN");
    expect(resolveFlowParams(defs, withEnv).missing).toEqual([]);
  });

  it("an unset env var falls through to missing-required (no silent non-functional run)", () => {
    const noEnv = seedParamsFromStore(defs, "web", {}, profile, {});
    expect("token" in noEnv).toBe(false);
    expect(resolveFlowParams(defs, noEnv).missing).toEqual(["token"]);
  });
});
