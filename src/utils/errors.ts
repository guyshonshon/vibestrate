export class VibestrateError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = "VibestrateError";
    this.code = code;
    this.cause = cause;
  }
}

export class ConfigError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("CONFIG_ERROR", message, cause);
    this.name = "ConfigError";
  }
}

export class PolicyError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("POLICY_ERROR", message, cause);
    this.name = "PolicyError";
  }
}

export class StateTransitionError extends VibestrateError {
  constructor(message: string) {
    super("STATE_TRANSITION_ERROR", message);
    this.name = "StateTransitionError";
  }
}

export class ProviderError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("PROVIDER_ERROR", message, cause);
    this.name = "ProviderError";
  }
}

export class GitError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("GIT_ERROR", message, cause);
    this.name = "GitError";
  }
}

export function isVibestrateError(error: unknown): error is VibestrateError {
  return error instanceof VibestrateError;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
