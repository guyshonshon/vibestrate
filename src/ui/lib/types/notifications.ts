// ─── notifications ────────────────────────────────────────────────────────────

export type NotificationSeverity =
  | "info"
  | "success"
  | "warning"
  | "attention"
  | "critical";

export type NotificationCategory =
  | "run"
  | "approval"
  | "task"
  | "scheduler"
  | "conflict"
  | "validation"
  | "review"
  | "system"
  | "gateway";

export type NotificationRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  title: string;
  message: string;
  runId: string | null;
  taskId: string | null;
  roadmapItemId: string | null;
  approvalId: string | null;
  eventId: string | null;
  sourceEventType: string | null;
  actionRequired: boolean;
  actionLabel: string | null;
  actionUrl: string | null;
  readAt: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
};

export type NotificationSettings = {
  enabled: boolean;
  cli: { enabled: boolean };
  inApp: { enabled: boolean };
  browser: { enabled: boolean };
  desktop: { enabled: boolean };
  defaultMinSeverity: NotificationSeverity;
  enabledCategories: NotificationCategory[];
  quietCategories: NotificationCategory[];
  notifyOnApprovalRequested: boolean;
  notifyOnRunCompleted: boolean;
  notifyOnRunBlocked: boolean;
  notifyOnRunFailed: boolean;
  notifyOnValidationFailed: boolean;
  notifyOnSchedulerConflict: boolean;
  notifyOnTaskBlocked: boolean;
};

export type GatewayConfigView = {
  enabled: boolean;
  minSeverity: NotificationSeverity;
  categories: NotificationCategory[];
  url:
    | { kind: "env-ref"; envVar: string; envVarSet: boolean }
    | { kind: "literal"; hasValue: boolean }
    | null;
  token:
    | { kind: "env-ref"; envVar: string; envVarSet: boolean }
    | { kind: "literal"; hasValue: boolean }
    | null;
  target:
    | { kind: "env-ref"; envVar: string; envVarSet: boolean }
    | { kind: "literal"; hasValue: boolean }
    | null;
};

export type GatewayView = {
  id: string;
  type: string;
  channel: string;
  displayName: string;
  supportsTest: boolean;
  config: GatewayConfigView;
  valid: boolean;
  validationReason?: string | null;
  envVarsReferenced?: string[];
  missingEnvVars: string[];
};
