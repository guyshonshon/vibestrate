/**
 * `vibe init --yes` used to write a `claude` provider no matter which CLI was
 * detected: `renderProvidersYaml` special-cased `id === "claude"` and its
 * fallback ALSO emitted claude. On a codex-only machine init printed "codex
 * detected" and wrote a config pointing at a binary that is not on PATH, so
 * the first `vibe run` failed for a reason the output misdirected about.
 *
 * The invariant these tests defend: what init WRITES, what init PRINTS, and
 * what `planSetup` RECOMMENDED are all the same provider. Each case runs the
 * real `applySetup` against a detection runner where exactly one CLI answers
 * `--version`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import { applySetup } from "../src/setup/setup-service.js";
import { scaffoldedProviderInvocation } from "../src/project/init-template.js";
import { PROVIDER_PRESETS } from "../src/providers/provider-presets.js";
import type {
  KnownProviderId,
  ProviderDetectionRunner,
} from "../src/providers/provider-detection.js";

type WrittenProvider = {
  type: string;
  command: string;
  args: string[];
  input: string;
};

type GeneratedConfig = {
  providers: Record<string, WrittenProvider>;
  profiles: Record<string, { provider: string }>;
  crews: Record<string, { roles: Record<string, { profile: string }> }>;
};

/** Only `<command> --version` exits 0; every other CLI is absent. */
function onlyOnPath(command: string): ProviderDetectionRunner {
  return async (cmd) =>
    cmd === command
      ? { exitCode: 0, stdout: `${command} 1.2.3`, stderr: "" }
      : { exitCode: 127, stdout: "", stderr: "command not found" };
}

async function readGeneratedConfig(projectRoot: string): Promise<GeneratedConfig> {
  const text = await fs.readFile(
    path.join(projectRoot, ".vibestrate", "project.yml"),
    "utf8",
  );
  return YAML.parse(text) as GeneratedConfig;
}

// Every provider `pickRecommendedProvider` can return (preset-ready + popular),
// paired with the CLI name whose presence triggers it.
const PRESET_READY: ReadonlyArray<{ id: KnownProviderId; command: string }> = [
  { id: "claude", command: "claude" },
  { id: "codex", command: "codex" },
  { id: "gemini", command: "gemini" },
  { id: "aider", command: "aider" },
  { id: "ollama", command: "ollama" },
];

describe("init scaffolds the recommended provider", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-scaffold-"));
  });

  for (const { id, command } of PRESET_READY) {
    it(`writes '${id}' - not claude - when ${command} is the only CLI on PATH`, async () => {
      const { plan } = await applySetup({
        options: { projectRoot },
        detectionRunner: onlyOnPath(command),
      });
      expect(plan.recommendedProvider?.id).toBe(id);

      const cfg = await readGeneratedConfig(projectRoot);

      // THE regression: the written provider id is the recommended one, and it
      // is the ONLY provider written (a stray `claude` entry would fail here).
      expect(Object.keys(cfg.providers)).toEqual([id]);

      const written = cfg.providers[id]!;
      expect(written.command).toBe(plan.recommendedProvider!.command);

      // args/input come from the canonical preset, not retyped by the renderer.
      const preset = PROVIDER_PRESETS[id].preset;
      expect(written.args).toEqual(preset.args);
      expect(written.input).toBe(preset.input);

      // The profile and every default-crew role point at that same provider.
      expect(cfg.profiles[`${id}-balanced`]?.provider).toBe(id);
      for (const role of Object.values(cfg.crews["default"]!.roles)) {
        expect(cfg.profiles[role.profile]?.provider).toBe(id);
      }

      // What init prints ("Default agents will use: ...") is rendered from the
      // same helper as the file, so the two cannot disagree.
      expect(scaffoldedProviderInvocation(plan)).toBe(
        [written.command, ...written.args].join(" "),
      );
    });
  }

  it("falls back to the claude placeholder when no CLI is detected", async () => {
    const { plan } = await applySetup({
      options: { projectRoot },
      detectionRunner: async () => ({ exitCode: 127, stdout: "", stderr: "" }),
    });
    expect(plan.recommendedProvider).toBeNull();

    const cfg = await readGeneratedConfig(projectRoot);
    // Matches SetupPlan.defaultProviderId, which falls back to "claude".
    expect(Object.keys(cfg.providers)).toEqual([plan.defaultProviderId]);
    expect(cfg.providers["claude"]!.args).toEqual(["-p"]);
  });

  it("scaffolds claude as type: cli - claude-code stays an explicit opt-in", async () => {
    const { plan } = await applySetup({
      options: { projectRoot },
      detectionRunner: onlyOnPath("claude"),
    });
    expect(plan.recommendedProvider?.id).toBe("claude");
    const cfg = await readGeneratedConfig(projectRoot);
    // Documented in docs/content/getting-started/quickstart.md: `claude-code`
    // is what grants a write seat --permission-mode acceptEdits, so init does
    // not turn it on for the user. Change this test only alongside those docs.
    expect(cfg.providers["claude"]!.type).toBe("cli");
  });
});
