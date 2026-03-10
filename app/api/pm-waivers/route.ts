import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { writeServerAudit } from "@/lib/auditServer";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { isMechanicOrHigher } from "@/lib/roles";

export const runtime = "nodejs";

type AssetType = "vehicle" | "equipment";
type Unit = "miles" | "hours";

function parseAssetType(value: unknown): AssetType | null {
  return value === "vehicle" || value === "equipment" ? value : null;
}

function parseUnit(value: unknown): Unit | null {
  return value === "miles" || value === "hours" ? value : null;
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `pm-waivers-post:ip:${ip}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.profile?.role ?? null;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isMechanicOrHigher(role)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const actorLimit = await evaluateRateLimit({
    key: `pm-waivers-post:user:${userId}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const body = (await req.json().catch(() => ({}))) as {
    assetType?: unknown;
    assetId?: unknown;
    dueAt?: unknown;
    unit?: unknown;
    assetName?: unknown;
  };

  const assetType = parseAssetType(body.assetType);
  const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
  const dueAtRaw = Number(body.dueAt);
  const dueAt = Number.isFinite(dueAtRaw) ? Math.max(0, Math.round(dueAtRaw)) : NaN;
  const unit = parseUnit(body.unit);
  const assetName = typeof body.assetName === "string" && body.assetName.trim() ? body.assetName.trim() : assetId;

  if (!assetType || !assetId || !Number.isFinite(dueAt) || !unit) {
    return NextResponse.json(
      { error: "assetType, assetId, dueAt, and unit are required." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { error: waiverError } = await admin
    .from("pm_waivers")
    .upsert(
      {
        asset_type: assetType,
        asset_id: assetId,
        due_at: dueAt,
        active: true,
        waived_by: userId,
        waived_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "asset_type,asset_id,due_at" }
    );

  if (waiverError) {
    return NextResponse.json({ error: waiverError.message }, { status: 500 });
  }

  const { data: opsManagers, error: opsManagerError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "operations_manager");
  if (opsManagerError) {
    return NextResponse.json({ error: opsManagerError.message }, { status: 500 });
  }

  const actorLabel =
    session?.profile?.full_name?.trim() ||
    session?.profile?.email?.trim() ||
    userId;

  const recipients = ((opsManagers ?? []) as Array<{ id: string }>).filter(
    (row) => typeof row.id === "string" && row.id.length > 0
  );

  if (recipients.length) {
    const title = `PM Waived: ${assetName}`;
    const bodyText = `${actorLabel} waived PM for ${assetName} (${assetType}:${assetId}) at ${dueAt.toLocaleString()} ${unit}.`;
    const dedupeKey = `pm_waived:${assetType}:${assetId}:${dueAt}`;

    const { error: notifyError } = await admin.from("user_notifications").upsert(
      recipients.map((recipient) => ({
        recipient_id: recipient.id,
        title,
        body: bodyText,
        severity: "warning",
        kind: "pm_waived",
        entity_type: assetType,
        entity_id: assetId,
        dedupe_key: dedupeKey,
      })),
      { onConflict: "recipient_id,dedupe_key" }
    );
    if (notifyError) {
      return NextResponse.json({ error: notifyError.message }, { status: 500 });
    }
  }

  await writeServerAudit(admin, {
    actorId: userId,
    actorRole: role,
    action: "pm_waived",
    tableName: "pm_waivers",
    recordId: `${assetType}:${assetId}:${dueAt}`,
    eventType: "pm_waiver_created",
    entityType: assetType,
    entityId: assetId,
    afterData: {
      asset_type: assetType,
      asset_id: assetId,
      due_at: dueAt,
      active: true,
      waived_by: userId,
      waived_at: nowIso,
    },
    meta: {
      unit,
      assetName,
      notifiedOperationsManagers: recipients.length,
    },
  });

  return NextResponse.json({
    ok: true,
    waiver: {
      assetType,
      assetId,
      dueAt,
      active: true,
    },
    notifiedOperationsManagers: recipients.length,
  });
}
