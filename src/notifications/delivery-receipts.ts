import { randomUUID } from "node:crypto";
import { nowIso } from "../utils/time.js";
import type {
  Channel,
  DeliveryReceipt,
  DeliveryStatus,
  Notification,
} from "./notification-types.js";

export function makeReceipt(input: {
  notification: Notification;
  gatewayId: string;
  channel: Channel;
  status: DeliveryStatus;
  errorMessage?: string | null;
  externalMessageId?: string | null;
  retryCount?: number;
}): DeliveryReceipt {
  const ts = nowIso();
  return {
    id: randomUUID(),
    notificationId: input.notification.id,
    gatewayId: input.gatewayId,
    channel: input.channel,
    status: input.status,
    attemptedAt: ts,
    deliveredAt: input.status === "delivered" ? ts : null,
    failedAt: input.status === "failed" ? ts : null,
    errorMessage: input.errorMessage ?? null,
    externalMessageId: input.externalMessageId ?? null,
    retryCount: input.retryCount ?? 0,
  };
}
