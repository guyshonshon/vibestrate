// `vibe provider test [id]`: really invokes a configured provider CLI once with
// a tiny prompt and checks stdout for the magic token, so a broken or logged-out
// setup surfaces here instead of mid-run. Because the invocation is real and can
// consume provider usage, the exact command is printed and confirmed first; the
// prompt is skipped with --yes or when stdin is not a TTY.
//
// The exit codes are the script-facing contract: 0 passed (also when the user
// declines the confirmation), 1 nothing could be tested (no config, unreadable
// or empty provider list, ambiguous or unknown id), 2 the test ran and failed,
// 3 the provider looks logged out.

import { detectProject } from "../../../project/project-detector.js";
import {
  listConfiguredProviders,
  runSafeProviderTest,
  SAFE_TEST_MAGIC,
} from "../../../setup/provider-setup-service.js";
import { configExists } from "../../../project/config-loader.js";
import { color, indent, symbol } from "../../ui/format.js";
import { isInteractiveTTY } from "../../ui/format.js";
import { confirm } from "@inquirer/prompts";
import { isVibestrateError } from "../../../utils/errors.js";

export async function runProviderTest(
  providerIdArg: string | undefined,
  opts: { yes?: boolean },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Vibestrate config found. Run ${color.bold("vibe init")} first.`,
    );
    return 1;
  }

  let providers;
  try {
    providers = await listConfiguredProviders(detected.projectRoot);
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    return 1;
  }

  if (providers.length === 0) {
    console.error(
      `${symbol.warn()} No providers configured. Run ${color.bold("vibe provider setup")}.`,
    );
    return 1;
  }

  const providerId =
    providerIdArg ??
    (providers.length === 1 ? providers[0]!.id : null);
  if (!providerId) {
    console.error(
      `${symbol.fail()} Multiple providers configured. Specify one: ${providers
        .map((p) => `\`vibe provider test ${p.id}\``)
        .join(" or ")}.`,
    );
    return 1;
  }

  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    console.error(
      `${symbol.fail()} Provider "${providerId}" is not configured. Available: ${providers
        .map((p) => p.id)
        .join(", ")}.`,
    );
    return 1;
  }

  // Confirmation: the test invokes the underlying CLI which may call a model.
  console.log(
    `${color.bold("About to invoke:")} ${provider.command}${
      provider.args.length > 0 ? ` ${provider.args.join(" ")}` : ""
    } (input via ${provider.input})`,
  );
  console.log(
    color.dim(
      "Vibestrate will send a tiny no-op prompt and look for the magic token in stdout. This may consume a small amount of usage from your CLI provider.",
    ),
  );

  if (!opts.yes && isInteractiveTTY()) {
    const ok = await confirm({
      message: "Proceed with the safe smoke test?",
      default: true,
    });
    if (!ok) {
      console.log("Cancelled.");
      return 0;
    }
  }

  const result = await runSafeProviderTest({
    projectRoot: detected.projectRoot,
    providerId,
  });

  if (result.ok) {
    console.log(
      `${symbol.ok()} ${color.bold(provider.id)} responded with the magic token (${SAFE_TEST_MAGIC}). Took ${result.durationMs}ms.`,
    );
    return 0;
  }

  if (result.needsLogin) {
    console.error(
      `${symbol.warn()} ${color.bold(provider.id)} looks like it isn't logged in.`,
    );
    if (result.loginCommand) {
      console.error(
        indent(
          `Run this ${color.bold("outside Vibestrate")}, then re-test:\n${indent(color.bold(result.loginCommand))}`,
        ),
      );
    }
    if (result.hint) console.error(indent(color.dim(result.hint)));
    return 3;
  }

  console.error(`${symbol.fail()} Provider test failed.`);
  console.error(indent(`Exit code: ${result.exitCode}`));
  console.error(indent(`Duration: ${result.durationMs}ms`));
  if (result.hint) console.error(indent(result.hint));
  if (result.stdout.trim().length > 0) {
    console.error(indent(color.dim("--- stdout ---")));
    console.error(indent(result.stdout.trim()));
  }
  if (result.stderr.trim().length > 0) {
    console.error(indent(color.dim("--- stderr ---")));
    console.error(indent(result.stderr.trim()));
  }
  return 2;
}
