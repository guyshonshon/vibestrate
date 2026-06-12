import { describe, it, expect } from "vitest";
import {
  resolveFlowParams,
  substituteParams,
  referencedParamNames,
} from "../src/flows/runtime/prompt-params.js";
import { flowParamSchema, flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";
import type { FlowParam } from "../src/flows/schemas/flow-schema.js";

const def = (over: Partial<FlowParam>): FlowParam =>
  flowParamSchema.parse({ type: "string", ...over });

describe("resolveFlowParams (T11)", () => {
  it("applies provided values + defaults, coerces by type", () => {
    const r = resolveFlowParams(
      {
        name: def({ type: "string", required: true }),
        count: def({ type: "number", default: 3 }),
        flag: def({ type: "boolean" }),
      },
      { name: "Acme", flag: "yes" },
    );
    expect(r.missing).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.recorded).toEqual({ name: "Acme", count: 3, flag: true });
    expect(r.substitution).toEqual({ name: "Acme", count: "3", flag: "true" });
  });

  it("flags a missing required param", () => {
    const r = resolveFlowParams({ name: def({ required: true }) }, {});
    expect(r.missing).toEqual(["name"]);
  });

  it("rejects an unknown param and a bad enum/number", () => {
    const r = resolveFlowParams(
      {
        framework: def({ type: "enum", values: ["next", "astro"] }),
        n: def({ type: "number" }),
      },
      { framework: "svelte", n: "abc", nope: "x" },
    );
    expect(r.errors.some((e) => /Unknown param "nope"/.test(e))).toBe(true);
    expect(r.errors.some((e) => /not one of: next, astro/.test(e))).toBe(true);
    expect(r.errors.some((e) => /not a number/.test(e))).toBe(true);
  });

  it("records a secret as redacted and never the value", () => {
    const r = resolveFlowParams(
      { token: def({ type: "string", secret: true, required: true }) },
      { token: "super-secret-value" },
    );
    expect(r.recorded.token).toBe("[secret]");
    expect(r.substitution.token).toBe("[secret:token]");
    expect(JSON.stringify(r)).not.toContain("super-secret-value");
  });
});

describe("substituteParams (T11)", () => {
  it("replaces {{params.x}} (tolerating spaces) and leaves unknown refs intact", () => {
    const text = "Build a site for {{params.name}} using {{ params.framework }}; skip {{params.unknown}}.";
    const out = substituteParams(text, { name: "Acme", framework: "Next" });
    expect(out).toBe("Build a site for Acme using Next; skip {{params.unknown}}.");
  });

  it("a secret reference renders the placeholder, never the value", () => {
    expect(substituteParams("key: {{params.token}}", { token: "[secret:token]" })).toBe(
      "key: [secret:token]",
    );
  });

  it("referencedParamNames finds every name", () => {
    expect(referencedParamNames("{{params.a}} {{params.b}} {{params.a}}")).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("flow params schema (T11)", () => {
  it("accepts a flow declaring params", () => {
    const flow = flowDefinitionSchema.parse({
      id: "make-site",
      version: 1,
      label: "Make a site",
      description: "Scaffold a marketing site",
      seats: { builder: { label: "Builder" } },
      params: {
        siteName: { type: "string", required: true, description: "The site name" },
        framework: { type: "enum", values: ["next", "astro"], default: "next" },
      },
      steps: [{ id: "build", label: "Build", kind: "agent-turn", seat: "builder" }],
    });
    expect(Object.keys(flow.params ?? {})).toEqual(["siteName", "framework"]);
  });

  it("rejects an enum default not in values", () => {
    expect(() =>
      flowParamSchema.parse({ type: "enum", values: ["a", "b"], default: "c" }),
    ).toThrow();
  });

  it("rejects a secret param with a default", () => {
    expect(() =>
      flowParamSchema.parse({ type: "string", secret: true, default: "x" }),
    ).toThrow();
  });
});
