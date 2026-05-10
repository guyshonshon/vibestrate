import type {
  Channel,
  DeliveryReceipt,
  GatewayConfig,
  Notification,
  NotificationsConfig,
} from "../notification-types.js";

/** Result of validating a gateway config (without performing any I/O). */
export type ValidateConfigResult = {
  ok: boolean;
  /** Reason when invalid; safe to display in the UI (no secrets). */
  reason?: string;
  /** Names of env vars referenced by `env:VAR` syntax. */
  envVarsReferenced: string[];
  /** Env vars referenced but missing from the current process. */
  missingEnvVars: string[];
};

export type DeliverInput = {
  notification: Notification;
  config: GatewayConfig;
  settings: NotificationsConfig;
};

export type TestInput = {
  config: GatewayConfig;
};

export type TestResult = {
  ok: boolean;
  /** Safe-to-display message (no secrets). */
  message: string;
  externalMessageId?: string | null;
};

export interface Gateway {
  /** Stable id (also the key in gateways.json). */
  id: string;
  type: string;
  channel: Channel;
  displayName: string;
  /** Whether `test()` is implemented for this gateway. */
  supportsTest: boolean;
  /**
   * Validate gateway config WITHOUT performing I/O. Returns referenced env
   * var names so the UI/doctor can warn about missing values.
   */
  validateConfig(config: GatewayConfig): ValidateConfigResult;
  /**
   * Deliver a single notification. Implementations must be defensive: any
   * error is captured into the returned receipt and never thrown. Hard
   * timeouts apply to all network gateways. Tokens / URLs must never appear
   * in the receipt's errorMessage.
   */
  deliver(input: DeliverInput): Promise<DeliveryReceipt>;
  /**
   * Optional. Send a tiny test message; same defensive contract as deliver.
   */
  test?(input: TestInput): Promise<TestResult>;
}

export const DEFAULT_TIMEOUT_MS = 5_000;
