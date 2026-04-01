import { NextResponse } from "next/server";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { writeServerAudit } from "@/lib/auditServer";

export const runtime = "nodejs";

const LEAD_ROLES = new Set([
  "owner",
  "operations_manager",
  "office_admin",
  "team_lead_1",
  "team_lead_2",
]);

type InspectionRow = {
  id: string | number;
  vehicle_id: string;
  inspection_type: string | null;
  mileage: number | null;
  created_at: string;
  lead_approver_id: string | null;
  lead_approval_status: "not_requested" | "pending" | "approved" | "rejected" | null;
  lead_approval_requested_at: string | null;
  lead_approved_at: string | null;
  lead_approved_by: string | null;
  lead_approval_note: string | null;
  checklist: Record<string, unknown> | null;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function labelForInspection(row: InspectionRow) {
  const typeLabel = row.inspection_type === "Post-Trip" ? "Post-Trip" : "Pre-Trip";
  return `${typeLabel} inspection #${row.id} for vehicle ${row.vehicle_id}`;
}

export async function GET(req: Request) {
  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.profile?.role ?? null;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!role || !LEAD_ROLES.has(role)) {
    return NextResponse.json({ isLead: false, pendingCount: 0, pending: [], rows: [] });
  }

  const url = new URL(req.url);
  const summaryOnly = url.searchParams.get("summary") === "1";

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("inspections")
    .select(
      "id,vehicle_id,inspection_type,mileage,created_at,lead_approver_id,lead_approval_status,lead_approval_requested_at,lead_approved_at,lead_approved_by,lead_approval_note,checklist"
    )
    .eq("lead_approver_id", userId)
    .in("lead_approval_status", ["pending", "approved", "rejected"])
    .order("lead_approval_requested_at", { ascending: false })
    .limit(summaryOnly ? 10 : 100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as InspectionRow[]).map((row) => {
    const checklist = row.checklist && typeof row.checklist === "object" ? row.checklist : {};
    const employee = asString((checklist as Record<string, unknown>).employee);
    const inspectionDate = asString((checklist as Record<string, unknown>).inspectionDate);
    return {
      id: String(row.id),
      vehicleId: row.vehicle_id,
      inspectionType: row.inspection_type ?? "Pre-Trip",
      mileage: row.mileage ?? null,
      createdAt: row.created_at,
      status: row.lead_approval_status ?? "pending",
      requestedAt: row.lead_approval_requested_at,
      approvedAt: row.lead_approved_at,
      approvedBy: row.lead_approved_by,
      note: row.lead_approval_note,
      teammateName: employee,
      inspectionDate,
    };
  });

  const pending = rows.filter((row) => row.status === "pending");
  if (summaryOnly) {
    return NextResponse.json({
      isLead: true,
      pendingCount: pending.length,
      pending: pending.slice(0, 3),
    });
  }

  return NextResponse.json({
    isLead: true,
    pendingCount: pending.length,
    pending,
    rows,
  });
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `lead-approvals-post:ip:${ip}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.profile?.role ?? null;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const actorLimit = await evaluateRateLimit({
    key: `lead-approvals-post:user:${userId}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const body = (await req.json().catch(() => ({}))) as {
    action?: "request" | "decide";
    inspectionId?: string | number;
    decision?: "approved" | "rejected";
    note?: string;
  };

  const inspectionId = String(body.inspectionId ?? "").trim();
  if (!inspectionId) return NextResponse.json({ error: "inspectionId is required" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: inspectionRow, error: inspectionError } = await admin
    .from("inspections")
    .select(
      "id,vehicle_id,inspection_type,mileage,created_at,lead_approver_id,lead_approval_status,lead_approval_requested_at,lead_approved_at,lead_approved_by,lead_approval_note,checklist"
    )
    .eq("id", inspectionId)
    .maybeSingle();

  if (inspectionError) return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  if (!inspectionRow) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });

  const row = inspectionRow as InspectionRow;
  const leadApproverId = row.lead_approver_id;

  if (body.action === "request") {
    if (!leadApproverId) {
      return NextResponse.json({ error: "No lead approver selected on this inspection." }, { status: 400 });
    }

    const title = `${row.inspection_type === "Post-Trip" ? "Post-Trip" : "Pre-Trip"} sign-off requested`;
    const checklistObj = row.checklist && typeof row.checklist === "object" ? row.checklist : {};
    const teammate = asString((checklistObj as Record<string, unknown>).employee) || "Unknown teammate";

    const { error: notifyError } = await admin.from("user_notifications").upsert(
      {
        recipient_id: leadApproverId,
        title,
        body: `${teammate} submitted ${labelForInspection(row)} and requested your sign-off.`,
        severity: "warning",
        kind: "trip_lead_signoff_request",
        entity_type: "inspection",
        entity_id: String(row.id),
        dedupe_key: `trip_lead_signoff_request:${row.id}:${leadApproverId}`,
      },
      { onConflict: "recipient_id,dedupe_key" }
    );
    if (notifyError) return NextResponse.json({ error: notifyError.message }, { status: 500 });

    await writeServerAudit(admin, {
      actorId: userId,
      actorRole: role,
      action: "lead_signoff_requested",
      tableName: "inspections",
      recordId: inspectionId,
      eventType: "inspection_lead_signoff_requested",
      entityType: "inspection",
      entityId: inspectionId,
      meta: { leadApproverId },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "decide") {
    const decision = body.decision;
    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json({ error: "decision must be approved or rejected" }, { status: 400 });
    }
    const canOverride = Boolean(
      role &&
        (role === "owner" || role === "operations_manager" || role === "sales_manager" || role === "office_admin")
    );
    if (!leadApproverId || (leadApproverId !== userId && !canOverride)) {
      return NextResponse.json({ error: "Not authorized to decide this sign-off." }, { status: 403 });
    }

    const patch = {
      lead_approval_status: decision,
      lead_approved_at: new Date().toISOString(),
      lead_approved_by: userId,
      lead_approval_note: asString(body.note) || null,
    };

    const { error: updateError } = await admin.from("inspections").update(patch).eq("id", inspectionId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await writeServerAudit(admin, {
      actorId: userId,
      actorRole: role,
      action: `lead_signoff_${decision}`,
      tableName: "inspections",
      recordId: inspectionId,
      eventType: "inspection_lead_signoff_decision",
      entityType: "inspection",
      entityId: inspectionId,
      afterData: patch,
      meta: { decision, note: asString(body.note) || null },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
