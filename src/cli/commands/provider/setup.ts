import { confirm, select, input as askInput } from "@inquirer/prompts";
import { detectProject } from "../../../project/project-detector.js";
import { configExists } from "../../../project/config-loader.js";
import {
  addProvider,
  buildClaudeProviderFromDetection,
  buildCodexProviderFromDetection,
  buildOllamaProviderFromDetection,
  setDefaultProvider,
} from "../../../setup/provider-setup-service.js";
import { detectAllProviders } from "../../../providers/provider-detection.js";
import { color, header, indent, symbol } from "../../ui/format.js";
import { isInteractiveTTY } from "../../ui/format.js";
import { isVibestrateError } from "../../../utils/errors.js";

export async function runProviderSetup(): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Vibestrate config found. Run ${color.bold("vibe init")} first.`,
    );
    return 1;
  }

  if (!isInteractiveTTY()) {
    console.error(
      `${symbol.fail()} ${color.bold("vibe provider setup")} needs an interactive terminal.`,
    );
    console.error(
      `  ${symbol.arrow()} Run it locally, or use ${color.bold("vibe config set providers.<id>.command <cmd>")} for non-interactive setup.`,
    );
    return 1;
  }

  console.log(header("Provider setup"));
  console.log("");

  const detections = await detectAllProviders();
  const ready = detections.filter((d) => d.confidence === "ready" && d.available);
  const claude = ready.find((d) => d.id === "claude");
  // Codex doesn't graduate to "ready" in detection (its flag matrix
  // moves), but if it's on PATH we surface the starter preset as an
  // explicit choice so the user doesn't have to type the flags.
  const codex = detections.find((d) => d.id === "codex" && d.available);
  const ollama = detections.find((d) => d.id === "ollama" && d.available);

  type Choice = "claude" | "codex" | "ollama" | "custom";
  const choices: { name: string; value: Choice; description?: string }[] = [];
  if (claude) {
    choices.push({
      name: `Claude Code (detected: ${claude.command}${claude.version ? ` v${claude.version}` : ""})`,
      value: "claude",
    });
  }
  if (codex) {
    choices.push({
      name: `Codex CLI — starter preset (detected: ${codex.command}${codex.version ? ` v${codex.version}` : ""})`,
      value: "codex",
      description:
        "Applies `codex exec` with stdin prompt. Run `vibe provider test codex` after to verify the flags work in your version.",
    });
  }
  if (ollama) {
    choices.push({
      name: `Ollama — starter preset (detected: ${ollama.command}${ollama.version ? ` v${ollama.version}` : ""})`,
      value: "ollama",
      description:
        "Applies `ollama run qwen3.5` with stdin prompt. Pull that model first, or edit the model in project.yml after setup.",
    });
  }
  choices.push({ name: "Custom command", value: "custom" });

  const choice = await select<Choice>({
    message: "Which local coding CLI should Vibestrate use for its agents?",
    choices,
    default: claude ? "claude" : codex ? "codex" : ollama ? "ollama" : "custom",
  });

  try {
    if (choice === "claude" && claude) {
      await addProvider(detected.projectRoot, {
        id: "claude",
        config: buildClaudeProviderFromDetection(claude),
        alsoAssignAllProfiles: false,
      });
      const setRes = await setDefaultProvider(detected.projectRoot, "claude");
      if (setRes.ok) {
        console.log(
          `${symbol.ok()} Claude Code is now configured for all default agents.`,
        );
      } else {
        console.log(`${symbol.warn()} ${setRes.reason}`);
      }
    } else if (choice === "codex" && codex) {
      await addProvider(detected.projectRoot, {
        id: "codex",
        config: buildCodexProviderFromDetection(codex),
        alsoAssignAllProfiles: false,
      });
      const setRes = await setDefaultProvider(detected.projectRoot, "codex");
      if (setRes.ok) {
        console.log(
          `${symbol.ok()} Codex CLI is now configured for all default agents with the starter preset.`,
        );
        console.log(
          `  ${symbol.arrow()} Verify the invocation: ${color.bold("vibe provider test codex")}`,
        );
      } else {
        console.log(`${symbol.warn()} ${setRes.reason}`);
      }
    } else if (choice === "ollama" && ollama) {
      await addProvider(detected.projectRoot, {
        id: "ollama",
        config: buildOllamaProviderFromDetection(ollama),
        alsoAssignAllProfiles: false,
      });
      const setRes = await setDefaultProvider(detected.projectRoot, "ollama");
      if (setRes.ok) {
        console.log(
          `${symbol.ok()} Ollama is now configured for all default agents with the starter preset.`,
        );
        console.log(
          `  ${symbol.arrow()} Pull the default model if needed: ${color.bold("ollama pull qwen3.5")}`,
        );
        console.log(
          `  ${symbol.arrow()} Verify the invocation: ${color.bold("vibe provider test ollama")}`,
        );
      } else {
        console.log(`${symbol.warn()} ${setRes.reason}`);
      }
    } else {
      const id = await askInput({
        message: "Provider id (used to reference it in config):",
        default: "myagent",
        validate: (v) =>
          /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v.trim())
            ? true
            : "Use letters/digits/dash/underscore; must start with a letter.",
      });
      const command = await askInput({
        message: "Command to invoke (must be on PATH or absolute path):",
        validate: (v) => (v.trim().length > 0 ? true : "Required"),
      });
      const argsRaw = await askInput({
        message: "Args (space-separated). Leave empty for none.",
        default: "",
      });
      const inputMode = await select({
        message: "How does this CLI receive the prompt?",
        choices: [
          { name: "stdin (recommended)", value: "stdin" as const },
          { name: "as a final argument", value: "arg" as const },
        ],
        default: "stdin" as const,
      });
      const argList = argsRaw.trim().length > 0 ? argsRaw.trim().split(/\s+/) : [];

      console.log("");
      console.log(header("Will save:"));
      console.log(indent(`Id: ${id.trim()}`));
      console.log(indent(`Command: ${command.trim()}${argList.length ? ` ${argList.join(" ")}` : ""}`));
      console.log(indent(`Input: ${inputMode}`));
      console.log("");
      const ok = await confirm({ message: "Save this provider?", default: true });
      if (!ok) {
        console.log("Cancelled. Nothing saved.");
        return 0;
      }
      await addProvider(detected.projectRoot, {
        id: id.trim(),
        config: { type: "cli", command: command.trim(), args: argList, input: inputMode },
        alsoAssignAllProfiles: true,
      });
      console.log(`${symbol.ok()} Saved provider ${color.bold(id.trim())} and assigned all default agents to it.`);

      const runTest = await confirm({
        message: `Run a safe smoke test against ${id.trim()} now? It sends a tiny no-op prompt.`,
        default: false,
      });
      if (runTest) {
        const { runProviderTest } = await import("./test.js");
        await runProviderTest(id.trim(), { yes: true });
      }
    }
    console.log("");
    console.log(`${symbol.arrow()} Next: ${color.bold("vibe doctor")}`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${
        isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
}
