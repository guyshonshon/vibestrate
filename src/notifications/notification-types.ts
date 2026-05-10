import { z } from "zod";

export const severitySchema = z.enum([
  "info",
  "success",
  "warning",
  "attention",
  "critical",
]);
export type Severity = z.infer<typeof severitySchema>;

export const categorySchema = z.enum([
  "run",
  "approval",
  "task",
  "scheduler",
  "conflict",
  "validation",
  "review",
  "system",
  "gateway",
]);
export type Category = z.infer<typeof categorySchema>;

export const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
export const safeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(SAFE_ID_RE, "Notification ids must be path-safe.")
  .refine((v) => !v.includes(".."), "ids cannot contain ..");

/**
 * Allowed JSON-safe metadata. Notifications must never embed secrets, tokens,
 * full diffs, or .env values. The store rejects unknown fields and very long
 * strings to keep messages local-friendly and human-readable.
 */
export const metadataValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(2048),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(metadataValueSchema),
    z.record(z.string(), metadataValueSchema),
  ]),
);

export const notificationSchema = z.object({
  id: safeIdSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  severity: severitySchema,
  category: categorySchema,
  title: z.string().min(1).max(160),
  message: z.string().max(2000).default(""),
  runId: z.string().nullable().default(null),
  taskId: z.string().nullable().default(null),
  roadmapItemId: z.string().nullable().default(null),
  approvalId: z.string().nullable().default(null),
  eventId: z.string().nullable().default(null),
  sourceEventType: z.string().nullable().default(null),
  actionRequired: z.boolean().default(false),
  actionLabel: z.string().nullable().default(null),
  /** Hash-route only; never an external URL. */
  actionUrl: z.string().nullable().default(null),
  readAt: z.string().nullable().default(null),
  resolvedAt: z.string().nullable().default(null),
  metadata: z.record(z.string(), metadataValueSchema).default({}),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationsFileSchema = z.object({
  notifications: z.array(notificationSchema).default([]),
});
export type NotificationsFile = z.infer<typeof notificationsFileSchema>;

export const channelSchema = z.enum([
  "in-app",
  "cli",
  "browser",
  "desktop",
  "webhook",
  "discord",
  "slack",
  "telegram",
  "whatsapp",
]);
export type Channel = z.infer<typeof channelSchema>;

export const deliveryStatusSchema = z.enum([
  "pending",
  "delivered",
  "failed",
  "skipped",
]);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const deliveryReceiptSchema = z.object({
  id: z.string().min(1),
  notificationId: safeIdSchema,
  gatewayId: z.string().min(1),
  channel: channelSchema,
  status: deliveryStatusSchema,
  attemptedAt: z.string(),
  deliveredAt: z.string().nullable().default(null),
  failedAt: z.string().nullable().default(null),
  errorMessage: z.string().max(500).nullable().default(null),
  externalMessageId: z.string().max(200).nullable().default(null),
  retryCount: z.number().int().min(0).default(0),
});
export type DeliveryReceipt = z.infer<typeof deliveryReceiptSchema>;

export const receiptsFileSchema = z.object({
  receipts: z.array(deliveryReceiptSchema).default([]),
});
export type ReceiptsFile = z.infer<typeof receiptsFileSchema>;

// ─── notification rules / settings ────────────────────────────────────────────

const channelToggleSchema = z.object({
  enabled: z.boolean().default(false),
});

export const gatewayConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * For external HTTP gateways. May be a literal URL OR an env-var reference
   * of the form `env:VAR_NAME`. Treat the value as a secret when it starts
   * with `env:`; the resolver fetches `process.env.VAR_NAME` at delivery
   * time and never logs the resolved value.
   */
  url: z.string().nullable().default(null),
  /**
   * For bot-style gateways (e.g. Telegram). May be `env:VAR_NAME`.
   */
  token: z.string().nullable().default(null),
  /**
   * Optional channel/chat target (e.g. Telegram chat id, Slack channel,
   * Discord channel name). `env:` references work here too.
   */
  target: z.string().nullable().default(null),
  /** Optional minimum severity to relay through this gateway. */
  minSeverity: severitySchema.default("attention"),
  /** Optional category allow-list. Empty = all. */
  categories: z.array(categorySchema).default([]),
});
export type GatewayConfig = z.infer<typeof gatewayConfigSchema>;

export const gatewaysFileSchema = z.object({
  gateways: z
    .record(z.string(), gatewayConfigSchema)
    .default({}),
});
export type GatewaysFile = z.infer<typeof gatewaysFileSchema>;

export const notificationsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  cli: channelToggleSchema.default({ enabled: true }),
  inApp: channelToggleSchema.default({ enabled: true }),
  browser: channelToggleSchema.default({ enabled: true }),
  desktop: channelToggleSchema.default({ enabled: false }),
  defaultMinSeverity: severitySchema.default("info"),
  enabledCategories: z.array(categorySchema).default([
    "run",
    "approval",
    "task",
    "scheduler",
    "conflict",
    "validation",
    "review",
    "system",
    "gateway",
  ]),
  quietCategories: z.array(categorySchema).default([]),
  notifyOnApprovalRequested: z.boolean().default(true),
  notifyOnRunCompleted: z.boolean().default(true),
  notifyOnRunBlocked: z.boolean().default(true),
  notifyOnRunFailed: z.boolean().default(true),
  notifyOnValidationFailed: z.boolean().default(true),
  notifyOnSchedulerConflict: z.boolean().default(true),
  notifyOnTaskBlocked: z.boolean().default(true),
});
export type NotificationsConfig = z.infer<typeof notificationsConfigSchema>;
