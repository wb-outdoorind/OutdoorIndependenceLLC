import type { RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_USER_NOTIFICATION_PREFERENCES,
  coerceUserNotificationPreferences,
  maintenanceToastEnabled,
  type UserNotificationPreferences,
} from "@/lib/userNotificationPreferences";

export type NotificationSeverity = "info" | "warning" | "high" | "critical";

export type NotificationRealtimeRow = {
  id: number;
  recipient_id: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  kind: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
};

type SubscribeParams = {
  supabase: SupabaseClient;
  userId: string;
  onInsert?: (row: NotificationRealtimeRow) => void;
  onUpdate?: (row: NotificationRealtimeRow) => void;
  onDelete?: (id: number) => void;
};

const MAINTENANCE_TOAST_KINDS = new Set([
  "maintenance_assigned",
  "maintenance_parts_ready",
  "maintenance_overdue",
]);
const notificationPreferencesCache = new Map<string, UserNotificationPreferences>();
const notificationPreferencesInFlight = new Map<string, Promise<UserNotificationPreferences>>();

export const NOTIFICATION_PREFERENCES_UPDATED_EVENT = "oi:notification-preferences-updated";

const VALID_SEVERITIES: NotificationSeverity[] = ["info", "warning", "high", "critical"];

function coerceNotificationRow(value: unknown): NotificationRealtimeRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;

  const id = Number(row.id);
  const recipientId = typeof row.recipient_id === "string" ? row.recipient_id.trim() : "";
  const title = typeof row.title === "string" ? row.title : "";
  const body = typeof row.body === "string" ? row.body : "";
  const kind = typeof row.kind === "string" ? row.kind : "";
  const severityRaw = typeof row.severity === "string" ? row.severity : "";
  const severity = VALID_SEVERITIES.includes(severityRaw as NotificationSeverity)
    ? (severityRaw as NotificationSeverity)
    : "info";
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";

  if (!Number.isFinite(id) || !recipientId || !title || !kind || !createdAt) return null;

  return {
    id,
    recipient_id: recipientId,
    title,
    body,
    severity,
    kind,
    entity_type: typeof row.entity_type === "string" ? row.entity_type : null,
    entity_id: typeof row.entity_id === "string" ? row.entity_id : null,
    is_read: row.is_read === true,
    created_at: createdAt,
    read_at: typeof row.read_at === "string" ? row.read_at : null,
    acknowledged_at: typeof row.acknowledged_at === "string" ? row.acknowledged_at : null,
    resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
  };
}

function coerceIdFromDeletePayload(payload: RealtimePostgresChangesPayload<Record<string, unknown>>) {
  const oldValue = payload.old;
  if (!oldValue || typeof oldValue !== "object") return null;
  const id = Number((oldValue as Record<string, unknown>).id);
  return Number.isFinite(id) ? id : null;
}

export function subscribeToUserNotificationChanges({
  supabase,
  userId,
  onInsert,
  onUpdate,
  onDelete,
}: SubscribeParams) {
  const nonce = Math.random().toString(36).slice(2, 10);
  const channel = supabase.channel(`user-notifications:${userId}:${nonce}`);
  const filter = `recipient_id=eq.${userId}`;

  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "user_notifications", filter },
    (payload) => {
      const row = coerceNotificationRow(payload.new);
      if (!row) return;
      onInsert?.(row);
    }
  );
  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "user_notifications", filter },
    (payload) => {
      const row = coerceNotificationRow(payload.new);
      if (!row) return;
      onUpdate?.(row);
    }
  );
  channel.on(
    "postgres_changes",
    { event: "DELETE", schema: "public", table: "user_notifications", filter },
    (payload) => {
      const id = coerceIdFromDeletePayload(payload);
      if (!id) return;
      onDelete?.(id);
    }
  );
  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function isMaintenanceRealtimeToastKind(kind: string) {
  return MAINTENANCE_TOAST_KINDS.has(kind);
}

export function shouldShowMaintenanceToast(
  kind: string,
  prefs: UserNotificationPreferences
) {
  if (!isMaintenanceRealtimeToastKind(kind)) return false;
  return maintenanceToastEnabled(kind, prefs);
}

export function readCachedNotificationPreferences(userId: string | null) {
  if (!userId) return { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
  const cached = notificationPreferencesCache.get(userId);
  return cached ? { ...cached } : { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
}

export function cacheNotificationPreferences(userId: string | null, prefs: UserNotificationPreferences) {
  if (!userId) return;
  notificationPreferencesCache.set(userId, { ...prefs });
}

export async function loadNotificationPreferences(userId: string | null) {
  if (!userId) return { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
  const cached = notificationPreferencesCache.get(userId);
  if (cached) return { ...cached };
  const inFlight = notificationPreferencesInFlight.get(userId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "GET",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      const prefs = coerceUserNotificationPreferences(json?.prefs);
      notificationPreferencesCache.set(userId, prefs);
      return { ...prefs };
    } catch {
      return { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
    } finally {
      notificationPreferencesInFlight.delete(userId);
    }
  })();
  notificationPreferencesInFlight.set(userId, promise);
  return promise;
}

export function emitNotificationPreferencesUpdated(
  userId: string | null,
  prefs: UserNotificationPreferences
) {
  if (typeof window === "undefined" || !userId) return;
  cacheNotificationPreferences(userId, prefs);
  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_PREFERENCES_UPDATED_EVENT, {
      detail: { userId, prefs },
    })
  );
}

export function notificationActionHref(row: Pick<NotificationRealtimeRow, "kind" | "entity_id">) {
  if (!row.entity_id) return null;
  if (row.kind === "maintenance_parts_ready") {
    return `/maintenance/my-work?requestId=${encodeURIComponent(row.entity_id)}`;
  }
  return `/maintenance?requestId=${encodeURIComponent(row.entity_id)}`;
}

export function notificationActionLabel(row: Pick<NotificationRealtimeRow, "kind">) {
  if (row.kind === "maintenance_assigned") return "Open Task";
  if (row.kind === "maintenance_parts_ready") return "Start Work";
  if (row.kind === "maintenance_overdue") return "View Task";
  return "View Details";
}
