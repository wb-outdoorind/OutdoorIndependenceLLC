import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getCurrentUserProfile();
    const requesterRole = session?.profile?.role ?? "employee";

    if (
      requesterRole !== "owner" &&
      requesterRole !== "operations_manager" &&
      requesterRole !== "office_admin"
    ) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Missing employee id" }, { status: 400 });

    const admin = createSupabaseAdmin();

    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("email")
      .eq("id", id)
      .maybeSingle();

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
    if (!prof?.email) return NextResponse.json({ error: "Teammate email missing" }, { status: 400 });

    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectTo = `${origin}/auth/callback`;

    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(prof.email, { redirectTo });
    if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Resend invite failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
