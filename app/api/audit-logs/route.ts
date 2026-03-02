import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";

export const runtime = "nodejs";

function canViewAudit(role: string | null | undefined) {
  return (
    role === "owner" ||
    role === "operations_manager" ||
    role === "office_admin" ||
    role === "mechanic"
  );
}

export async function GET(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `audit-logs:get:ip:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.profile?.role ?? null;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canViewAudit(role)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const actorLimit = evaluateRateLimit({
    key: `audit-logs:get:user:${userId}`,
    limit: 240,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const url = new URL(req.url);
  const eventType = (url.searchParams.get("eventType") || "").trim();
  const entityType = (url.searchParams.get("entityType") || "").trim();
  const actorId = (url.searchParams.get("actorId") || "").trim();
  const limitParam = Number(url.searchParams.get("limit") || "200");
  const limit = Number.isFinite(limitParam) ? Math.min(500, Math.max(20, Math.trunc(limitParam))) : 200;

  const admin = createSupabaseAdmin();
  let query = admin
    .from("audit_logs")
    .select("id,created_at,action,table_name,record_id,meta,actor_id,actor_role,event_type,entity_type,entity_id,before_data,after_data")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventType) query = query.eq("event_type", eventType);
  if (entityType) query = query.eq("entity_type", entityType);
  if (actorId) query = query.eq("actor_id", actorId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [] });
}
