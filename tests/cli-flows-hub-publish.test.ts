import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/flows/hub/hub-client.js", () => ({
  publishFlow: vi.fn(),
  searchHubFlows: vi.fn(),
  installFlowFromHub: vi.fn(),
}));
vi.mock("../src/flows/runtime/flow-portability.js", () => ({
  exportFlowYaml: vi.fn(),
}));
vi.mock("../src/project/project-detector.js", () => ({
  detectProject: vi.fn().mockResolvedValue({ projectRoot: "/fake/project" }),
}));

import { runHubPublish } from "../src/cli/commands/flows/hub.js";
import { publishFlow } from "../src/flows/hub/hub-client.js";
import { exportFlowYaml } from "../src/flows/runtime/flow-portability.js";

describe("runHubPublish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VIBESTRATE_HUB_TOKEN;
    (exportFlowYaml as any).mockResolvedValue({
      ok: true,
      flowId: "x-flow",
      source: "project",
      yaml: "id: x-flow\nsteps: []\n",
    });
  });

  it("fails fast (no network) when the token env var is unset", async () => {
    const code = await runHubPublish("x-flow", {
      version: "1.0.0",
      handle: "guy",
      yes: true,
    });
    expect(code).toBe(1);
    expect(publishFlow).not.toHaveBeenCalled();
  });

  it("publishes on the happy path with --yes", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    (publishFlow as any).mockResolvedValue({
      ok: true,
      ref: "guy@x-flow:1.0.0",
      version: "1.0.0",
      sha256: "a".repeat(64),
      verified: false,
    });
    const code = await runHubPublish("x-flow", {
      version: "1.0.0",
      handle: "guy",
      yes: true,
    });
    expect(code).toBe(0);
    expect(publishFlow).toHaveBeenCalledOnce();
  });

  it("aborts (no network) on an invalid handle/name ref", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    const code = await runHubPublish("x-flow", {
      version: "latest",
      handle: "guy",
      yes: true,
    });
    expect(code).toBe(1);
    expect(publishFlow).not.toHaveBeenCalled();
  });

  it("fails fast when --version is missing", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    const code = await runHubPublish("x-flow", { handle: "guy", yes: true });
    expect(code).toBe(1);
    expect(publishFlow).not.toHaveBeenCalled();
  });

  it("fails fast when --handle is missing", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    const code = await runHubPublish("x-flow", { version: "1.0.0", yes: true });
    expect(code).toBe(1);
    expect(publishFlow).not.toHaveBeenCalled();
  });

  it("fails fast when the flow is not found", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    (exportFlowYaml as any).mockResolvedValue({
      ok: false,
      status: 404,
      reasons: ['Flow "missing-flow" not found.'],
    });
    const code = await runHubPublish("missing-flow", {
      version: "1.0.0",
      handle: "guy",
      yes: true,
    });
    expect(code).toBe(1);
    expect(publishFlow).not.toHaveBeenCalled();
  });

  it("fails fast when preflight detects a secret", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    // A GitHub PAT in the YAML content triggers the preflight guard
    (exportFlowYaml as any).mockResolvedValue({
      ok: true,
      flowId: "x-flow",
      source: "project",
      yaml: "id: x-flow\ntoken: ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n",
    });
    const code = await runHubPublish("x-flow", {
      version: "1.0.0",
      handle: "guy",
      yes: true,
    });
    expect(code).toBe(1);
    expect(publishFlow).not.toHaveBeenCalled();
  });

  it("returns 1 and surfaces error when publishFlow fails", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    (publishFlow as any).mockResolvedValue({
      ok: false,
      status: 422,
      reason: "flow rejected by scanner",
      diagnosis: {
        verdict: "rejected",
        findings: [{ id: "rce", message: "curl | sh", severity: "critical" }],
      },
    });
    const code = await runHubPublish("x-flow", {
      version: "1.0.0",
      handle: "guy",
      yes: true,
    });
    expect(code).toBe(1);
  });

  it("returns 0 and reports alreadyExisted", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    (publishFlow as any).mockResolvedValue({
      ok: true,
      ref: "guy@x-flow:1.0.0",
      version: "1.0.0",
      sha256: "a".repeat(64),
      verified: false,
      alreadyExisted: true,
    });
    const code = await runHubPublish("x-flow", {
      version: "1.0.0",
      handle: "guy",
      yes: true,
    });
    expect(code).toBe(0);
  });

  it("returns 1 and surfaces the server reason on 403", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (publishFlow as any).mockResolvedValue({
      ok: false,
      status: 403,
      reason: "you can only publish under your own handle (@realuser)",
    });
    const code = await runHubPublish("x-flow", {
      version: "1.0.0",
      handle: "guy",
      yes: true,
    });
    expect(code).toBe(1);
    const printed = errSpy.mock.calls.flat().join(" ");
    expect(printed).toContain("you can only publish under your own handle (@realuser)");
    errSpy.mockRestore();
  });

  it("returns 0 and runs the flagged warning path without error", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    (publishFlow as any).mockResolvedValue({
      ok: true,
      ref: "guy@x-flow:1.0.0",
      version: "1.0.0",
      sha256: "a".repeat(64),
      verified: false,
      diagnosis: {
        verdict: "flagged",
        findings: [{ severity: "low", message: "embeds an absolute path" }],
      },
    });
    const code = await runHubPublish("x-flow", {
      version: "1.0.0",
      handle: "guy",
      yes: true,
    });
    expect(code).toBe(0);
  });
});
