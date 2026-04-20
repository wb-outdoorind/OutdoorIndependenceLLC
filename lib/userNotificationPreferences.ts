export type UserNotificationPreferences = {
  maintenanceAssigned: boolean;
  maintenancePartsReady: boolean;
  maintenanceOverdue: boolean;
  toastAssigned: boolean;
  toastPartsReady: boolean;
  toastOverdue: boolean;
};

export const DEFAULT_USER_NOTIFICATION_PREFERENCES: UserNotificationPreferences = {
  maintenanceAssigned: true,
  maintenancePartsReady: true,
  maintenanceOverdue: true,
  toastAssigned: true,
  toastPartsReady: true,
  toastOverdue: true,
};

function enforceReceiveToastDependency(
  prefs: UserNotificationPreferences
): UserNotificationPreferences {
  return {
    ...prefs,
    toastAssigned: prefs.maintenanceAssigned ? prefs.toastAssigned : false,
    toastPartsReady: prefs.maintenancePartsReady ? prefs.toastPartsReady : false,
    toastOverdue: prefs.maintenanceOverdue ? prefs.toastOverdue : false,
  };
}

export type NotificationPreferenceDbRow = {
  maintenance_assigned: boolean | null;
  maintenance_parts_ready: boolean | null;
  maintenance_overdue: boolean | null;
  toast_assigned: boolean | null;
  toast_parts_ready: boolean | null;
  toast_overdue: boolean | null;
};

export function normalizeUserNotificationPreferences(
  row?: Partial<NotificationPreferenceDbRow> | null
): UserNotificationPreferences {
  return enforceReceiveToastDependency({
    maintenanceAssigned: row?.maintenance_assigned !== false,
    maintenancePartsReady: row?.maintenance_parts_ready !== false,
    maintenanceOverdue: row?.maintenance_overdue !== false,
    toastAssigned: row?.toast_assigned !== false,
    toastPartsReady: row?.toast_parts_ready !== false,
    toastOverdue: row?.toast_overdue !== false,
  });
}

export function toNotificationPreferenceDbRow(
  prefs: UserNotificationPreferences
): NotificationPreferenceDbRow {
  const safePrefs = enforceReceiveToastDependency(prefs);
  return {
    maintenance_assigned: safePrefs.maintenanceAssigned,
    maintenance_parts_ready: safePrefs.maintenancePartsReady,
    maintenance_overdue: safePrefs.maintenanceOverdue,
    toast_assigned: safePrefs.toastAssigned,
    toast_parts_ready: safePrefs.toastPartsReady,
    toast_overdue: safePrefs.toastOverdue,
  };
}

export function coerceUserNotificationPreferences(value: unknown): UserNotificationPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
  }
  const row = value as Record<string, unknown>;
  return enforceReceiveToastDependency({
    maintenanceAssigned:
      typeof row.maintenanceAssigned === "boolean"
        ? row.maintenanceAssigned
        : DEFAULT_USER_NOTIFICATION_PREFERENCES.maintenanceAssigned,
    maintenancePartsReady:
      typeof row.maintenancePartsReady === "boolean"
        ? row.maintenancePartsReady
        : DEFAULT_USER_NOTIFICATION_PREFERENCES.maintenancePartsReady,
    maintenanceOverdue:
      typeof row.maintenanceOverdue === "boolean"
        ? row.maintenanceOverdue
        : DEFAULT_USER_NOTIFICATION_PREFERENCES.maintenanceOverdue,
    toastAssigned:
      typeof row.toastAssigned === "boolean"
        ? row.toastAssigned
        : DEFAULT_USER_NOTIFICATION_PREFERENCES.toastAssigned,
    toastPartsReady:
      typeof row.toastPartsReady === "boolean"
        ? row.toastPartsReady
        : DEFAULT_USER_NOTIFICATION_PREFERENCES.toastPartsReady,
    toastOverdue:
      typeof row.toastOverdue === "boolean"
        ? row.toastOverdue
        : DEFAULT_USER_NOTIFICATION_PREFERENCES.toastOverdue,
  });
}

export function maintenanceNotificationEnabled(
  kind: string,
  prefs: UserNotificationPreferences
): boolean {
  if (kind === "maintenance_assigned") return prefs.maintenanceAssigned;
  if (kind === "maintenance_parts_ready") return prefs.maintenancePartsReady;
  if (kind === "maintenance_overdue") return prefs.maintenanceOverdue;
  return true;
}

export function maintenanceToastEnabled(kind: string, prefs: UserNotificationPreferences): boolean {
  if (kind === "maintenance_assigned") return prefs.toastAssigned;
  if (kind === "maintenance_parts_ready") return prefs.toastPartsReady;
  if (kind === "maintenance_overdue") return prefs.toastOverdue;
  return true;
}
