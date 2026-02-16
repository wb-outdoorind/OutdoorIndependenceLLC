import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/supabase/server";

export const runtime = "nodejs"; // ✅ ensure admin SDK runs in Node, not edge

export async function POST(req: Request) {
  try {
    // ✅ hard checks so we don't crash silently
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const session = await getCurrentUserProfile();
    const requesterRole = session?.profile?.role ?? "employee";

    if (requesterRole !== "owner" && requesterRole !== "office_admin") {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();

    const email = String(body.email || "").trim().toLowerCase();
    const full_name = String(body.full_name || "").trim();
    const role = String(body.role || "").trim();

    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!full_name) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    if (!role) return NextResponse.json({ error: "Role is required" }, { status: 400 });

    // extra safety
    if (requesterRole === "office_admin" && role === "owner") {
      return NextResponse.json({ error: "Only owner can invite another owner" }, { status: 403 });
    }

    const admin = createSupabaseAdmin();

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    const redirectTo = `${origin}/auth/callback`;

    const { data: inviteData, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(email, { redirectTo });

    if (inviteErr) {
      return NextResponse.json({ error: inviteErr.message }, { status: 400 });
    }

    const userId = inviteData?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Invite succeeded but no user id returned" }, { status: 500 });
    }

    const { error: upsertErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          full_name,
          role,
          status: "Active",
          phone: body.phone?.trim() || null,
          department: body.department?.trim() || null,
        },
        { onConflict: "id" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { error: `Invited user, but failed to upsert profile: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, userId });
  } catch (err: unknown) {
    console.error("Invite route crashed:", err);
    const message = err instanceof Error ? err.message : "Invite route crashed (unknown error)";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
