import type {
  Category,
  Notification,
  NotificationsConfig,
  Severity,
} from "./notification-types.js";

const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  success: 1,
  warning: 2,
  attention: 3,
  critical: 4,
};

export function meetsSeverity(
  candidate: Severity,
  threshold: Severity,
): boolean {
  return SEVERITY_ORDER[candidate] >= SEVERITY_ORDER[threshold];
}

export function shouldEmit(
  notification: Notification,
  config: NotificationsConfig,
): boolean {
  if (!config.enabled) return false;
  if (!config.enabledCategories.includes(notification.category)) return false;
  if (config.quietCategories.includes(notification.category)) return false;
  if (!meetsSeverity(notification.severity, config.defaultMinSeverity)) {
    return false;
  }
  switch (notification.sourceEventType) {
    case "approval.requested":
      if (!config.notifyOnApprovalRequested) return false;
      break;
    case "run.completed.merge_ready":
      if (!config.notifyOnRunCompleted) return false;
      break;
    case "run.completed.blocked":
      if (!config.notifyOnRunBlocked) return false;
      break;
    case "run.failed":
      if (!config.notifyOnRunFailed) return false;
      break;
    case "validation.failed":
      if (!config.notifyOnValidationFailed) return false;
      break;
    case "scheduler.conflict":
      if (!config.notifyOnSchedulerConflict) return false;
      break;
    case "task.blocked.dependency":
    case "task.blocked.conflict":
      if (!config.notifyOnTaskBlocked) return false;
      break;
    default:
      break;
  }
  return true;
}

/**
 * Severity for an external gateway. A gateway may have its own minSeverity
 * threshold and category allow-list; this helper centralises the check so the
 * gateway implementations stay thin.
 */
export function gatewayWillRelay(input: {
  notification: Notification;
  gatewayMinSeverity: Severity;
  gatewayCategories: readonly Category[];
}): boolean {
  if (!meetsSeverity(input.notification.severity, input.gatewayMinSeverity)) {
    return false;
  }
  if (
    input.gatewayCategories.length > 0 &&
    !input.gatewayCategories.includes(input.notification.category)
  ) {
    return false;
  }
  return true;
}
