import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { canAccessCopilot } from "@/lib/copilotAccess";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CopilotContextInput = {
  route?: unknown;
  pageTitle?: unknown;
  assetType?: unknown;
  assetId?: unknown;
  formType?: unknown;
  payload?: unknown;
};

function normalizeText(value: unknown, maxLen = 256) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function toPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    const json = JSON.stringify(value);
    if (json.length <= 8_000) return value;
    return { summary: "payload_truncated", size: json.length };
  } catch {
    return { summary: "payload_unserializable" };
  }
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `copilot-context:ip:${ip}`,
    limit: 180,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const allowed = canAccessCopilot({
    role: session.profile?.role ?? session.effectiveRole ?? null,
    profile: session.profile,
    user: session.user,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Not authorized for copilot" }, { status: 403 });
  }

  const userLimit = evaluateRateLimit({
    key: `copilot-context:user:${userId}`,
    limit: 180,
    windowMs: 60_000,
  });
  if (!userLimit.ok) return rateLimitExceededResponse(userLimit);

  const body = (await req.json().catch(() => ({}))) as CopilotContextInput;

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("copilot_context_events")
    .insert({
      user_id: userId,
      event_type: "context",
      route: normalizeText(body.route, 512),
      page_title: normalizeText(body.pageTitle, 180),
      asset_type: normalizeText(body.assetType, 80),
      asset_id: normalizeText(body.assetId, 180),
      form_type: normalizeText(body.formType, 120),
      payload: toPayload(body.payload),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventId: data.id });
}
