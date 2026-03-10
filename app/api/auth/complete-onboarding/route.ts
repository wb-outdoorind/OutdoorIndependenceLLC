import { NextResponse } from "next/server";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const ip = readClientIp(req);
    const routeLimit = await evaluateRateLimit({
      key: `complete-onboarding:ip:${ip}`,
      limit: 25,
      windowMs: 60_000,
    });
    if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

    const session = await getCurrentUserProfileStrict();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const actorLimit = await evaluateRateLimit({
      key: `complete-onboarding:user:${userId}`,
      limit: 8,
      windowMs: 60_000,
    });
    if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to complete onboarding";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
