import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/supabase/server";

type AssetType = "vehicle" | "equipment";
type ActionType = "asset_health_decline" | "mechanic_decline";
type ActionStatus = "Open" | "In Review" | "Resolved";

function isDeclining(points: number[]) {
  if (points.length < 3) return false;
  const a = points[points.length - 3];
  const b = points[points.length - 2];
  const c = points[points.length - 1];
  return a > b && b > c;
}

function parseAssetType(value: unknown): AssetType | null {
  return value === "vehicle" || value === "equipment" ? value : null;
}

function isOwnerOrMechanic(role: string | null | undefined) {
  return role === "owner" || role === "mechanic";
}

export async function GET(req: Request) {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? null;
  if (!isOwnerOrMechanic(role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const url = new URL(req.url);
  const assetType = parseAssetType(url.searchParams.get("assetType"));
  const assetId = (url.searchParams.get("assetId") || "").trim();
  if (!assetType || !assetId) {
    return NextResponse.json({ error: "assetType and assetId are required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("trend_actions")
    .select("id,asset_type,asset_id,action_type,status,summary,detail,created_at,updated_at,resolved_at")
    .eq("asset_type", assetType)
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: data ?? [] });
}

export async function POST(req: Request) {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? null;
  const userId = session?.user?.id ?? null;
  if (!isOwnerOrMechanic(role) || !userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json();
  const assetType = parseAssetType(body.assetType);
  const assetId = String(body.assetId || "").trim();
  const healthPoints = Array.isArray(body.healthPoints) ? body.healthPoints.map(Number).filter(Number.isFinite) : [];
  const mechanicPoints = Array.isArray(body.mechanicPoints) ? body.mechanicPoints.map(Number).filter(Number.isFinite) : [];
  if (!assetType || !assetId) {
    return NextResponse.json({ error: "assetType and assetId are required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const created: ActionType[] = [];

  async function ensureAction(actionType: ActionType, summary: string, detail: Record<string, unknown>) {
    const { data: existing, error: existingError } = await admin
      .from("trend_actions")
      .select("id")
      .eq("asset_type", assetType)
      .eq("asset_id", assetId)
      .eq("action_type", actionType)
      .in("status", ["Open", "In Review"])
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) return;

    const { error: insertError } = await admin.from("trend_actions").insert({
      asset_type: assetType,
      asset_id: assetId,
      action_type: actionType,
      status: "Open",
      trend_direction: "Declining",
      summary,
      detail,
      created_by: userId,
    });
    if (insertError) throw insertError;
    created.push(actionType);
  }

  try {
    if (isDeclining(healthPoints)) {
      await ensureAction(
        "asset_health_decline",
        "Asset health trend is declining for the last 3 logs.",
        { recent_points: healthPoints.slice(-3) }
      );
    }
    if (isDeclining(mechanicPoints)) {
      await ensureAction(
        "mechanic_decline",
        "Mechanic trend is declining for the last 3 logs.",
        { recent_points: mechanicPoints.slice(-3) }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to evaluate trend actions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ created });
}

export async function PATCH(req: Request) {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? null;
  const userId = session?.user?.id ?? null;
  if (!isOwnerOrMechanic(role) || !userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json();
  const actionId = String(body.actionId || "").trim();
  const nextStatus = String(body.status || "").trim() as ActionStatus;
  if (!actionId || !["Open", "In Review", "Resolved"].includes(nextStatus)) {
    return NextResponse.json({ error: "actionId and valid status are required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };
  if (nextStatus === "Resolved") {
    updatePayload.resolved_at = new Date().toISOString();
    updatePayload.resolved_by = userId;
  } else {
    updatePayload.resolved_at = null;
    updatePayload.resolved_by = null;
  }

  const { error } = await admin
    .from("trend_actions")
    .update(updatePayload)
    .eq("id", actionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
