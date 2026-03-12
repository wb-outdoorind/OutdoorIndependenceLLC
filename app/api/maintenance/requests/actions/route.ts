import { NextResponse } from "next/server";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { writeServerAudit } from "@/lib/auditServer";
import {
  coerceMaintenanceRequestStatus,
  type MaintenanceRequestStatus,
} from "@/lib/maintenanceStatus";
import { isMechanicOrHigher } from "@/lib/roles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AssetType = "vehicle" | "equipment";
type RequestAction = "merge" | "delete";
type RequestUrgency = "Low" | "Medium" | "High" | "Urgent";
type RequestDrivability =
  | "Yes – Drivable"
  | "Limited – Operate with caution"
  | "No – Out of Service";

type MaintenanceRequestRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  urgency: string | null;
  drivability: string | null;
  system_affected: string | null;
  unit_status?: string | null;
  issue_identified_during?: string | null;
  description: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
};

const STATUS_PRIORITY: Record<MaintenanceRequestStatus, number> = {
  Open: 1,
  "Pending Approval": 2,
  Scheduled: 3,
  "In Progress": 4,
  "Waiting on Parts": 5,
  "External Repair": 6,
  "On Hold": 7,
  Closed: 8,
};

const URGENCY_PRIORITY: Record<RequestUrgency, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Urgent: 4,
};

const DRIVABILITY_PRIORITY: Record<RequestDrivability, number> = {
  "Yes – Drivable": 1,
  "Limited – Operate with caution": 2,
  "No – Out of Service": 3,
};

function parseAssetType(value: unknown): AssetType | null {
  return value === "vehicle" || value === "equipment" ? value : null;
}

function parseAction(value: unknown): RequestAction | null {
  return value === "merge" || value === "delete" ? value : null;
}

function parseRequestIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const id = typeof item === "string" ? item.trim() : "";
    if (id) unique.add(id);
  }
  return Array.from(unique);
}

function requestTables(assetType: AssetType) {
  if (assetType === "vehicle") {
    return {
      requestTable: "maintenance_requests",
      logTable: "maintenance_logs",
      linkTable: "maintenance_log_request_links",
      assetKey: "vehicle_id",
    } as const;
  }
  return {
    requestTable: "equipment_maintenance_requests",
    logTable: "equipment_maintenance_logs",
    linkTable: "equipment_maintenance_log_request_links",
    assetKey: "equipment_id",
  } as const;
}

function mergedStatus(rows: MaintenanceRequestRow[]) {
  let selected: MaintenanceRequestStatus = "Open";
  let selectedScore = -1;
  for (const row of rows) {
    const status = coerceMaintenanceRequestStatus(row.status, "Open");
    const score = STATUS_PRIORITY[status];
    if (score > selectedScore) {
      selected = status;
      selectedScore = score;
    }
  }
  return selected;
}

function mergedUrgency(rows: MaintenanceRequestRow[]) {
  let selected: RequestUrgency = "Medium";
  let selectedScore = 0;
  for (const row of rows) {
    const urgency = row.urgency;
    if (urgency !== "Low" && urgency !== "Medium" && urgency !== "High" && urgency !== "Urgent") continue;
    const score = URGENCY_PRIORITY[urgency];
    if (score > selectedScore) {
      selected = urgency;
      selectedScore = score;
    }
  }
  return selected;
}

function mergedDrivability(rows: MaintenanceRequestRow[]) {
  let selected: RequestDrivability = "Yes – Drivable";
  let selectedScore = 0;
  for (const row of rows) {
    const drivability = row.drivability;
    if (
      drivability !== "Yes – Drivable" &&
      drivability !== "Limited – Operate with caution" &&
      drivability !== "No – Out of Service"
    ) {
      continue;
    }
    const score = DRIVABILITY_PRIORITY[drivability];
    if (score > selectedScore) {
      selected = drivability;
      selectedScore = score;
    }
  }
  return selected;
}

function mergedSingleValue(rows: MaintenanceRequestRow[], field: "system_affected" | "unit_status" | "issue_identified_during") {
  const values = Array.from(
    new Set(
      rows
        .map((row) => row[field])
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
  if (values.length === 1) return values[0];
  return "Other";
}

function buildMergedDescription(rows: MaintenanceRequestRow[]) {
  const sorted = [...rows].sort((a, b) => {
    const aTime = Date.parse(a.created_at ?? "") || 0;
    const bTime = Date.parse(b.created_at ?? "") || 0;
    return aTime - bTime;
  });
  const list = sorted.map((row, idx) => {
    const requestDate = row.created_at ? row.created_at.slice(0, 10) : "Unknown";
    const status = coerceMaintenanceRequestStatus(row.status, "Open");
    const urgency = row.urgency?.trim() || "Medium";
    const drivability = row.drivability?.trim() || "Yes – Drivable";
    const systemAffected = row.system_affected?.trim() || "Other";
    return [
      `Request ${idx + 1} (${row.id})`,
      `Request Date: ${requestDate}`,
      `Status: ${status}`,
      `Urgency: ${urgency}`,
      `Drivability: ${drivability}`,
      `System Affected: ${systemAffected}`,
      "Details:",
      row.description?.trim() || "(No details provided)",
    ].join("\n");
  });

  return [
    `Title: Linked maintenance request (${rows.length})`,
    "",
    "This maintenance request was created by linking and combining previous requests.",
    `Merged Request IDs: ${sorted.map((row) => row.id).join(", ")}`,
    "",
    ...list.flatMap((entry, idx) => (idx === 0 ? [entry] : ["", "-----", "", entry])),
  ].join("\n");
}

async function syncLogRequestLinks(params: {
  admin: ReturnType<typeof createSupabaseAdmin>;
  linkTable: "maintenance_log_request_links" | "equipment_maintenance_log_request_links";
  requestIds: string[];
  mergedRequestId: string;
  userId: string;
}) {
  const { admin, linkTable, requestIds, mergedRequestId, userId } = params;
  const linksRes = await admin.from(linkTable).select("maintenance_log_id").in("request_id", requestIds);
  if (linksRes.error) {
    const code = (linksRes.error as { code?: string }).code;
    if (code === "42P01") return;
    throw new Error(linksRes.error.message);
  }

  const maintenanceLogIds = Array.from(
    new Set(
      ((linksRes.data ?? []) as Array<{ maintenance_log_id: string | null }>)
        .map((row) => row.maintenance_log_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );
  if (maintenanceLogIds.length === 0) return;

  const deleteOldRes = await admin.from(linkTable).delete().in("request_id", requestIds);
  if (deleteOldRes.error) throw new Error(deleteOldRes.error.message);

  const insertRes = await admin
    .from(linkTable)
    .upsert(
      maintenanceLogIds.map((maintenance_log_id) => ({
        maintenance_log_id,
        request_id: mergedRequestId,
        created_by: userId,
      })),
      { onConflict: "maintenance_log_id,request_id" }
    );
  if (insertRes.error) throw new Error(insertRes.error.message);
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `maintenance-request-actions:ip:${ip}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.profile?.role ?? null;

  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isMechanicOrHigher(role)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const actorLimit = await evaluateRateLimit({
    key: `maintenance-request-actions:user:${userId}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    assetType?: unknown;
    requestIds?: unknown;
  };

  const action = parseAction(body.action);
  const assetType = parseAssetType(body.assetType);
  const requestIds = parseRequestIds(body.requestIds);

  if (!action || !assetType) {
    return NextResponse.json({ error: "action and assetType are required." }, { status: 400 });
  }
  if (requestIds.length === 0) {
    return NextResponse.json({ error: "At least one request ID is required." }, { status: 400 });
  }
  if (action === "merge" && requestIds.length < 2) {
    return NextResponse.json({ error: "Select at least two requests to link." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { requestTable, logTable, linkTable, assetKey } = requestTables(assetType);
  const requestRes = await admin
    .from(requestTable)
    .select(
      `id,${assetKey},created_at,status,urgency,drivability,system_affected,unit_status,issue_identified_during,description`
    )
    .in("id", requestIds);

  if (requestRes.error) {
    return NextResponse.json({ error: requestRes.error.message }, { status: 500 });
  }

  const requestRows = (requestRes.data ?? []) as MaintenanceRequestRow[];
  if (requestRows.length !== requestIds.length) {
    return NextResponse.json({ error: "One or more selected requests no longer exist." }, { status: 404 });
  }

  const distinctAssetIds = Array.from(
    new Set(
      requestRows
        .map((row) => (assetKey === "vehicle_id" ? row.vehicle_id : row.equipment_id))
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  if (distinctAssetIds.length !== 1) {
    return NextResponse.json(
      { error: "Requests can only be linked when they belong to the same asset." },
      { status: 400 }
    );
  }
  const assetId = distinctAssetIds[0];

  if (action === "delete") {
    const unlinkLogsRes = await admin
      .from(logTable)
      .update({ request_id: null })
      .in("request_id", requestIds);
    if (unlinkLogsRes.error) {
      return NextResponse.json({ error: unlinkLogsRes.error.message }, { status: 500 });
    }

    const clearPurchasesRes = await admin
      .from("purchase_requests")
      .update({ maintenance_request_id: null })
      .eq("maintenance_request_type", assetType)
      .in("maintenance_request_id", requestIds);
    if (clearPurchasesRes.error) {
      return NextResponse.json({ error: clearPurchasesRes.error.message }, { status: 500 });
    }

    const deleteRes = await admin.from(requestTable).delete().in("id", requestIds);
    if (deleteRes.error) {
      return NextResponse.json({ error: deleteRes.error.message }, { status: 500 });
    }

    await writeServerAudit(admin, {
      actorId: userId,
      actorRole: role,
      action: "maintenance_requests_deleted",
      tableName: requestTable,
      recordId: requestIds.join(","),
      eventType: "maintenance_requests_deleted",
      entityType: assetType,
      entityId: assetId,
      beforeData: requestRows,
      meta: {
        deletedCount: requestIds.length,
      },
    });

    return NextResponse.json({
      ok: true,
      action,
      assetType,
      assetId,
      deletedRequestIds: requestIds,
    });
  }

  const mergedPayload = {
    [assetKey]: assetId,
    submitted_by_user_id: userId,
    status: mergedStatus(requestRows),
    urgency: mergedUrgency(requestRows),
    drivability: mergedDrivability(requestRows),
    system_affected: mergedSingleValue(requestRows, "system_affected"),
    unit_status: mergedSingleValue(requestRows, "unit_status"),
    issue_identified_during: mergedSingleValue(requestRows, "issue_identified_during"),
    description: buildMergedDescription(requestRows),
  };

  const insertRes = await admin.from(requestTable).insert(mergedPayload).select("id").single();
  if (insertRes.error || !insertRes.data?.id) {
    return NextResponse.json({ error: insertRes.error?.message || "Failed to create merged request." }, { status: 500 });
  }
  const mergedRequestId = insertRes.data.id as string;

  const relinkLogsRes = await admin
    .from(logTable)
    .update({ request_id: mergedRequestId })
    .in("request_id", requestIds);
  if (relinkLogsRes.error) {
    return NextResponse.json({ error: relinkLogsRes.error.message }, { status: 500 });
  }

  try {
    await syncLogRequestLinks({
      admin,
      linkTable,
      requestIds,
      mergedRequestId,
      userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed syncing maintenance log request links.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const updatePurchasesRes = await admin
    .from("purchase_requests")
    .update({ maintenance_request_id: mergedRequestId })
    .eq("maintenance_request_type", assetType)
    .in("maintenance_request_id", requestIds);
  if (updatePurchasesRes.error) {
    return NextResponse.json({ error: updatePurchasesRes.error.message }, { status: 500 });
  }

  const deleteRes = await admin.from(requestTable).delete().in("id", requestIds);
  if (deleteRes.error) {
    return NextResponse.json({ error: deleteRes.error.message }, { status: 500 });
  }

  await writeServerAudit(admin, {
    actorId: userId,
    actorRole: role,
    action: "maintenance_requests_linked",
    tableName: requestTable,
    recordId: mergedRequestId,
    eventType: "maintenance_requests_linked",
    entityType: assetType,
    entityId: assetId,
    beforeData: requestRows,
    afterData: { id: mergedRequestId, ...mergedPayload },
    meta: {
      mergedRequestId,
      sourceRequestIds: requestIds,
    },
  });

  return NextResponse.json({
    ok: true,
    action,
    assetType,
    assetId,
    mergedRequestId,
    deletedRequestIds: requestIds,
  });
}
