import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentUserProfile();
  const userId = session?.user?.id ?? null;
  const role = session?.profile?.role ?? null;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (role !== "owner" && role !== "mechanic") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("digest_run_logs")
    .select("id,run_source,initiated_by,ran_at,success,skipped,date_key,sent_to,open_count,in_review_count,email_attempted,email_sent,email_failed,error_message,meta")
    .order("ran_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
