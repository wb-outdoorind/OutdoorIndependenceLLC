import { NextResponse } from "next/server";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import {
  coerceUserNotificationPreferences,
  DEFAULT_USER_NOTIFICATION_PREFERENCES,
  normalizeUserNotificationPreferences,
  toNotificationPreferenceDbRow,
} from "@/lib/userNotificationPreferences";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PreferenceSelectRow = {
  maintenance_assigned: boolean | null;
  maintenance_parts_ready: boolean | null;
  maintenance_overdue: boolean | null;
  toast_assigned: boolean | null;
  toast_parts_ready: boolean | null;
  toast_overdue: boolean | null;
};

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "42501") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("permission denied");
}

function preferenceResponseFromRow(row: PreferenceSelectRow | null | undefined) {
  const normalized = row
    ? normalizeUserNotificationPreferences(row)
    : { ...DEFAULT_USER_NOTIFICATION_PREFERENCES };
  return { prefs: normalized };
}

export async function GET(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `notifications-preferences-get:ip:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("user_notification_preferences")
    .select(
      "maintenance_assigned,maintenance_parts_ready,maintenance_overdue,toast_assigned,toast_parts_ready,toast_overdue"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error && !isMissingRelationError(error)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(preferenceResponseFromRow((data ?? null) as PreferenceSelectRow | null));
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `notifications-preferences-post:ip:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const actorLimit = await evaluateRateLimit({
    key: `notifications-preferences-post:user:${userId}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const body = coerceUserNotificationPreferences(await req.json().catch(() => ({})));
  const admin = createSupabaseAdmin();
  const upsertPayload = {
    user_id: userId,
    ...toNotificationPreferenceDbRow(body),
  };

  const { data, error } = await admin
    .from("user_notification_preferences")
    .upsert(upsertPayload, { onConflict: "user_id" })
    .select(
      "maintenance_assigned,maintenance_parts_ready,maintenance_overdue,toast_assigned,toast_parts_ready,toast_overdue"
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(preferenceResponseFromRow((data ?? null) as PreferenceSelectRow | null));
}
