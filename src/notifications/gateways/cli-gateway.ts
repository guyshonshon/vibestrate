import type {
  DeliverInput,
  Gateway,
  ValidateConfigResult,
} from "./gateway-types.js";
import { makeReceipt } from "../delivery-receipts.js";

/**
 * CLI gateway: writes a one-line summary to stdout when an Vibestrate process is
 * actively attached (e.g. `vibestrate run`). The actual stdout is whatever logger
 * the embedding caller installs via `setCliWriter`. By default it's a no-op
 * so importing this module from a server context never spams the terminal.
 */

let cliWriter: ((line: string) => void) | null = null;

export function setCliWriter(writer: ((line: string) => void) | null): void {
  cliWriter = writer;
}

export const cliGateway: Gateway = {
  id: "cli",
  type: "cli",
  channel: "cli",
  displayName: "Terminal",
  supportsTest: true,
  validateConfig(): ValidateConfigResult {
    // CLI gateway needs no config beyond `enabled`.
    return { ok: true, envVarsReferenced: [], missingEnvVars: [] };
  },
  async deliver(input: DeliverInput) {
    const { notification, config } = input;
    if (!config.enabled || !cliWriter) {
      return makeReceipt({
        notification,
        gatewayId: this.id,
        channel: this.channel,
        status: "skipped",
        errorMessage: !cliWriter
          ? "no CLI writer attached (server context)"
          : "gateway disabled",
      });
    }
    const sym = severitySymbol(notification.severity);
    cliWriter(`${sym} [${notification.category}] ${notification.title}`);
    if (notification.message) cliWriter(`    ${notification.message}`);
    if (notification.actionLabel && notification.actionUrl) {
      cliWriter(`    → ${notification.actionLabel}: ${notification.actionUrl}`);
    }
    return makeReceipt({
      notification,
      gatewayId: this.id,
      channel: this.channel,
      status: "delivered",
    });
  },
  async test() {
    if (!cliWriter) {
      return {
        ok: false,
        message: "No CLI writer attached. Run a foreground command to test the CLI gateway.",
      };
    }
    cliWriter("[notifications:test] CLI gateway is reachable.");
    return { ok: true, message: "Printed test line to CLI." };
  },
};

function severitySymbol(severity: string): string {
  switch (severity) {
    case "success":
      return "✓";
    case "warning":
      return "!";
    case "attention":
      return "→";
    case "critical":
      return "✗";
    default:
      return "·";
  }
}
