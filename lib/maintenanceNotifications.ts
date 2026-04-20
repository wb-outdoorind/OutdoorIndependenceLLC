import {
  coerceMaintenanceRequestStatus,
  isMaintenanceClosedStatus,
  type MaintenanceRequestStatus,
} from "@/lib/maintenanceStatus";
import { isPurchaseCompletedForMaintenance } from "@/lib/purchases";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_USER_NOTIFICATION_PREFERENCES,
  maintenanceNotificationEnabled,
  normalizeUserNotificationPreferences,
  type UserNotificationPreferences,
} from "@/lib/userNotificationPreferences";

type AdminClient = ReturnType<typeof createSupabaseAdmin>;
type AssetType = "vehicle" | "equipment";
type RequestTable = "maintenance_requests" | "equipment_maintenance_requests";
type LogTable = "maintenance_logs" | "equipment_maintenance_logs";
type LogLinkTable = "maintenance_log_request_links" | "equipment_maintenance_log_request_links";

type MaintenanceRef = {
  assetType: AssetType;
  requestId: string;
};

type MaintenanceContext = {
  assetType: AssetType;
  id: string;
  assetId: string;
  assetName: string;
  title: string;
  status: MaintenanceRequestStatus;
  assignedTo: string | null;
  scheduledDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type NotificationInsertRow = {
  recipient_id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "high" | "critical";
  kind: string;
  entity_type: string;
  entity_id: string;
  dedupe_key: string;
};

type NotificationPreferenceRow = {
  maintenance_assigned: boolean | null;
  maintenance_parts_ready: boolean | null;
  maintenance_overdue: boolean | null;
  toast_assigned: boolean | null;
  toast_parts_ready: boolean | null;
  toast_overdue: boolean | null;
};

const PREFERENCE_GATED_KINDS = new Set([
  "maintenance_assigned",
  "maintenance_parts_ready",
  "maintenance_overdue",
]);

export type CompletedPurchaseLinkRow = {
  id: string;
  overall_status: string | null;
  maintenance_request_type: AssetType | null;
  maintenance_request_id: string | null;
  maintenance_log_type: AssetType | null;
  maintenance_log_id: string | null;
};

function requestRefKey(assetType: AssetType, requestId: string) {
  return `${assetType}:${requestId}`;
}

function todayKeyLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeId(value: string | null | undefined) {
  return (value ?? "").trim();
}

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "42501") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("permission denied");
}

function parseRequestTitle(description: string | null | undefined, fallback = "Maintenance Request") {
  const raw = typeof description === "string" ? description : "";
  if (!raw.trim()) return fallback;
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return fallback;
  if (firstLine.toLowerCase().startsWith("title:")) {
    const parsed = firstLine.slice("title:".length).trim();
    return parsed || fallback;
  }
  return firstLine;
}

function refsByAssetType(refs: MaintenanceRef[]) {
  const vehicleIds: string[] = [];
  const equipmentIds: string[] = [];
  for (const ref of refs) {
    if (ref.assetType === "vehicle") vehicleIds.push(ref.requestId);
    if (ref.assetType === "equipment") equipmentIds.push(ref.requestId);
  }
  return {
    vehicleIds: Array.from(new Set(vehicleIds)),
    equipmentIds: Array.from(new Set(equipmentIds)),
  };
}

function uniqueRefs(refs: MaintenanceRef[]) {
  const seen = new Set<string>();
  const out: MaintenanceRef[] = [];
  for (const ref of refs) {
    const requestId = normalizeId(ref.requestId);
    if (!requestId) continue;
    const key = requestRefKey(ref.assetType, requestId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ assetType: ref.assetType, requestId });
  }
  return out;
}

async function upsertNotifications(admin: AdminClient, rows: NotificationInsertRow[]) {
  if (!rows.length) return 0;
  const filteredRows = await filterRowsByNotificationPreferences(admin, rows);
  if (!filteredRows.length) return 0;
  const { error } = await admin.from("user_notifications").upsert(filteredRows, {
    onConflict: "recipient_id,dedupe_key",
  });
  if (error) {
    console.error("Failed to upsert maintenance notifications:", error);
    return 0;
  }
  return filteredRows.length;
}

export async function getUserNotificationPreferences(
  admin: AdminClient,
  userId: string
): Promise<UserNotificationPreferences> {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    return { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
  }
  const { data, error } = await admin
    .from("user_notification_preferences")
    .select(
      "maintenance_assigned,maintenance_parts_ready,maintenance_overdue,toast_assigned,toast_parts_ready,toast_overdue"
    )
    .eq("user_id", normalizedUserId)
    .maybeSingle();

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error("Failed to read user notification preferences:", error);
    }
    return { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
  }

  return normalizeUserNotificationPreferences((data ?? null) as NotificationPreferenceRow | null);
}

async function filterRowsByNotificationPreferences(
  admin: AdminClient,
  rows: NotificationInsertRow[]
) {
  const cache = new Map<string, UserNotificationPreferences>();
  const nextRows: NotificationInsertRow[] = [];

  for (const row of rows) {
    if (!row.recipient_id || !PREFERENCE_GATED_KINDS.has(row.kind)) {
      nextRows.push(row);
      continue;
    }
    const recipientId = normalizeId(row.recipient_id);
    if (!recipientId) continue;
    let prefs = cache.get(recipientId);
    if (!prefs) {
      prefs = await getUserNotificationPreferences(admin, recipientId);
      cache.set(recipientId, prefs);
    }
    if (!maintenanceNotificationEnabled(row.kind, prefs)) continue;
    nextRows.push(row);
  }

  return nextRows;
}

async function loadMaintenanceContexts(admin: AdminClient, refs: MaintenanceRef[]) {
  const unique = uniqueRefs(refs);
  const out = new Map<string, MaintenanceContext>();
  if (!unique.length) return out;

  const { vehicleIds, equipmentIds } = refsByAssetType(unique);
  const [vehicleReqRes, equipmentReqRes] = await Promise.all([
    vehicleIds.length
      ? admin
          .from("maintenance_requests")
          .select("id,vehicle_id,description,status,assigned_to,scheduled_date,created_at,updated_at")
          .in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
    equipmentIds.length
      ? admin
          .from("equipment_maintenance_requests")
          .select("id,equipment_id,description,status,assigned_to,scheduled_date,created_at,updated_at")
          .in("id", equipmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (vehicleReqRes.error) throw new Error(vehicleReqRes.error.message);
  if (equipmentReqRes.error) throw new Error(equipmentReqRes.error.message);

  const vehicleRows = (vehicleReqRes.data ?? []) as Array<{
    id: string;
    vehicle_id: string;
    description: string | null;
    status: string | null;
    assigned_to: string | null;
    scheduled_date: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
  const equipmentRows = (equipmentReqRes.data ?? []) as Array<{
    id: string;
    equipment_id: string;
    description: string | null;
    status: string | null;
    assigned_to: string | null;
    scheduled_date: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;

  const vehicleAssetIds = Array.from(new Set(vehicleRows.map((row) => row.vehicle_id)));
  const equipmentAssetIds = Array.from(new Set(equipmentRows.map((row) => row.equipment_id)));

  const [vehicleAssetsRes, equipmentAssetsRes] = await Promise.all([
    vehicleAssetIds.length
      ? admin.from("vehicles").select("id,name").in("id", vehicleAssetIds)
      : Promise.resolve({ data: [], error: null }),
    equipmentAssetIds.length
      ? admin.from("equipment").select("id,name").in("id", equipmentAssetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (vehicleAssetsRes.error) throw new Error(vehicleAssetsRes.error.message);
  if (equipmentAssetsRes.error) throw new Error(equipmentAssetsRes.error.message);

  const vehicleAssetNameById = new Map(
    ((vehicleAssetsRes.data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
      row.id,
      normalizeId(row.name) || row.id,
    ])
  );
  const equipmentAssetNameById = new Map(
    ((equipmentAssetsRes.data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
      row.id,
      normalizeId(row.name) || row.id,
    ])
  );

  for (const row of vehicleRows) {
    out.set(requestRefKey("vehicle", row.id), {
      assetType: "vehicle",
      id: row.id,
      assetId: row.vehicle_id,
      assetName: vehicleAssetNameById.get(row.vehicle_id) ?? row.vehicle_id,
      title: parseRequestTitle(row.description),
      status: coerceMaintenanceRequestStatus(row.status, "Open"),
      assignedTo: normalizeId(row.assigned_to) || null,
      scheduledDate: normalizeId(row.scheduled_date) || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  for (const row of equipmentRows) {
    out.set(requestRefKey("equipment", row.id), {
      assetType: "equipment",
      id: row.id,
      assetId: row.equipment_id,
      assetName: equipmentAssetNameById.get(row.equipment_id) ?? row.equipment_id,
      title: parseRequestTitle(row.description),
      status: coerceMaintenanceRequestStatus(row.status, "Open"),
      assignedTo: normalizeId(row.assigned_to) || null,
      scheduledDate: normalizeId(row.scheduled_date) || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  return out;
}

function isOverdueContext(context: MaintenanceContext) {
  if (!context.scheduledDate) return false;
  if (isMaintenanceClosedStatus(context.status)) return false;
  return context.scheduledDate < todayKeyLocal();
}

export async function notifyMaintenanceAssignment(params: {
  admin: AdminClient;
  assetType: AssetType;
  requestId: string;
  previousAssigneeId: string | null;
  nextAssigneeId: string | null;
}) {
  const previousAssigneeId = normalizeId(params.previousAssigneeId) || null;
  const nextAssigneeId = normalizeId(params.nextAssigneeId) || null;
  const requestId = normalizeId(params.requestId);

  if (!requestId || !nextAssigneeId || previousAssigneeId === nextAssigneeId) {
    return { created: 0 };
  }

  const contexts = await loadMaintenanceContexts(params.admin, [
    { assetType: params.assetType, requestId },
  ]);
  const context = contexts.get(requestRefKey(params.assetType, requestId));
  if (!context) return { created: 0 };

  const timestampSource = context.updatedAt || context.createdAt || new Date().toISOString();
  const dedupeStamp = timestampSource.slice(0, 19);
  const rows: NotificationInsertRow[] = [
    {
      recipient_id: nextAssigneeId,
      title: "New maintenance task assigned",
      body: `${context.title} • ${context.assetName}${context.scheduledDate ? ` • Scheduled ${context.scheduledDate}` : ""}`,
      severity: "info",
      kind: "maintenance_assigned",
      entity_type: "maintenance_request",
      entity_id: context.id,
      dedupe_key: `maintenance:assigned:${context.assetType}:${context.id}:${nextAssigneeId}:${dedupeStamp}`,
    },
  ];

  const created = await upsertNotifications(params.admin, rows);
  return { created };
}

export async function notifyMaintenanceOverdueForRefs(params: {
  admin: AdminClient;
  refs: MaintenanceRef[];
}) {
  const refs = uniqueRefs(params.refs);
  if (!refs.length) return { created: 0 };

  const contexts = await loadMaintenanceContexts(params.admin, refs);
  const rows: NotificationInsertRow[] = [];

  for (const ref of refs) {
    const context = contexts.get(requestRefKey(ref.assetType, ref.requestId));
    if (!context || !context.assignedTo || !isOverdueContext(context)) continue;
    rows.push({
      recipient_id: context.assignedTo,
      title: "Maintenance task is overdue",
      body: `${context.title} • ${context.assetName} • Scheduled ${context.scheduledDate}`,
      severity: "warning",
      kind: "maintenance_overdue",
      entity_type: "maintenance_request",
      entity_id: context.id,
      dedupe_key: `maintenance:overdue:${context.assetType}:${context.id}:${context.scheduledDate}`,
    });
  }

  const created = await upsertNotifications(params.admin, rows);
  return { created };
}

function requestTables(assetType: AssetType): {
  requestTable: RequestTable;
  logTable: LogTable;
  logLinkTable: LogLinkTable;
} {
  if (assetType === "vehicle") {
    return {
      requestTable: "maintenance_requests",
      logTable: "maintenance_logs",
      logLinkTable: "maintenance_log_request_links",
    };
  }
  return {
    requestTable: "equipment_maintenance_requests",
    logTable: "equipment_maintenance_logs",
    logLinkTable: "equipment_maintenance_log_request_links",
  };
}

async function loadLogRequestMap(
  admin: AdminClient,
  assetType: AssetType,
  logIds: string[]
) {
  const uniqueLogIds = Array.from(new Set(logIds.map((id) => normalizeId(id)).filter(Boolean)));
  const out = new Map<string, Set<string>>();
  if (!uniqueLogIds.length) return out;

  const tables = requestTables(assetType);
  const [logsRes, linksRes] = await Promise.all([
    admin.from(tables.logTable).select("id,request_id").in("id", uniqueLogIds),
    admin
      .from(tables.logLinkTable)
      .select("maintenance_log_id,request_id")
      .in("maintenance_log_id", uniqueLogIds),
  ]);

  if (logsRes.error) throw new Error(logsRes.error.message);
  if (linksRes.error && !isMissingRelationError(linksRes.error)) {
    throw new Error(linksRes.error.message);
  }

  const logRows = (logsRes.data ?? []) as Array<{ id: string; request_id: string | null }>;
  for (const row of logRows) {
    const requestId = normalizeId(row.request_id);
    if (!requestId) continue;
    const bucket = out.get(row.id) ?? new Set<string>();
    bucket.add(requestId);
    out.set(row.id, bucket);
  }

  const linkRows = (linksRes.data ?? []) as Array<{
    maintenance_log_id: string;
    request_id: string | null;
  }>;
  for (const row of linkRows) {
    const requestId = normalizeId(row.request_id);
    if (!requestId) continue;
    const bucket = out.get(row.maintenance_log_id) ?? new Set<string>();
    bucket.add(requestId);
    out.set(row.maintenance_log_id, bucket);
  }

  return out;
}

async function loadRequestLogIdsMap(admin: AdminClient, refs: MaintenanceRef[]) {
  const out = new Map<string, Set<string>>();
  const unique = uniqueRefs(refs);
  if (!unique.length) return out;

  for (const assetType of ["vehicle", "equipment"] as const) {
    const requestIds = unique
      .filter((ref) => ref.assetType === assetType)
      .map((ref) => ref.requestId);
    if (!requestIds.length) continue;

    const tables = requestTables(assetType);
    const [logsRes, linksRes] = await Promise.all([
      admin.from(tables.logTable).select("id,request_id").in("request_id", requestIds),
      admin
        .from(tables.logLinkTable)
        .select("maintenance_log_id,request_id")
        .in("request_id", requestIds),
    ]);

    if (logsRes.error) throw new Error(logsRes.error.message);
    if (linksRes.error && !isMissingRelationError(linksRes.error)) {
      throw new Error(linksRes.error.message);
    }

    const logRows = (logsRes.data ?? []) as Array<{ id: string; request_id: string | null }>;
    for (const row of logRows) {
      const requestId = normalizeId(row.request_id);
      if (!requestId) continue;
      const key = requestRefKey(assetType, requestId);
      const bucket = out.get(key) ?? new Set<string>();
      bucket.add(row.id);
      out.set(key, bucket);
    }

    const linkRows = (linksRes.data ?? []) as Array<{
      maintenance_log_id: string;
      request_id: string | null;
    }>;
    for (const row of linkRows) {
      const requestId = normalizeId(row.request_id);
      if (!requestId) continue;
      const key = requestRefKey(assetType, requestId);
      const bucket = out.get(key) ?? new Set<string>();
      bucket.add(row.maintenance_log_id);
      out.set(key, bucket);
    }
  }

  return out;
}

async function buildPurchaseRefMap(
  admin: AdminClient,
  purchases: CompletedPurchaseLinkRow[]
) {
  const out = new Map<string, MaintenanceRef[]>();
  if (!purchases.length) return out;

  const vehicleLogIds = purchases
    .filter((row) => row.maintenance_log_type === "vehicle")
    .map((row) => normalizeId(row.maintenance_log_id));
  const equipmentLogIds = purchases
    .filter((row) => row.maintenance_log_type === "equipment")
    .map((row) => normalizeId(row.maintenance_log_id));

  const [vehicleLogMap, equipmentLogMap] = await Promise.all([
    loadLogRequestMap(admin, "vehicle", vehicleLogIds),
    loadLogRequestMap(admin, "equipment", equipmentLogIds),
  ]);

  for (const purchase of purchases) {
    const refs: MaintenanceRef[] = [];
    const directType = purchase.maintenance_request_type;
    const directId = normalizeId(purchase.maintenance_request_id);
    if (directType && directId) {
      refs.push({ assetType: directType, requestId: directId });
    }

    const logType = purchase.maintenance_log_type;
    const logId = normalizeId(purchase.maintenance_log_id);
    if (logType && logId) {
      const map = logType === "vehicle" ? vehicleLogMap : equipmentLogMap;
      const linkedRequestIds = map.get(logId);
      if (linkedRequestIds) {
        for (const requestId of linkedRequestIds) {
          refs.push({ assetType: logType, requestId });
        }
      }
    }

    out.set(purchase.id, uniqueRefs(refs));
  }

  return out;
}

async function countBlockingPurchasesByRequest(
  admin: AdminClient,
  refs: MaintenanceRef[],
  requestLogIds: Map<string, Set<string>>
) {
  const out = new Map<string, number>();
  const unique = uniqueRefs(refs);
  if (!unique.length) return out;

  const { data, error } = await admin
    .from("purchase_requests")
    .select(
      "id,overall_status,maintenance_request_type,maintenance_request_id,maintenance_log_type,maintenance_log_id"
    )
    .neq("overall_status", "completed")
    .limit(8000);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    overall_status: string | null;
    maintenance_request_type: AssetType | null;
    maintenance_request_id: string | null;
    maintenance_log_type: AssetType | null;
    maintenance_log_id: string | null;
  }>;

  for (const ref of unique) {
    const key = requestRefKey(ref.assetType, ref.requestId);
    const logIds = requestLogIds.get(key) ?? new Set<string>();
    let count = 0;
    for (const row of rows) {
      if (isPurchaseCompletedForMaintenance(row.overall_status)) continue;
      const direct =
        row.maintenance_request_type === ref.assetType &&
        normalizeId(row.maintenance_request_id) === ref.requestId;
      const viaLog =
        row.maintenance_log_type === ref.assetType &&
        logIds.has(normalizeId(row.maintenance_log_id));
      if (direct || viaLog) count += 1;
    }
    out.set(key, count);
  }

  return out;
}

export async function notifyMaintenancePartsReadyFromCompletedPurchases(params: {
  admin: AdminClient;
  purchases: CompletedPurchaseLinkRow[];
}) {
  const completedPurchases = params.purchases.filter((row) =>
    isPurchaseCompletedForMaintenance(row.overall_status)
  );
  if (!completedPurchases.length) return { created: 0 };

  const purchaseRefMap = await buildPurchaseRefMap(params.admin, completedPurchases);
  const allRefs = uniqueRefs(
    completedPurchases.flatMap((row) => purchaseRefMap.get(row.id) ?? [])
  );
  if (!allRefs.length) return { created: 0 };

  const [requestContexts, requestLogIds] = await Promise.all([
    loadMaintenanceContexts(params.admin, allRefs),
    loadRequestLogIdsMap(params.admin, allRefs),
  ]);
  const blockingCounts = await countBlockingPurchasesByRequest(
    params.admin,
    allRefs,
    requestLogIds
  );

  const notificationRows: NotificationInsertRow[] = [];
  const notifiedRequestKeys = new Set<string>();

  for (const purchase of completedPurchases) {
    const refs = purchaseRefMap.get(purchase.id) ?? [];
    for (const ref of refs) {
      const key = requestRefKey(ref.assetType, ref.requestId);
      if (notifiedRequestKeys.has(key)) continue;
      if ((blockingCounts.get(key) ?? 0) > 0) continue;
      const context = requestContexts.get(key);
      if (!context || !context.assignedTo) continue;
      notifiedRequestKeys.add(key);
      notificationRows.push({
        recipient_id: context.assignedTo,
        title: "Parts ready — maintenance task can now be started",
        body: `${context.title} • ${context.assetName}`,
        severity: "info",
        kind: "maintenance_parts_ready",
        entity_type: "maintenance_request",
        entity_id: context.id,
        dedupe_key: `maintenance:parts-ready:${context.assetType}:${context.id}:${purchase.id}`,
      });
    }
  }

  const created = await upsertNotifications(params.admin, notificationRows);
  return { created };
}
