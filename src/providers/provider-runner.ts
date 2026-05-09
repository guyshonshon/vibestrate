import { ProviderError } from "../utils/errors.js";
import type { ProviderConfig, ProvidersConfigMap } from "./provider-schema.js";
import type { ProviderRunInput, ProviderRunResult } from "./provider-types.js";
import { runCliProvider } from "./cli-provider.js";

export function resolveProvider(
  providers: ProvidersConfigMap,
  providerId: string,
): ProviderConfig {
  const provider = providers[providerId];
  if (!provider) {
    throw new ProviderError(`Provider "${providerId}" not configured.`);
  }
  return provider;
}

export async function runProvider(
  providers: ProvidersConfigMap,
  input: ProviderRunInput,
): Promise<ProviderRunResult> {
  const provider = resolveProvider(providers, input.providerId);
  if (provider.type === "cli") {
    return runCliProvider(provider, input);
  }
  throw new ProviderError(`Unsupported provider type for "${input.providerId}".`);
}
