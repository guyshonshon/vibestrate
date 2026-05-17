import { useEffect, useRef, useState, useCallback } from "react";
import { NotificationService } from "../../../notifications/notification-service.js";
import { NotificationStore } from "../../../notifications/notification-store.js";
import type {
  Notification,
  GatewaysFile,
} from "../../../notifications/notification-types.js";

export function useNotifications(projectRoot: string, refreshMs = 3000) {
  const [items, setItems] = useState<Notification[]>([]);
  const [gateways, setGateways] = useState<GatewaysFile>({ gateways: {} });
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const svc = new NotificationService(projectRoot);
      const store = new NotificationStore(projectRoot);
      const [list, gw] = await Promise.all([
        svc.list().catch(() => []),
        store.readGateways().catch(() => ({ gateways: {} })),
      ]);
      if (!mounted.current) return;
      setItems(list);
      setGateways(gw);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectRoot]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), refreshMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh, refreshMs]);

  return { items, gateways, error, refresh };
}
