import { NextResponse } from "next/server";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import {
  defaultTeammateInviteTemplate,
  TEAMMATE_INVITE_TEMPLATE_KEY,
  validateTeammateInviteTemplate,
} from "@/lib/teammateInvites";

export const runtime = "nodejs";

function canManageEmailTemplates(role: string | null | undefined) {
  return (
    role === "owner" ||
    role === "operations_manager" ||
    role === "sales_manager" ||
    role === "office_admin"
  );
}

export async function GET(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `notifications-email-templates-get:ip:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canManageEmailTemplates(session.profile?.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  const fallback = defaultTeammateInviteTemplate();
  const { data, error } = await admin
    .from("app_email_templates")
    .select("subject_template,body_template,updated_at")
    .eq("template_key", TEAMMATE_INVITE_TEMPLATE_KEY)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    template: {
      key: TEAMMATE_INVITE_TEMPLATE_KEY,
      subjectTemplate: data?.subject_template ?? fallback.subjectTemplate,
      bodyTemplate: data?.body_template ?? fallback.bodyTemplate,
      updatedAt: data?.updated_at ?? null,
    },
    defaults: fallback,
  });
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `notifications-email-templates-post:ip:${ip}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canManageEmailTemplates(session.profile?.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    subjectTemplate?: string;
    bodyTemplate?: string;
  };
  const subjectTemplate = String(body.subjectTemplate ?? "").trim();
  const bodyTemplate = String(body.bodyTemplate ?? "").trim();
  if (!subjectTemplate) {
    return NextResponse.json({ error: "Subject template is required." }, { status: 400 });
  }
  if (!bodyTemplate) {
    return NextResponse.json({ error: "Body template is required." }, { status: 400 });
  }

  const validation = validateTeammateInviteTemplate({
    subjectTemplate,
    bodyTemplate,
  });
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: `Template is missing required token(s): ${validation.missingTokens.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("app_email_templates")
    .upsert(
      {
        template_key: TEAMMATE_INVITE_TEMPLATE_KEY,
        subject_template: subjectTemplate,
        body_template: bodyTemplate,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: "template_key" }
    )
    .select("subject_template,body_template,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    template: {
      key: TEAMMATE_INVITE_TEMPLATE_KEY,
      subjectTemplate: data.subject_template,
      bodyTemplate: data.body_template,
      updatedAt: data.updated_at,
    },
  });
}
