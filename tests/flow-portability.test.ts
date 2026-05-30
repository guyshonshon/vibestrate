import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import {
  createProjectFlow,
  exportFlowYaml,
  importFlowFromFile,
  importFlowFromText,
  importFlowFromUrl,
  isBlockedIp,
  validateFlowObject,
  validateFlowText,
  writeProjectFlowDefinition,
  FLOW_IMPORT_MAX_BYTES,
  type FetchImpl,
} from "../src/flows/runtime/flow-portability.js";
import { findFlowById } from "../src/flows/catalog/flow-discovery.js";
import { findBuiltinFlow } from "../src/flows/catalog/builtin-flows.js";

const VALID_FLOW = `id: imported-flow
version: 1
label: Imported Flow
description: A flow imported during a test.
seats:
  worker:
    label: Worker
steps:
  - id: do
    label: Do the thing
    kind: agent-turn
    seat: worker
`;

const tmpRoots: string[] = [];
async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-portab-"));
  await fs.mkdir(path.join(root, ".vibestrate", "flows"), { recursive: true });
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  while (tmpRoots.length) {
    const r = tmpRoots.pop()!;
    await fs.rm(r, { recursive: true, force: true }).catch(() => undefined);
  }
});

function fakeFetch(body: string, init?: { status?: number; contentLength?: string }): FetchImpl {
  return async () => ({
    ok: (init?.status ?? 200) < 400,
    status: init?.status ?? 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-length" ? init?.contentLength ?? null : null,
    },
    text: async () => body,
  });
}

describe("exportFlowYaml", () => {
  it("exports a builtin as canonical YAML that re-parses to the same id", async () => {
    const root = await makeRoot();
    const result = await exportFlowYaml({ projectRoot: root, flowId: "default" });
    if (!result.ok) throw new Error(result.reasons.join("\n"));
    expect(result.source.kind).toBe("builtin");
    const reparsed = YAML.parse(result.yaml) as { id: string };
    expect(reparsed.id).toBe("default");
  });

  it("404s for an unknown flow", async () => {
    const root = await makeRoot();
    const result = await exportFlowYaml({ projectRoot: root, flowId: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it("round-trips builtin → export → import → identical definition", async () => {
    const root = await makeRoot();
    const exported = await exportFlowYaml({ projectRoot: root, flowId: "default" });
    if (!exported.ok) throw new Error("export failed");
    const imported = await importFlowFromText({
      projectRoot: root,
      text: exported.yaml,
    });
    if (!imported.ok) throw new Error(imported.reasons.join("\n"));
    const found = await findFlowById(root, "default");
    expect(found?.source.kind).toBe("project");
    expect(found?.definition).toEqual(findBuiltinFlow("default"));
  });
});

describe("validateFlowText / validateFlowObject", () => {
  it("accepts a valid flow", () => {
    const v = validateFlowText(VALID_FLOW);
    expect(v.ok).toBe(true);
  });

  it("rejects schema-invalid YAML with field reasons", () => {
    const v = validateFlowText("id: Bad_Id\nversion: 1\n");
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.status).toBe(400);
  });

  it("rejects unparseable YAML", () => {
    const v = validateFlowText("id: [unterminated\n");
    expect(v.ok).toBe(false);
  });

  it("refuses a flow that smuggles a secret token", () => {
    const withSecret = VALID_FLOW.replace(
      "A flow imported during a test.",
      "key AKIAIOSFODNN7EXAMPLE leaked",
    );
    const v = validateFlowText(withSecret);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.reasons.join(" ")).toMatch(/secret/i);
  });

  it("refuses control characters", () => {
    const v = validateFlowText(VALID_FLOW + "\u0007");
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.reasons.join(" ")).toMatch(/control character/i);
  });

  it("refuses oversize input", () => {
    const big = `${VALID_FLOW}# ${"x".repeat(FLOW_IMPORT_MAX_BYTES)}`;
    const v = validateFlowText(big);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.status).toBe(413);
  });

  it("validateFlowObject scans the canonical form for secrets", () => {
    const obj = YAML.parse(VALID_FLOW);
    obj.description = "sk-ant-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const v = validateFlowObject(obj);
    expect(v.ok).toBe(false);
  });
});

describe("writeProjectFlowDefinition / import", () => {
  it("writes a new project flow under .vibestrate/flows/", async () => {
    const root = await makeRoot();
    const result = await importFlowFromText({ projectRoot: root, text: VALID_FLOW });
    if (!result.ok) throw new Error(result.reasons.join("\n"));
    expect(result.overwritten).toBe(false);
    expect(result.definitionPath).toBe(
      path.join(".vibestrate", "flows", "imported-flow", "flow.yml"),
    );
    const onDisk = await fs.readFile(
      path.join(root, ".vibestrate", "flows", "imported-flow", "flow.yml"),
      "utf8",
    );
    expect(YAML.parse(onDisk).id).toBe("imported-flow");
  });

  it("refuses to clobber an existing project flow without overwrite", async () => {
    const root = await makeRoot();
    await importFlowFromText({ projectRoot: root, text: VALID_FLOW });
    const again = await importFlowFromText({ projectRoot: root, text: VALID_FLOW });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.status).toBe(409);
  });

  it("replaces with overwrite: true and reports overwritten", async () => {
    const root = await makeRoot();
    await importFlowFromText({ projectRoot: root, text: VALID_FLOW });
    const renamed = VALID_FLOW.replace("Imported Flow", "Imported Flow v2");
    const again = await importFlowFromText({
      projectRoot: root,
      text: renamed,
      overwrite: true,
    });
    if (!again.ok) throw new Error(again.reasons.join("\n"));
    expect(again.overwritten).toBe(true);
    const found = await findFlowById(root, "imported-flow");
    expect(found?.definition.label).toBe("Imported Flow v2");
  });

  it("createProjectFlow validates an object and writes it", async () => {
    const root = await makeRoot();
    const def = YAML.parse(VALID_FLOW);
    const result = await createProjectFlow({ projectRoot: root, definition: def });
    if (!result.ok) throw new Error(result.reasons.join("\n"));
    expect(result.flowId).toBe("imported-flow");
  });

  it("createProjectFlow rejects an invalid object", async () => {
    const root = await makeRoot();
    const result = await createProjectFlow({
      projectRoot: root,
      definition: { id: "x", version: 0 },
    });
    expect(result.ok).toBe(false);
  });

  it("writeProjectFlowDefinition is path-guarded by the schema-constrained id", async () => {
    const root = await makeRoot();
    // The id schema already forbids slashes/dots, so this is belt-and-suspenders:
    // a normal id lands inside the flows dir.
    const def = YAML.parse(VALID_FLOW);
    const w = await writeProjectFlowDefinition({ projectRoot: root, definition: def });
    if (!w.ok) throw new Error(w.reasons.join("\n"));
    expect(w.definitionPath.startsWith(path.join(".vibestrate", "flows"))).toBe(true);
  });
});

describe("importFlowFromFile", () => {
  it("imports from a local file path", async () => {
    const root = await makeRoot();
    const src = path.join(root, "shared.flow.yml");
    await fs.writeFile(src, VALID_FLOW, "utf8");
    const result = await importFlowFromFile({ projectRoot: root, filePath: src });
    if (!result.ok) throw new Error(result.reasons.join("\n"));
    expect(result.flowId).toBe("imported-flow");
  });

  it("400s when the file does not exist", async () => {
    const root = await makeRoot();
    const result = await importFlowFromFile({
      projectRoot: root,
      filePath: path.join(root, "missing.yml"),
    });
    expect(result.ok).toBe(false);
  });
});

describe("importFlowFromUrl", () => {
  it("imports via an injected fetch (private hosts allowed for CLI use)", async () => {
    const root = await makeRoot();
    const result = await importFlowFromUrl({
      projectRoot: root,
      url: "https://example.test/flow.yml",
      allowPrivateHosts: true,
      fetchImpl: fakeFetch(VALID_FLOW),
    });
    if (!result.ok) throw new Error(result.reasons.join("\n"));
    expect(result.flowId).toBe("imported-flow");
  });

  it("rejects non-http(s) schemes", async () => {
    const root = await makeRoot();
    const result = await importFlowFromUrl({
      projectRoot: root,
      url: "file:///etc/passwd",
      fetchImpl: fakeFetch(VALID_FLOW),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/http/i);
  });

  it("SSRF guard blocks a loopback-literal host (API path)", async () => {
    const root = await makeRoot();
    const result = await importFlowFromUrl({
      projectRoot: root,
      url: "http://127.0.0.1/flow.yml",
      fetchImpl: fakeFetch(VALID_FLOW),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/SSRF|private|loopback/i);
  });

  it("honors content-length over the size cap", async () => {
    const root = await makeRoot();
    const result = await importFlowFromUrl({
      projectRoot: root,
      url: "https://example.test/flow.yml",
      allowPrivateHosts: true,
      fetchImpl: fakeFetch(VALID_FLOW, { contentLength: String(FLOW_IMPORT_MAX_BYTES + 1) }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(413);
  });
});

describe("isBlockedIp", () => {
  it("blocks loopback / private / link-local ranges", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.1.2.3")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("172.31.255.255")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("169.254.1.1")).toBe(true);
    expect(isBlockedIp("100.64.0.1")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
    expect(isBlockedIp("fd00::1")).toBe(true);
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("172.32.0.1")).toBe(false);
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
  });
});
