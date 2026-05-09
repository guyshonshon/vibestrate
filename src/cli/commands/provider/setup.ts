import { confirm, select, input as askInput } from "@inquirer/prompts";
import { detectProject } from "../../../project/project-detector.js";
import { configExists } from "../../../project/config-loader.js";
import {
  addProvider,
  buildClaudeProviderFromDetection,
  setDefaultProvider,
} from "../../../setup/provider-setup-service.js";
import { detectAllProviders } from "../../../providers/provider-detection.js";
import { color, header, indent, symbol } from "../../ui/format.js";
import { isInteractiveTTY } from "../../ui/format.js";
import { isAmacoError } from "../../../utils/errors.js";

export async function runProviderSetup(): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Amaco config found. Run ${color.bold("amaco init")} first.`,
    );
    return 1;
  }

  if (!isInteractiveTTY()) {
    console.error(
      `${symbol.fail()} ${color.bold("amaco provider setup")} needs an interactive terminal.`,
    );
    console.error(
      `  ${symbol.arrow()} Run it locally, or use ${color.bold("amaco config set providers.<id>.command <cmd>")} for non-interactive setup.`,
    );
    return 1;
  }

  console.log(header("Provider setup"));
  console.log("");

  const detections = await detectAllProviders();
  const ready = detections.filter((d) => d.confidence === "ready" && d.available);
  const claude = ready.find((d) => d.id === "claude");

  type Choice = "claude" | "custom";
  const choices: { name: string; value: Choice; description?: string }[] = [];
  if (claude) {
    choices.push({
      name: `Claude Code (detected: ${claude.command}${claude.version ? ` v${claude.version}` : ""})`,
      value: "claude",
    });
  }
  choices.push({ name: "Custom command", value: "custom" });

  const choice = await select<Choice>({
    message: "Which local coding CLI should Amaco use for its agents?",
    choices,
    default: claude ? "claude" : "custom",
  });

  try {
    if (choice === "claude" && claude) {
      await addProvider(detected.projectRoot, {
        id: "claude",
        config: buildClaudeProviderFromDetection(claude),
        alsoAssignAllAgents: false,
      });
      const setRes = await setDefaultProvider(detected.projectRoot, "claude");
      if (setRes.ok) {
        console.log(
          `${symbol.ok()} Claude Code is now configured for all default agents.`,
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
        alsoAssignAllAgents: true,
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
    console.log(`${symbol.arrow()} Next: ${color.bold("amaco doctor")}`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${
        isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
}
