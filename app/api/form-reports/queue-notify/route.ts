import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";

export const runtime = "nodejs";

type QueueEventType = "assign" | "release" | "mark_in_review" | "resolve";

type NotifyBody = {
  gradeId?: number;
  eventId?: number;
  eventType?: QueueEventType;
  toOwnerId?: string | null;
  fromOwnerId?: string | null;
};

function rolesForResolve() {
  return ["owner", "operations_manager", "mechanic"];
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `queue-notify:ip:${ip}`,
    limit: 50,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const actorId = session?.user?.id;
  if (!actorId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const actorLimit = evaluateRateLimit({
    key: `queue-notify:user:${actorId}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const body = (await req.json().catch(() => ({}))) as NotifyBody;
  const gradeId = Number(body.gradeId);
  const eventId = Number(body.eventId);
  const eventType = body.eventType;
  if (!Number.isFinite(gradeId) || !Number.isFinite(eventId) || !eventType) {
    return NextResponse.json({ error: "gradeId, eventId, eventType required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  const { data: actor } = await admin
    .from("profiles")
    .select("id,full_name,email")
    .eq("id", actorId)
    .maybeSingle();
  const actorLabel = actor?.full_name?.trim() || actor?.email?.trim() || actorId;

  const { data: grade, error: gradeError } = await admin
    .from("form_submission_grades")
    .select("id,form_type,form_id,vehicle_id,equipment_id,submitted_by")
    .eq("id", gradeId)
    .maybeSingle();
  if (gradeError || !grade) {
    return NextResponse.json({ error: gradeError?.message || "Grade not found" }, { status: 404 });
  }

  let recipientIds: string[] = [];
  if (eventType === "assign" && body.toOwnerId) {
    recipientIds = [body.toOwnerId];
  } else if (eventType === "release" && body.fromOwnerId) {
    recipientIds = [body.fromOwnerId];
  } else if (eventType === "resolve") {
    const { data: recipients, error: recErr } = await admin
      .from("profiles")
      .select("id")
      .in("role", rolesForResolve())
      .eq("status", "Active");
    if (recErr) {
      return NextResponse.json({ error: recErr.message }, { status: 500 });
    }
    recipientIds = (recipients ?? []).map((row) => row.id);
  }

  recipientIds = Array.from(new Set(recipientIds.filter(Boolean)));
  if (!recipientIds.length) return NextResponse.json({ ok: true, sent: 0 });

  const { data: prefs } = await admin
    .from("user_notification_prefs")
    .select("user_id,queue_events_enabled")
    .in("user_id", recipientIds);
  const queueEnabledByUser = new Map<string, boolean>();
  for (const row of prefs ?? []) {
    queueEnabledByUser.set(row.user_id, row.queue_events_enabled !== false);
  }

  const enabledRecipients = recipientIds.filter((id) => queueEnabledByUser.get(id) !== false);
  if (!enabledRecipients.length) return NextResponse.json({ ok: true, sent: 0 });

  const assetLabel = grade.vehicle_id
    ? `Vehicle ${grade.vehicle_id}`
    : grade.equipment_id
      ? `Equipment ${grade.equipment_id}`
      : "Unlinked asset";
  const formLabel = `${grade.form_type} #${grade.form_id}`;

  const eventMeta: Record<QueueEventType, { title: string; body: string; severity: "info" | "warning" | "high" }> = {
    assign: {
      title: "Flagged Queue Item Assigned",
      body: `${actorLabel} assigned you ${formLabel} (${assetLabel}).`,
      severity: "warning",
    },
    release: {
      title: "Flagged Queue Ownership Released",
      body: `${actorLabel} released ownership for ${formLabel} (${assetLabel}).`,
      severity: "info",
    },
    mark_in_review: {
      title: "Flagged Queue Item In Review",
      body: `${actorLabel} marked ${formLabel} as in review.`,
      severity: "info",
    },
    resolve: {
      title: "Flagged Queue Item Resolved",
      body: `${actorLabel} resolved ${formLabel} (${assetLabel}).`,
      severity: "high",
    },
  };
  const meta = eventMeta[eventType];

  const rows = enabledRecipients.map((recipientId) => ({
    recipient_id: recipientId,
    title: meta.title,
    body: meta.body,
    severity: meta.severity,
    kind: `flagged_queue_${eventType}`,
    entity_type: "form_submission_grade",
    entity_id: String(gradeId),
    dedupe_key: `flagged-queue:${eventId}:${recipientId}`,
  }));
  const { error: insertError } = await admin
    .from("user_notifications")
    .upsert(rows, { onConflict: "recipient_id,dedupe_key" });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: rows.length });
}
