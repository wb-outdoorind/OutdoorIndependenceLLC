import { NextResponse } from "next/server";
import { canAccessCopilot } from "@/lib/copilotAccess";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentUserProfileStrict();
  if (!session?.user?.id) {
    return NextResponse.json({ allowed: false, reason: "not_authenticated" }, { status: 401 });
  }
  const safeSession = session;

  const allowed = canAccessCopilot({
    role: safeSession.profile?.role ?? safeSession.effectiveRole ?? null,
    profile: safeSession.profile,
    user: safeSession.user,
  });

  return NextResponse.json({
    allowed,
    reason: allowed ? null : "restricted_user",
  });
}
