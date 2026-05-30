import type { ProviderConfig, ProvidersConfigMap } from "./provider-schema.js";
import { resolveProvider } from "./provider-runner.js";
import type { ProviderCapabilities } from "./provider-types.js";

export function providerCapabilitiesForConfig(
  config: ProviderConfig,
): ProviderCapabilities {
  if (config.type === "claude-code") {
    return {
      providerType: config.type,
      sessionReuse: "resume",
      interactiveSessions: false,
      reportsSessionId: true,
      reportsTokenUsage: true,
    };
  }

  if (config.type === "http-api" || config.type === "localhost-proxy") {
    // One-shot HTTP turn (no session reuse), but the response carries real
    // token usage that the runner maps into NormalizedMetrics.
    return {
      providerType: config.type,
      sessionReuse: "none",
      interactiveSessions: false,
      reportsSessionId: false,
      reportsTokenUsage: true,
    };
  }

  return {
    providerType: config.type,
    sessionReuse: "none",
    interactiveSessions: false,
    reportsSessionId: false,
    reportsTokenUsage: false,
  };
}

export function providerCapabilities(
  providers: ProvidersConfigMap,
  providerId: string,
): ProviderCapabilities {
  return providerCapabilitiesForConfig(resolveProvider(providers, providerId));
}
