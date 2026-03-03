import { NextResponse } from "next/server";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function canViewSlaRuns(role: string | null | undefined) {
  return (
    role === "owner" ||
    role === "operations_manager" ||
    role === "office_admin" ||
    role === "mechanic"
  );
}

export async function GET() {
  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.profile?.role ?? null;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canViewSlaRuns(role)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("sla_alert_run_logs")
    .select(
      "id,run_source,initiated_by,ran_at,success,skipped,date_key,approval_overdue,maintenance_overdue,flagged_overdue,notifications_attempted,error_message,meta"
    )
    .order("ran_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
