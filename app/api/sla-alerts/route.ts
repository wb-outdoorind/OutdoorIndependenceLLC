import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { getApprovalSla, getFlaggedQueueSla, getMaintenanceRequestSla } from "@/lib/sla";

export const runtime = "nodejs";

type ProfileRow = {
  id: string;
  role: string | null;
  status: string | null;
};

type NotificationRow = {
  recipient_id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "high" | "critical";
  kind: string;
  entity_type: string;
  entity_id: string;
  dedupe_key: string;
};

type InspectionSlaRow = {
  id: string;
  vehicle_id: string;
  inspection_type: string | null;
  lead_approver_id: string | null;
  lead_approval_status: "pending" | "approved" | "rejected" | "not_requested" | null;
  lead_approval_requested_at: string | null;
};

type VehicleRequestRow = {
  id: string;
  vehicle_id: string;
  status: "Open" | "In Progress" | "Closed" | null;
  urgency: "Low" | "Medium" | "High" | "Urgent" | null;
  created_at: string;
};

type EquipmentRequestRow = {
  id: string;
  equipment_id: string;
  status: "Open" | "In Progress" | "Closed" | null;
  urgency: "Low" | "Medium" | "High" | "Urgent" | null;
  created_at: string;
};

type GradeRow = {
  id: number;
  form_type: string;
  form_id: string;
  submitted_at: string;
  accountability_flag: boolean;
  vehicle_id: string | null;
  equipment_id: string | null;
};

type ReviewRow = {
  grade_id: number;
  review_status: "open" | "in_review" | "resolved";
  created_at: string;
};

type SlaRunLogPayload = {
  runSource: "cron" | "manual";
  initiatedBy: string | null;
  success: boolean;
  skipped: boolean;
  dateKey?: string | null;
  approvalOverdue?: number;
  maintenanceOverdue?: number;
  flaggedOverdue?: number;
  notificationsAttempted?: number;
  errorMessage?: string | null;
  meta?: Record<string, unknown> | null;
};

function dateKey() {
  return new Date().toISOString().slice(0, 10);
}

function canManualRun(role: string | null | undefined) {
  return (
    role === "owner" ||
    role === "operations_manager" ||
    role === "office_admin" ||
    role === "mechanic"
  );
}

function roleSet(rows: ProfileRow[], roles: string[]) {
  const allowed = new Set(roles);
  return rows
    .filter((row) => row.status === "Active" && allowed.has((row.role ?? "").trim()))
    .map((row) => row.id);
}

function buildUniqueRecipients(recipientIds: Array<string | null | undefined>) {
  return Array.from(new Set(recipientIds.filter((id): id is string => Boolean(id))));
}

async function logSlaRun(payload: SlaRunLogPayload) {
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("sla_alert_run_logs").insert({
    run_source: payload.runSource,
    initiated_by: payload.initiatedBy,
    success: payload.success,
    skipped: payload.skipped,
    date_key: payload.dateKey ?? null,
    approval_overdue: payload.approvalOverdue ?? 0,
    maintenance_overdue: payload.maintenanceOverdue ?? 0,
    flagged_overdue: payload.flaggedOverdue ?? 0,
    notifications_attempted: payload.notificationsAttempted ?? 0,
    error_message: payload.errorMessage ?? null,
    meta: payload.meta ?? null,
  });
  if (error) {
    console.error("[sla-alerts] failed to write run log:", error.message);
  }
}

async function runSlaAlertScan() {
  const admin = createSupabaseAdmin();
  const todayKey = dateKey();
  const nowMs = Date.now();

  const [profilesRes, approvalsRes, vehicleReqRes, equipmentReqRes, gradesRes, reviewsRes] = await Promise.all([
    admin.from("profiles").select("id,role,status"),
    admin
      .from("inspections")
      .select("id,vehicle_id,inspection_type,lead_approver_id,lead_approval_status,lead_approval_requested_at")
      .eq("lead_approval_status", "pending")
      .not("lead_approval_requested_at", "is", null)
      .order("lead_approval_requested_at", { ascending: true })
      .limit(500),
    admin
      .from("maintenance_requests")
      .select("id,vehicle_id,status,urgency,created_at")
      .in("status", ["Open", "In Progress"])
      .order("created_at", { ascending: true })
      .limit(1000),
    admin
      .from("equipment_maintenance_requests")
      .select("id,equipment_id,status,urgency,created_at")
      .in("status", ["Open", "In Progress"])
      .order("created_at", { ascending: true })
      .limit(1000),
    admin
      .from("form_submission_grades")
      .select("id,form_type,form_id,submitted_at,accountability_flag,vehicle_id,equipment_id")
      .eq("accountability_flag", true)
      .order("submitted_at", { ascending: true })
      .limit(1500),
    admin
      .from("form_submission_grade_reviews")
      .select("grade_id,review_status,created_at")
      .in("review_status", ["open", "in_review"])
      .limit(1500),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (approvalsRes.error) throw new Error(approvalsRes.error.message);
  if (vehicleReqRes.error) throw new Error(vehicleReqRes.error.message);
  if (equipmentReqRes.error) throw new Error(equipmentReqRes.error.message);
  if (gradesRes.error) throw new Error(gradesRes.error.message);
  if (reviewsRes.error) throw new Error(reviewsRes.error.message);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const ownersAndOps = roleSet(profiles, ["owner", "operations_manager"]);
  const mechanics = roleSet(profiles, ["mechanic"]);
  const managementAndMechanic = buildUniqueRecipients([...ownersAndOps, ...mechanics]);

  const notifications: NotificationRow[] = [];
  const metrics = {
    approvalOverdue: 0,
    maintenanceOverdue: 0,
    flaggedOverdue: 0,
  };

  for (const row of (approvalsRes.data ?? []) as InspectionSlaRow[]) {
    const sla = getApprovalSla({
      requestedAt: row.lead_approval_requested_at,
      status: row.lead_approval_status ?? "pending",
      nowMs,
    });
    if (!sla || sla.level !== "overdue") continue;

    metrics.approvalOverdue += 1;
    const recipients = buildUniqueRecipients([row.lead_approver_id, ...ownersAndOps]);
    for (const recipientId of recipients) {
      notifications.push({
        recipient_id: recipientId,
        title: "SLA Overdue: Lead Approval",
        body: `${row.inspection_type ?? "Trip"} inspection for vehicle ${row.vehicle_id} is ${sla.text.toLowerCase()}.`,
        severity: "high",
        kind: "sla_lead_approval_overdue",
        entity_type: "inspection",
        entity_id: row.id,
        dedupe_key: `sla:lead-approval:${row.id}:${todayKey}`,
      });
    }
  }

  for (const row of (vehicleReqRes.data ?? []) as VehicleRequestRow[]) {
    const status = row.status === "In Progress" ? "In Progress" : "Open";
    const urgency = row.urgency ?? "Medium";
    const sla = getMaintenanceRequestSla({
      createdAt: row.created_at,
      status,
      urgency,
      nowMs,
    });
    if (!sla || sla.level !== "overdue") continue;

    metrics.maintenanceOverdue += 1;
    for (const recipientId of managementAndMechanic) {
      notifications.push({
        recipient_id: recipientId,
        title: "SLA Overdue: Vehicle Maintenance Request",
        body: `Vehicle ${row.vehicle_id} maintenance request (${urgency}) is ${sla.text.toLowerCase()}.`,
        severity: "high",
        kind: "sla_maintenance_request_overdue",
        entity_type: "maintenance_request",
        entity_id: row.id,
        dedupe_key: `sla:vehicle-request:${row.id}:${todayKey}`,
      });
    }
  }

  for (const row of (equipmentReqRes.data ?? []) as EquipmentRequestRow[]) {
    const status = row.status === "In Progress" ? "In Progress" : "Open";
    const urgency = row.urgency ?? "Medium";
    const sla = getMaintenanceRequestSla({
      createdAt: row.created_at,
      status,
      urgency,
      nowMs,
    });
    if (!sla || sla.level !== "overdue") continue;

    metrics.maintenanceOverdue += 1;
    for (const recipientId of managementAndMechanic) {
      notifications.push({
        recipient_id: recipientId,
        title: "SLA Overdue: Equipment Maintenance Request",
        body: `Equipment ${row.equipment_id} maintenance request (${urgency}) is ${sla.text.toLowerCase()}.`,
        severity: "high",
        kind: "sla_maintenance_request_overdue",
        entity_type: "equipment_maintenance_request",
        entity_id: row.id,
        dedupe_key: `sla:equipment-request:${row.id}:${todayKey}`,
      });
    }
  }

  const reviewByGrade = new Map<number, ReviewRow>();
  for (const review of (reviewsRes.data ?? []) as ReviewRow[]) {
    reviewByGrade.set(review.grade_id, review);
  }

  for (const row of (gradesRes.data ?? []) as GradeRow[]) {
    if (row.accountability_flag !== true) continue;
    const review = reviewByGrade.get(row.id);
    const reviewStatus = review?.review_status ?? "open";
    const sla = getFlaggedQueueSla({
      submittedAt: row.submitted_at,
      reviewStatus,
      reviewCreatedAt: review?.created_at ?? null,
      nowMs,
    });
    if (!sla || sla.level !== "overdue") continue;

    metrics.flaggedOverdue += 1;
    for (const recipientId of ownersAndOps) {
      notifications.push({
        recipient_id: recipientId,
        title: "SLA Overdue: Flagged Accountability Item",
        body: `Flagged ${row.form_type} #${row.form_id} is ${sla.text.toLowerCase()}.`,
        severity: "high",
        kind: "sla_flagged_queue_overdue",
        entity_type: "form_submission_grade",
        entity_id: String(row.id),
        dedupe_key: `sla:flagged-queue:${row.id}:${todayKey}`,
      });
    }
  }

  if (notifications.length) {
    const { error: upsertError } = await admin
      .from("user_notifications")
      .upsert(notifications, { onConflict: "recipient_id,dedupe_key" });
    if (upsertError) throw new Error(upsertError.message);
  }

  return {
    ok: true,
    dateKey: todayKey,
    metrics,
    notificationsAttempted: notifications.length,
  };
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await runSlaAlertScan();
    await logSlaRun({
      runSource: "cron",
      initiatedBy: null,
      success: true,
      skipped: false,
      dateKey: payload.dateKey,
      approvalOverdue: payload.metrics.approvalOverdue,
      maintenanceOverdue: payload.metrics.maintenanceOverdue,
      flaggedOverdue: payload.metrics.flaggedOverdue,
      notificationsAttempted: payload.notificationsAttempted,
    });
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to run SLA alert scan.";
    await logSlaRun({
      runSource: "cron",
      initiatedBy: null,
      success: false,
      skipped: false,
      dateKey: dateKey(),
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.profile?.role ?? null;
  if (!canManualRun(role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const payload = await runSlaAlertScan();
    await logSlaRun({
      runSource: "manual",
      initiatedBy: userId,
      success: true,
      skipped: false,
      dateKey: payload.dateKey,
      approvalOverdue: payload.metrics.approvalOverdue,
      maintenanceOverdue: payload.metrics.maintenanceOverdue,
      flaggedOverdue: payload.metrics.flaggedOverdue,
      notificationsAttempted: payload.notificationsAttempted,
    });
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to run SLA alert scan.";
    await logSlaRun({
      runSource: "manual",
      initiatedBy: userId,
      success: false,
      skipped: false,
      dateKey: dateKey(),
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
