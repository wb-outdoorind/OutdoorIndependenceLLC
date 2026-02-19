import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentUserProfile();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("user_notifications")
    .select("id,title,body,severity,kind,entity_type,entity_id,is_read,created_at,read_at")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unreadCount = (data ?? []).filter((row) => row.is_read !== true).length;
  return NextResponse.json({ notifications: data ?? [], unreadCount });
}

export async function POST(req: Request) {
  const session = await getCurrentUserProfile();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: "mark_read" | "mark_all_read" | "prefs";
    ids?: number[];
    emailEnabled?: boolean;
    smsEnabled?: boolean;
  };

  const action = body.action;
  const admin = createSupabaseAdmin();

  if (action === "mark_all_read") {
    const { error } = await admin
      .from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .eq("is_read", false);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_read") {
    const ids = Array.isArray(body.ids) ? body.ids.filter((id) => Number.isFinite(id)) : [];
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    const { error } = await admin
      .from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "prefs") {
    const emailEnabled = body.emailEnabled !== false;
    const smsEnabled = body.smsEnabled === true;
    const { error } = await admin
      .from("user_notification_prefs")
      .upsert(
        { user_id: userId, email_enabled: emailEnabled, sms_enabled: smsEnabled },
        { onConflict: "user_id" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: prefs, error: prefsError } = await admin
    .from("user_notification_prefs")
    .select("email_enabled,sms_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefsError) return NextResponse.json({ error: prefsError.message }, { status: 500 });
  return NextResponse.json({
    prefs: {
      emailEnabled: prefs?.email_enabled ?? true,
      smsEnabled: prefs?.sms_enabled ?? false,
    },
  });
}
