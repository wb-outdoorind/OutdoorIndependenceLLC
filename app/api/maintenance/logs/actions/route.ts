import { NextResponse } from "next/server";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { writeServerAudit } from "@/lib/auditServer";
import { isMechanicOrHigher } from "@/lib/roles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AssetType = "vehicle" | "equipment";
type LogAction = "delete" | "link_requests";

type MaintenanceLogRow = {
  id: string;
  vehicle_id?: string | null;
  equipment_id?: string | null;
  request_id?: string | null;
};

type MaintenanceRequestAssetRow = {
  id: string;
  vehicle_id?: string | null;
  equipment_id?: string | null;
};

function parseAssetType(value: unknown): AssetType | null {
  return value === "vehicle" || value === "equipment" ? value : null;
}

function parseAction(value: unknown): LogAction | null {
  return value === "delete" || value === "link_requests" ? value : null;
}

function parseLogId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function tablesForAsset(assetType: AssetType) {
  if (assetType === "vehicle") {
    return {
      logTable: "maintenance_logs",
      requestTable: "maintenance_requests",
      linkTable: "maintenance_log_request_links",
      assetKey: "vehicle_id",
    } as const;
  }
  return {
    logTable: "equipment_maintenance_logs",
    requestTable: "equipment_maintenance_requests",
    linkTable: "equipment_maintenance_log_request_links",
    assetKey: "equipment_id",
  } as const;
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `maintenance-log-actions:ip:${ip}`,
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
    key: `maintenance-log-actions:user:${userId}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    assetType?: unknown;
    logId?: unknown;
    requestIds?: unknown;
  };

  const action = parseAction(body.action);
  const assetType = parseAssetType(body.assetType);
  const logId = parseLogId(body.logId);
  const requestIds = parseRequestIds(body.requestIds);

  if (!action || !assetType || !logId) {
    return NextResponse.json({ error: "action, assetType, and logId are required." }, { status: 400 });
  }

  const { logTable, requestTable, linkTable, assetKey } = tablesForAsset(assetType);
  const admin = createSupabaseAdmin();

  const logRes = await admin
    .from(logTable)
    .select(`id,${assetKey},request_id`)
    .eq("id", logId)
    .maybeSingle();
  if (logRes.error) {
    return NextResponse.json({ error: logRes.error.message }, { status: 500 });
  }
  const logRow = logRes.data as MaintenanceLogRow | null;
  if (!logRow) return NextResponse.json({ error: "Maintenance log not found." }, { status: 404 });

  const assetId = assetKey === "vehicle_id" ? logRow.vehicle_id : logRow.equipment_id;
  if (!assetId) {
    return NextResponse.json({ error: "Maintenance log is missing required asset linkage." }, { status: 400 });
  }

  if (action === "delete") {
    const deleteRes = await admin.from(logTable).delete().eq("id", logId);
    if (deleteRes.error) {
      return NextResponse.json({ error: deleteRes.error.message }, { status: 500 });
    }

    await writeServerAudit(admin, {
      actorId: userId,
      actorRole: role,
      action: "maintenance_log_deleted",
      tableName: logTable,
      recordId: logId,
      eventType: "maintenance_log_deleted",
      entityType: assetType,
      entityId: assetId,
      beforeData: logRow,
    });

    return NextResponse.json({
      ok: true,
      action,
      assetType,
      assetId,
      logId,
    });
  }

  if (requestIds.length === 0) {
    const clearRes = await admin.from(logTable).update({ request_id: null }).eq("id", logId);
    if (clearRes.error) {
      return NextResponse.json({ error: clearRes.error.message }, { status: 500 });
    }
    const clearLinksRes = await admin.from(linkTable).delete().eq("maintenance_log_id", logId);
    if (clearLinksRes.error) {
      const code = (clearLinksRes.error as { code?: string }).code;
      if (code !== "42P01") {
        return NextResponse.json({ error: clearLinksRes.error.message }, { status: 500 });
      }
    }

    await writeServerAudit(admin, {
      actorId: userId,
      actorRole: role,
      action: "maintenance_log_requests_unlinked",
      tableName: logTable,
      recordId: logId,
      eventType: "maintenance_log_requests_unlinked",
      entityType: assetType,
      entityId: assetId,
      beforeData: { request_id: logRow.request_id ?? null },
      afterData: { request_id: null },
    });

    return NextResponse.json({
      ok: true,
      action,
      assetType,
      assetId,
      logId,
      linkedRequestIds: [],
    });
  }

  const requestRes = await admin
    .from(requestTable)
    .select(`id,${assetKey}`)
    .in("id", requestIds);
  if (requestRes.error) {
    return NextResponse.json({ error: requestRes.error.message }, { status: 500 });
  }
  const requestRows = (requestRes.data ?? []) as MaintenanceRequestAssetRow[];
  if (requestRows.length !== requestIds.length) {
    return NextResponse.json({ error: "One or more maintenance requests were not found." }, { status: 404 });
  }

  const invalidForAsset = requestRows.some((row) =>
    assetKey === "vehicle_id" ? row.vehicle_id !== assetId : row.equipment_id !== assetId
  );
  if (invalidForAsset) {
    return NextResponse.json(
      { error: "All linked requests must belong to the same asset as the maintenance log." },
      { status: 400 }
    );
  }

  const primaryRequestId = requestIds[0] ?? null;
  const updatePrimaryRes = await admin
    .from(logTable)
    .update({ request_id: primaryRequestId })
    .eq("id", logId);
  if (updatePrimaryRes.error) {
    return NextResponse.json({ error: updatePrimaryRes.error.message }, { status: 500 });
  }

  const clearStaleRes = await admin
    .from(linkTable)
    .delete()
    .eq("maintenance_log_id", logId)
    .not("request_id", "in", `(${requestIds.map((id) => `"${id}"`).join(",")})`);
  if (clearStaleRes.error) {
    const code = (clearStaleRes.error as { code?: string }).code;
    if (code !== "42P01") {
      return NextResponse.json({ error: clearStaleRes.error.message }, { status: 500 });
    }
  }

  const insertLinksRes = await admin
    .from(linkTable)
    .upsert(
      requestIds.map((request_id) => ({
        maintenance_log_id: logId,
        request_id,
        created_by: userId,
      })),
      { onConflict: "maintenance_log_id,request_id" }
    );
  if (insertLinksRes.error) {
    const code = (insertLinksRes.error as { code?: string }).code;
    if (code !== "42P01") {
      return NextResponse.json({ error: insertLinksRes.error.message }, { status: 500 });
    }
  }

  await writeServerAudit(admin, {
    actorId: userId,
    actorRole: role,
    action: "maintenance_log_requests_linked",
    tableName: logTable,
    recordId: logId,
    eventType: "maintenance_log_requests_linked",
    entityType: assetType,
    entityId: assetId,
    beforeData: { request_id: logRow.request_id ?? null },
    afterData: { request_id: primaryRequestId, linked_request_ids: requestIds },
  });

  return NextResponse.json({
    ok: true,
    action,
    assetType,
    assetId,
    logId,
    primaryRequestId,
    linkedRequestIds: requestIds,
  });
}
