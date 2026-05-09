import { ProviderError } from "../utils/errors.js";
import type { ProviderConfig, ProvidersConfigMap } from "./provider-schema.js";
import type { ProviderRunInput, ProviderRunResult } from "./provider-types.js";
import { runCliProvider } from "./cli-provider.js";
import {
  runClaudeCodeProvider,
  type ClaudeCodeProviderRunResult,
} from "./claude-code-provider.js";
import type { ClaudeCodeRunMetrics } from "./claude-code-output-parser.js";

export type RichProviderRunResult = ProviderRunResult & {
  claudeMetrics?: ClaudeCodeRunMetrics;
};

export function resolveProvider(
  providers: ProvidersConfigMap,
  providerId: string,
): ProviderConfig {
  const provider = providers[providerId];
  if (!provider) {
    throw new ProviderError(
      `Provider "${providerId}" is not configured in .amaco/project.yml. Run \`amaco provider setup\` to add one, or \`amaco provider list\` to see what is configured.`,
    );
  }
  return provider;
}

export async function runProvider(
  providers: ProvidersConfigMap,
  input: ProviderRunInput,
): Promise<RichProviderRunResult> {
  const provider = resolveProvider(providers, input.providerId);
  if (provider.type === "cli") {
    return runCliProvider(provider, input);
  }
  if (provider.type === "claude-code") {
    const result: ClaudeCodeProviderRunResult = await runClaudeCodeProvider(
      provider,
      input,
    );
    return result;
  }
  throw new ProviderError(
    `Unsupported provider type for "${input.providerId}".`,
  );
}
