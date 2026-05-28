import {
  confirm,
  select,
  input as askInput,
} from "@inquirer/prompts";
import {
  applySetup,
  planSetup,
  type SetupResult,
} from "../../setup/setup-service.js";
import {
  addProvider,
  setDefaultProvider,
  buildClaudeProviderFromDetection,
  buildCodexProviderFromDetection,
  buildOllamaProviderFromDetection,
} from "../../setup/provider-setup-service.js";
import { installHintForCommand } from "../../providers/provider-detection.js";
import {
  setConfigValue,
  setValidationCommands,
} from "../../setup/config-update-service.js";
import { color, header, indent, symbol } from "../ui/format.js";

export async function runInteractiveSetupWizard(args: {
  projectRoot: string;
  force?: boolean;
}): Promise<SetupResult> {
  const plan = await planSetup({ projectRoot: args.projectRoot });

  console.log(header("Vibestrate setup"));
  console.log("");
  console.log(
    `Project: ${color.bold(plan.project.name)} (${plan.project.projectType}, ${plan.project.packageManager})`,
  );
  console.log("");

  const claude = plan.detections.find((d) => d.id === "claude" && d.available);
  const codex = plan.detections.find((d) => d.id === "codex" && d.available);
  const ollama = plan.detections.find((d) => d.id === "ollama" && d.available);
  const ready = plan.detections.filter((d) => d.confidence === "ready" && d.available);
  const needsSetup = plan.detections.filter((d) => d.confidence === "detected-needs-setup");

  let providerChoice: "claude" | "codex" | "ollama" | "skip" | "custom" = "skip";
  if (ready.length === 0 && needsSetup.length === 0) {
    console.log(`${symbol.warn()} No local coding CLI was detected.`);
    const ollamaInstall = installHintForCommand("ollama");
    if (ollamaInstall) {
      console.log(indent(color.dim(ollamaInstall)));
    }
    providerChoice = await select({
      message: "How do you want to proceed?",
      choices: [
        { name: "Initialize anyway, set up provider later", value: "skip" as const },
        { name: "Configure a custom CLI now", value: "custom" as const },
      ],
      default: "skip" as const,
    });
  } else if (claude) {
    const useClaude = await confirm({
      message: `Use ${color.bold("Claude Code")} as the default provider for all agents?`,
      default: true,
    });
    providerChoice = useClaude ? "claude" : "custom";
  } else if (codex || ollama) {
    const choices: {
      name: string;
      value: "codex" | "ollama" | "custom" | "skip";
      description?: string;
    }[] = [];
    if (codex) {
      choices.push({
        name: `Codex CLI starter preset (${codex.command}${codex.version ? ` v${codex.version}` : ""})`,
        value: "codex",
        description:
          "Uses `codex exec`; run `vibe provider test codex` after setup.",
      });
    }
    if (ollama) {
      choices.push({
        name: `Ollama starter preset (${ollama.command}${ollama.version ? ` v${ollama.version}` : ""})`,
        value: "ollama",
        description:
          "Uses `ollama run qwen3.5`; pull that model first or edit project.yml.",
      });
    }
    choices.push(
      { name: "Configure a custom CLI now", value: "custom" },
      { name: "Initialize anyway, set up provider later", value: "skip" },
    );
    providerChoice = await select({
      message: "Detected local CLIs need confirmation. Which provider should Vibestrate use?",
      choices,
      default: codex ? "codex" : "ollama",
    });
  } else {
    const useCustom = await confirm({
      message: "No verified preset for the detected CLIs. Configure a custom CLI now?",
      default: false,
    });
    providerChoice = useCustom ? "custom" : "skip";
  }

  let chosenValidation: string[] = [];
  if (plan.validationCommands.length > 0) {
    const useDetected = await confirm({
      message: `Use detected validation commands (${plan.validationCommands.join(", ")})?`,
      default: true,
    });
    chosenValidation = useDetected ? plan.validationCommands : [];
  }

  // Apply scaffold first.
  const result = await applySetup({
    options: {
      projectRoot: args.projectRoot,
      force: args.force,
    },
  });

  if (providerChoice === "custom") {
    const id = await askInput({
      message: "Provider id (letters/digits/dash/underscore, must start with letter):",
      default: "myagent",
      validate: (v) =>
        /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v.trim())
          ? true
          : "Use letters/digits/dash/underscore; must start with a letter.",
    });
    const command = await askInput({
      message: "Command to invoke (must be on PATH or absolute):",
      validate: (v) => (v.trim().length > 0 ? true : "Required"),
    });
    const argsRaw = await askInput({
      message: 'Args (space-separated, e.g. "-p" or "--prompt"). Leave empty for none:',
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
    await addProvider(args.projectRoot, {
      id: id.trim(),
      config: { type: "cli", command: command.trim(), args: argList, input: inputMode },
      alsoAssignAllRoles: true,
    });
    console.log(`${symbol.ok()} Configured custom provider ${color.bold(id.trim())}.`);
  } else if (providerChoice === "claude" && claude) {
    await addProvider(args.projectRoot, {
      id: "claude",
      config: buildClaudeProviderFromDetection(claude),
      alsoAssignAllRoles: false,
    });
    const setRes = await setDefaultProvider(args.projectRoot, "claude");
    if (setRes.ok) {
      console.log(`${symbol.ok()} Claude Code configured for all default agents.`);
    } else {
      console.log(`${symbol.warn()} ${setRes.reason}`);
    }
  } else if (providerChoice === "codex" && codex) {
    await addProvider(args.projectRoot, {
      id: "codex",
      config: buildCodexProviderFromDetection(codex),
      alsoAssignAllRoles: false,
    });
    const setRes = await setDefaultProvider(args.projectRoot, "codex");
    if (setRes.ok) {
      console.log(`${symbol.ok()} Codex CLI configured with the starter preset.`);
      console.log(indent(`${symbol.arrow()} ${color.bold("vibe provider test codex")}`));
    } else {
      console.log(`${symbol.warn()} ${setRes.reason}`);
    }
  } else if (providerChoice === "ollama" && ollama) {
    await addProvider(args.projectRoot, {
      id: "ollama",
      config: buildOllamaProviderFromDetection(ollama),
      alsoAssignAllRoles: false,
    });
    const setRes = await setDefaultProvider(args.projectRoot, "ollama");
    if (setRes.ok) {
      console.log(`${symbol.ok()} Ollama configured with the starter preset.`);
      console.log(indent(`${symbol.arrow()} ${color.bold("ollama pull qwen3.5")}`));
      console.log(indent(`${symbol.arrow()} ${color.bold("vibe provider test ollama")}`));
    } else {
      console.log(`${symbol.warn()} ${setRes.reason}`);
    }
  }

  if (chosenValidation.length > 0) {
    await setValidationCommands(args.projectRoot, chosenValidation);
  }

  console.log("");
  console.log(header("Saved."));
  console.log(indent(`${symbol.arrow()} ${color.bold("vibe doctor")}`));
  console.log(indent(`${symbol.arrow()} ${color.bold('vibe run "your task"')}`));

  const finalPlan = await planSetup({ projectRoot: args.projectRoot });
  return { plan: finalPlan, init: result.init };
}

export async function runStandaloneSetupWizard(args: {
  projectRoot: string;
}): Promise<void> {
  console.log(header("Vibestrate setup"));
  console.log("");
  console.log(
    "This walks through provider, validation, and run defaults. Press Ctrl+C to cancel anytime.",
  );
  console.log("");

  const plan = await planSetup({ projectRoot: args.projectRoot });

  const claude = plan.detections.find((d) => d.id === "claude" && d.available);
  const codex = plan.detections.find((d) => d.id === "codex" && d.available);
  const ollama = plan.detections.find((d) => d.id === "ollama" && d.available);
  let providerChoice: "claude" | "codex" | "ollama" | "custom" | "skip" = "skip";
  if (claude) {
    const useClaude = await confirm({
      message: `Claude Code is on PATH (${claude.command}). Use it for all agents?`,
      default: true,
    });
    providerChoice = useClaude ? "claude" : "custom";
  } else {
    if (!codex && !ollama) {
      const ollamaInstall = installHintForCommand("ollama");
      if (ollamaInstall) {
        console.log(`${symbol.warn()} No local coding CLI was detected.`);
        console.log(indent(color.dim(ollamaInstall)));
        console.log("");
      }
    }
    const choices: {
      name: string;
      value: "codex" | "ollama" | "custom" | "skip";
      description?: string;
    }[] = [];
    if (codex) {
      choices.push({
        name: `Codex CLI starter preset (${codex.command}${codex.version ? ` v${codex.version}` : ""})`,
        value: "codex",
        description:
          "Uses `codex exec`; run `vibe provider test codex` after setup.",
      });
    }
    if (ollama) {
      choices.push({
        name: `Ollama starter preset (${ollama.command}${ollama.version ? ` v${ollama.version}` : ""})`,
        value: "ollama",
        description:
          "Uses `ollama run qwen3.5`; pull that model first or edit project.yml.",
      });
    }
    choices.push(
      { name: "Configure a custom CLI", value: "custom" },
      { name: "Skip — I'll do it later", value: "skip" },
    );
    providerChoice = await select({
      message: "No provider with a verified preset was detected. What now?",
      choices,
      default: codex ? "codex" : ollama ? "ollama" : "custom",
    });
  }

  if (providerChoice === "claude" && claude) {
    await addProvider(args.projectRoot, {
      id: "claude",
      config: buildClaudeProviderFromDetection(claude),
      alsoAssignAllRoles: true,
    });
    console.log(`${symbol.ok()} Claude Code configured for all default agents.`);
  } else if (providerChoice === "codex" && codex) {
    await addProvider(args.projectRoot, {
      id: "codex",
      config: buildCodexProviderFromDetection(codex),
      alsoAssignAllRoles: true,
    });
    console.log(`${symbol.ok()} Codex CLI configured with the starter preset.`);
    console.log(indent(`${symbol.arrow()} ${color.bold("vibe provider test codex")}`));
  } else if (providerChoice === "ollama" && ollama) {
    await addProvider(args.projectRoot, {
      id: "ollama",
      config: buildOllamaProviderFromDetection(ollama),
      alsoAssignAllRoles: true,
    });
    console.log(`${symbol.ok()} Ollama configured with the starter preset.`);
    console.log(indent(`${symbol.arrow()} ${color.bold("ollama pull qwen3.5")}`));
    console.log(indent(`${symbol.arrow()} ${color.bold("vibe provider test ollama")}`));
  } else if (providerChoice === "custom") {
    const id = await askInput({
      message: "Provider id:",
      default: "myagent",
      validate: (v) =>
        /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v.trim()) ? true : "Invalid id.",
    });
    const command = await askInput({
      message: "Command:",
      validate: (v) => (v.trim().length > 0 ? true : "Required"),
    });
    const argsRaw = await askInput({ message: "Args (space-separated):", default: "" });
    const inputMode = await select({
      message: "Input mode:",
      choices: [
        { name: "stdin", value: "stdin" as const },
        { name: "arg", value: "arg" as const },
      ],
      default: "stdin" as const,
    });
    const argList = argsRaw.trim().length > 0 ? argsRaw.trim().split(/\s+/) : [];
    await addProvider(args.projectRoot, {
      id: id.trim(),
      config: { type: "cli", command: command.trim(), args: argList, input: inputMode },
      alsoAssignAllRoles: true,
    });
    console.log(`${symbol.ok()} Custom provider ${color.bold(id.trim())} configured.`);
  }

  if (plan.validationCommands.length > 0) {
    const useDetected = await confirm({
      message: `Use detected validation commands (${plan.validationCommands.join(", ")})?`,
      default: true,
    });
    if (useDetected) {
      await setValidationCommands(args.projectRoot, plan.validationCommands);
      console.log(`${symbol.ok()} Validation commands saved.`);
    }
  }

  const adjustWorkflow = await confirm({
    message: "Adjust max review loops? (default 2)",
    default: false,
  });
  if (adjustWorkflow) {
    const raw = await askInput({
      message: "Max review loops (0–10):",
      default: "2",
      validate: (v) => (/^\d+$/.test(v.trim()) ? true : "Enter a non-negative integer."),
    });
    await setConfigValue(args.projectRoot, "workflow.maxReviewLoops", raw.trim());
  }

  console.log("");
  console.log(header("Done."));
  console.log(indent(`${symbol.arrow()} ${color.bold("vibe doctor")}`));
  console.log(indent(`${symbol.arrow()} ${color.bold('vibe run "your task"')}`));
}
