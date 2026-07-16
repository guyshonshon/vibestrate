// Notification feed, settings, and gateway tests.
import { jsonGet, jsonPost, jsonPatch } from "./http.js";
import type {
  GatewayView,
  NotificationRecord,
  NotificationSettings,
} from "../types.js";

export const notificationsApi = {
  async listNotifications(): Promise<{
    notifications: NotificationRecord[];
    unread: number;
  }> {
    return jsonGet("/api/notifications");
  },
  async markNotificationRead(id: string): Promise<NotificationRecord> {
    const r = await jsonPost<{ notification: NotificationRecord }>(
      `/api/notifications/${encodeURIComponent(id)}/read`,
    );
    return r.notification;
  },
  async resolveNotification(id: string): Promise<NotificationRecord> {
    const r = await jsonPost<{ notification: NotificationRecord }>(
      `/api/notifications/${encodeURIComponent(id)}/resolve`,
    );
    return r.notification;
  },
  async markAllNotificationsRead(): Promise<{ read: number }> {
    return jsonPost("/api/notifications/read-all");
  },
  async getNotificationSettings(): Promise<{
    settings: NotificationSettings;
    gateways: GatewayView[];
  }> {
    return jsonGet("/api/notifications/settings");
  },
  async patchNotificationSettings(
    patch: Partial<NotificationSettings>,
  ): Promise<{ settings: NotificationSettings }> {
    return jsonPatch("/api/notifications/settings", patch);
  },
  async testGateway(id: string): Promise<{ ok: boolean; message: string }> {
    return jsonPost(`/api/gateways/${encodeURIComponent(id)}/test`);
  },
};
