import { NextResponse } from "next/server";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import {
  notifyMaintenanceAssignment,
  notifyMaintenanceOverdueForRefs,
} from "@/lib/maintenanceNotifications";
import { isManagementRole, isMechanicOrHigher } from "@/lib/roles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AssetType = "vehicle" | "equipment";

type AssignmentBody = {
  action: "assignment";
  assetType?: unknown;
  requestId?: unknown;
  previousAssigneeId?: unknown;
  nextAssigneeId?: unknown;
};

type OverdueSyncBody = {
  action: "sync_overdue";
  items?: unknown;
};

type MaintenanceNotificationBody = AssignmentBody | OverdueSyncBody;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown) {
  const next = asString(value);
  return next || null;
}

function parseAssetType(value: unknown): AssetType | null {
  return value === "vehicle" || value === "equipment" ? value : null;
}

function parseOverdueItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  const rows: Array<{ assetType: AssetType; requestId: string }> = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as { assetType?: unknown; requestId?: unknown };
    const assetType = parseAssetType(row.assetType);
    const requestId = asString(row.requestId);
    if (!assetType || !requestId) continue;
    const key = `${assetType}:${requestId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ assetType, requestId });
  }
  return rows;
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `maintenance-notifications:ip:${ip}`,
    limit: 80,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.profile?.role ?? null;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isMechanicOrHigher(role)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const actorLimit = await evaluateRateLimit({
    key: `maintenance-notifications:user:${userId}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const body = (await req.json().catch(() => ({}))) as MaintenanceNotificationBody;
  const action = asString((body as { action?: unknown }).action);
  if (action !== "assignment" && action !== "sync_overdue") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  if (action === "assignment") {
    if (!isManagementRole(role)) {
      return NextResponse.json({ error: "Only management can trigger assignment notifications." }, { status: 403 });
    }
    const payload = body as AssignmentBody;
    const assetType = parseAssetType(payload.assetType);
    const requestId = asString(payload.requestId);
    if (!assetType || !requestId) {
      return NextResponse.json({ error: "assetType and requestId are required." }, { status: 400 });
    }

    const result = await notifyMaintenanceAssignment({
      admin,
      assetType,
      requestId,
      previousAssigneeId: asNullableString(payload.previousAssigneeId),
      nextAssigneeId: asNullableString(payload.nextAssigneeId),
    });
    return NextResponse.json({ ok: true, created: result.created });
  }

  const payload = body as OverdueSyncBody;
  const items = parseOverdueItems(payload.items).slice(0, 300);
  if (!items.length) return NextResponse.json({ ok: true, created: 0 });

  const result = await notifyMaintenanceOverdueForRefs({
    admin,
    refs: items,
  });
  return NextResponse.json({ ok: true, created: result.created });
}
