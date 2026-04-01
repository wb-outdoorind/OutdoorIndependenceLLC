import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { writeServerAudit } from "@/lib/auditServer";

export const runtime = "nodejs";
const TEMP_PASSWORD = "Outdoor2026!";

export async function POST(req: Request) {
  try {
    const ip = readClientIp(req);
    const routeLimit = await evaluateRateLimit({
      key: `resend-invite:ip:${ip}`,
      limit: 15,
      windowMs: 60_000,
    });
    if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

    const session = await getCurrentUserProfileStrict();
    const userId = session?.user?.id ?? "anonymous";
    const actorLimit = await evaluateRateLimit({
      key: `resend-invite:user:${userId}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);
    const requesterRole = session?.profile?.role ?? "employee";

    if (
      requesterRole !== "owner" &&
      requesterRole !== "operations_manager" &&
      requesterRole !== "sales_manager" &&
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

    const { error: updateErr } = await admin.auth.admin.updateUserById(id, {
      password: TEMP_PASSWORD,
      email_confirm: true,
    });
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    const { error: profileErr } = await admin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", id);
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

    await writeServerAudit(admin, {
      actorId: session?.user?.id ?? null,
      actorRole: requesterRole,
      action: "reset_teammate_password",
      tableName: "profiles",
      recordId: id,
      eventType: "teammate_password_reset",
      entityType: "profile",
      entityId: id,
      meta: { email: prof.email },
    });

    return NextResponse.json({ ok: true, temporaryPassword: TEMP_PASSWORD });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Resend invite failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
