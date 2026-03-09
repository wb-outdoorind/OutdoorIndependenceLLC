import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { writeServerAudit } from "@/lib/auditServer";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import {
  aggregateReviewStatus,
  canAccessPurchases,
  canApApprovePurchase,
  canCreatePurchaseRequest,
  canManagerApprovePurchase,
  coercePurchaseDecision,
  coercePurchaseReviewStatus,
  isPurchaseDepartment,
  isPurchaseMethod,
  isPurchaseTimeline,
  overallStatusFromReviews,
  timelineFromUrgency,
  type PurchaseMethod,
  type PurchaseOverallStatus,
  type PurchaseTimeline,
} from "@/lib/purchases";

export const runtime = "nodejs";

type LinkType = "vehicle" | "equipment";

type PurchaseRequestRow = {
  id: string;
  request_date: string;
  requested_by: string | null;
  requested_for_id: string | null;
  requested_for_name: string | null;
  department: string;
  vendor_name: string;
  estimated_total: number | string;
  timeline: string;
  reason: string;
  reimbursable: boolean;
  purchase_method_requested: string;
  purchase_method_other: string | null;
  maintenance_request_type: LinkType | null;
  maintenance_request_id: string | null;
  maintenance_log_type: LinkType | null;
  maintenance_log_id: string | null;
  asset_type: LinkType | null;
  asset_id: string | null;
  manager_status: string;
  manager_approved_at: string | null;
  manager_approved_by: string | null;
  manager_signature: string | null;
  manager_note: string | null;
  ap_status: string;
  ap_reviewed_at: string | null;
  ap_reviewed_by: string | null;
  ap_signature: string | null;
  ap_note: string | null;
  funds_available_date: string | null;
  ap_payment_method: string | null;
  ap_payment_method_other: string | null;
  ap_po_number: string | null;
  overall_status: PurchaseOverallStatus;
  created_at: string;
  updated_at: string;
};

type PurchaseRequestItemRow = {
  id: string;
  purchase_request_id: string;
  item_name: string;
  item_description: string | null;
  quantity: number | string;
  estimated_unit_cost: number | string | null;
  estimated_total: number | string | null;
  manager_decision: string;
  manager_note: string | null;
  ap_decision: string;
  ap_note: string | null;
  approved_payment_method: string | null;
  approved_payment_method_other: string | null;
  approved_po_number: string | null;
  funds_available_date: string | null;
  created_at: string;
  updated_at: string;
};

type PurchaseRequestAttachmentRow = {
  id: string;
  purchase_request_id: string;
  item_id: string | null;
  attachment_type: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
};

type PurchaseRequestVendorRow = {
  id: string;
  purchase_request_id: string;
  vendor_name: string;
  sort_order: number;
  created_at: string;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  middle_initial: string | null;
  last_name: string | null;
  nickname: string | null;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  status: string | null;
};

type ItemInput = {
  id?: string;
  name?: string;
  description?: string;
  quantity?: number | string;
  estimatedUnitCost?: number | string;
  estimatedTotal?: number | string;
};

type DecisionInput = {
  itemId?: string;
  decision?: string;
  note?: string;
};

type ApDecisionInput = DecisionInput & {
  approvedPaymentMethod?: string;
  approvedPaymentMethodOther?: string;
  approvedPoNumber?: string;
  fundsAvailableDate?: string;
};

type PurchasePrefill = {
  requestedForId: string | null;
  department: string | null;
  timeline: PurchaseTimeline | null;
  reason: string | null;
  itemName: string | null;
  itemDescription: string | null;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown) {
  const next = asString(value);
  return next ? next : null;
}

function asDateOrNull(value: unknown) {
  const next = asString(value);
  if (!next) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
}

function asMoney(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Number(n.toFixed(2)));
}

function asQuantity(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Number(n.toFixed(2));
}

function parseLinkType(value: unknown): LinkType | null {
  if (value === "vehicle" || value === "equipment") return value;
  return null;
}

function profileDisplayName(profile: ProfileRow) {
  const nickname = asString(profile.nickname);
  const firstName = asString(profile.first_name);
  const middle = asString(profile.middle_initial);
  const lastName = asString(profile.last_name);
  const fullName = asString(profile.full_name);
  const email = asString(profile.email);

  if (nickname) return nickname;
  if (firstName || lastName) return [firstName, middle, lastName].filter(Boolean).join(" ");
  if (fullName) return fullName;
  if (email) return email;
  return profile.id;
}

function mapRowsByRequestId<T extends { purchase_request_id: string }>(rows: T[]) {
  const out: Record<string, T[]> = {};
  for (const row of rows) {
    const key = row.purchase_request_id;
    if (!out[key]) out[key] = [];
    out[key].push(row);
  }
  return out;
}

function parseItems(raw: unknown): ItemInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => (row && typeof row === "object" ? (row as ItemInput) : {}));
}

function parseDecisionRows(raw: unknown): DecisionInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => (row && typeof row === "object" ? (row as DecisionInput) : {}));
}

function parseApDecisionRows(raw: unknown): ApDecisionInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => (row && typeof row === "object" ? (row as ApDecisionInput) : {}));
}

function parseVendors(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const dedupe = new Set<string>();
  const out: string[] = [];
  for (const row of raw) {
    let next = "";
    if (typeof row === "string") {
      next = row.trim();
    } else if (row && typeof row === "object") {
      next = asString((row as { name?: string }).name);
    }
    if (!next) continue;
    const dedupeKey = next.toLowerCase();
    if (dedupe.has(dedupeKey)) continue;
    dedupe.add(dedupeKey);
    out.push(next);
  }
  return out;
}

function normalizeItemInput(item: ItemInput, idx: number) {
  const name = asString(item.name);
  if (!name) throw new Error(`Item ${idx + 1} name is required.`);
  const quantity = asQuantity(item.quantity);
  const estimatedUnitCost = Number.isFinite(Number(item.estimatedUnitCost))
    ? asMoney(item.estimatedUnitCost, 0)
    : null;
  const estimatedTotal = Number.isFinite(Number(item.estimatedTotal))
    ? asMoney(item.estimatedTotal, 0)
    : estimatedUnitCost != null
      ? Number((estimatedUnitCost * quantity).toFixed(2))
      : null;

  return {
    item_name: name,
    item_description: asNullableString(item.description),
    quantity,
    estimated_unit_cost: estimatedUnitCost,
    estimated_total: estimatedTotal,
  };
}

async function lookupLinkedUrgency(
  admin: ReturnType<typeof createSupabaseAdmin>,
  maintenanceRequestType: LinkType | null,
  maintenanceRequestId: string | null
) {
  if (!maintenanceRequestType || !maintenanceRequestId) return null;
  if (maintenanceRequestType === "vehicle") {
    const { data } = await admin
      .from("maintenance_requests")
      .select("urgency")
      .eq("id", maintenanceRequestId)
      .maybeSingle();
    return asNullableString((data as { urgency?: string } | null)?.urgency);
  }
  const { data } = await admin
    .from("equipment_maintenance_requests")
    .select("urgency")
    .eq("id", maintenanceRequestId)
    .maybeSingle();
  return asNullableString((data as { urgency?: string } | null)?.urgency);
}

function parseTitleAndBody(raw: string | null) {
  if (!raw) return { title: null as string | null, body: null as string | null };
  const trimmed = raw.trim();
  if (!trimmed) return { title: null as string | null, body: null as string | null };
  const lines = trimmed.split("\n");
  const first = lines[0]?.trim() ?? "";

  let title: string | null = null;
  if (first.toLowerCase().startsWith("title:")) {
    title = asNullableString(first.slice("title:".length));
  }

  let body = trimmed;
  if (title) {
    body = lines.slice(2).join("\n").trim();
    if (!body) {
      body = lines.slice(1).join("\n").trim();
    }
  }

  return {
    title,
    body: asNullableString(body),
  };
}

function asSummarySnippet(value: string | null, max = 220) {
  const flat = asString(value).replace(/\s+/g, " ");
  if (!flat) return null;
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 3)}...`;
}

async function buildLinkedPrefill(
  admin: ReturnType<typeof createSupabaseAdmin>,
  context: {
    maintenanceRequestType: LinkType | null;
    maintenanceRequestId: string | null;
    maintenanceLogType: LinkType | null;
    maintenanceLogId: string | null;
  },
  fallbackTimeline: PurchaseTimeline
): Promise<Pick<PurchasePrefill, "timeline" | "reason" | "itemName" | "itemDescription">> {
  let linkedUrgency: string | null = null;
  let linkedReason: string | null = null;
  let linkedItemName: string | null = null;
  let linkedItemDescription: string | null = null;

  const maintenanceRequestType = context.maintenanceRequestType;
  const maintenanceRequestId = context.maintenanceRequestId;

  if (maintenanceRequestType && maintenanceRequestId) {
    if (maintenanceRequestType === "vehicle") {
      const { data } = await admin
        .from("maintenance_requests")
        .select("id,urgency,system_affected,description")
        .eq("id", maintenanceRequestId)
        .maybeSingle();
      const row = data as
        | {
            id?: string;
            urgency?: string;
            system_affected?: string;
            description?: string | null;
          }
        | null;
      linkedUrgency = asNullableString(row?.urgency);
      const system = asNullableString(row?.system_affected);
      const parsed = parseTitleAndBody(row?.description ?? null);
      const summary = asSummarySnippet(parsed.body);
      linkedReason = [
        `Linked vehicle maintenance request ${maintenanceRequestId}.`,
        system ? `System: ${system}.` : null,
        summary ? `Issue: ${summary}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      linkedItemName = system ? `${system} parts / repair` : "Replacement parts / repair";
      linkedItemDescription = parsed.title ?? summary;
    } else {
      const { data } = await admin
        .from("equipment_maintenance_requests")
        .select("id,urgency,system_affected,description")
        .eq("id", maintenanceRequestId)
        .maybeSingle();
      const row = data as
        | {
            id?: string;
            urgency?: string;
            system_affected?: string;
            description?: string | null;
          }
        | null;
      linkedUrgency = asNullableString(row?.urgency);
      const system = asNullableString(row?.system_affected);
      const parsed = parseTitleAndBody(row?.description ?? null);
      const summary = asSummarySnippet(parsed.body);
      linkedReason = [
        `Linked equipment maintenance request ${maintenanceRequestId}.`,
        system ? `System: ${system}.` : null,
        summary ? `Issue: ${summary}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      linkedItemName = system ? `${system} parts / repair` : "Replacement parts / repair";
      linkedItemDescription = parsed.title ?? summary;
    }
  }

  if (!linkedReason && context.maintenanceLogType && context.maintenanceLogId) {
    if (context.maintenanceLogType === "vehicle") {
      const { data } = await admin
        .from("maintenance_logs")
        .select("id,request_id,notes")
        .eq("id", context.maintenanceLogId)
        .maybeSingle();
      const row = data as { id?: string; request_id?: string | null; notes?: string | null } | null;
      const parsed = parseTitleAndBody(row?.notes ?? null);
      const summary = asSummarySnippet(parsed.body);
      linkedReason = [
        `Linked vehicle maintenance log ${context.maintenanceLogId}.`,
        parsed.title ? `Title: ${parsed.title}.` : null,
        summary ? `Details: ${summary}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      linkedItemName = parsed.title ? `Parts for ${parsed.title}` : "Replacement parts / repair";
      linkedItemDescription = summary ?? parsed.title ?? null;
      if (row?.request_id) {
        linkedUrgency = await lookupLinkedUrgency(admin, "vehicle", row.request_id);
      }
    } else {
      const { data } = await admin
        .from("equipment_maintenance_logs")
        .select("id,request_id,notes")
        .eq("id", context.maintenanceLogId)
        .maybeSingle();
      const row = data as { id?: string; request_id?: string | null; notes?: string | null } | null;
      const parsed = parseTitleAndBody(row?.notes ?? null);
      const summary = asSummarySnippet(parsed.body);
      linkedReason = [
        `Linked equipment maintenance log ${context.maintenanceLogId}.`,
        parsed.title ? `Title: ${parsed.title}.` : null,
        summary ? `Details: ${summary}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      linkedItemName = parsed.title ? `Parts for ${parsed.title}` : "Replacement parts / repair";
      linkedItemDescription = summary ?? parsed.title ?? null;
      if (row?.request_id) {
        linkedUrgency = await lookupLinkedUrgency(admin, "equipment", row.request_id);
      }
    }
  }

  return {
    timeline: timelineFromUrgency(linkedUrgency) ?? fallbackTimeline,
    reason: linkedReason,
    itemName: linkedItemName,
    itemDescription: linkedItemDescription,
  };
}

async function syncLinkedMaintenanceLogStatus(
  admin: ReturnType<typeof createSupabaseAdmin>,
  request: {
    maintenance_log_type: LinkType | null;
    maintenance_log_id: string | null;
  },
  status: string
) {
  if (!request.maintenance_log_type || !request.maintenance_log_id) return;
  if (request.maintenance_log_type === "vehicle") {
    await admin
      .from("maintenance_logs")
      .update({ status_update: status })
      .eq("id", request.maintenance_log_id);
    return;
  }
  await admin
    .from("equipment_maintenance_logs")
    .update({ status_update: status })
    .eq("id", request.maintenance_log_id);
}

async function notifyRoles(
  admin: ReturnType<typeof createSupabaseAdmin>,
  roles: string[],
  payload: {
    title: string;
    body: string;
    severity: "info" | "warning" | "critical";
    kind: string;
    entityType: string;
    entityId: string;
    dedupeKey: string;
  }
) {
  const { data: recipients, error: recipientsError } = await admin
    .from("profiles")
    .select("id")
    .in("role", roles);
  if (recipientsError) {
    console.error("Failed to load recipients for purchase notifications:", recipientsError);
    return;
  }
  const rows = (recipients ?? []) as Array<{ id: string }>;
  if (!rows.length) return;
  const { error: insertError } = await admin.from("user_notifications").upsert(
    rows.map((row) => ({
      recipient_id: row.id,
      title: payload.title,
      body: payload.body,
      severity: payload.severity,
      kind: payload.kind,
      entity_type: payload.entityType,
      entity_id: payload.entityId,
      dedupe_key: `${payload.dedupeKey}:${row.id}`,
    })),
    { onConflict: "recipient_id,dedupe_key" }
  );
  if (insertError) {
    console.error("Failed to insert purchase notifications:", insertError);
  }
}

export async function GET(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `purchases:get:ip:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.effectiveRole ?? "employee";
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessPurchases(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const actorLimit = evaluateRateLimit({
    key: `purchases:get:user:${userId}`,
    limit: 240,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const url = new URL(req.url);
  const id = asString(url.searchParams.get("id"));
  const statusFilter = asString(url.searchParams.get("status"));
  const maintenanceRequestType = parseLinkType(url.searchParams.get("maintenanceRequestType"));
  const maintenanceRequestId = asNullableString(url.searchParams.get("maintenanceRequestId"));
  const maintenanceLogType = parseLinkType(url.searchParams.get("maintenanceLogType"));
  const maintenanceLogId = asNullableString(url.searchParams.get("maintenanceLogId"));
  const assetType = parseLinkType(url.searchParams.get("assetType"));
  const assetId = asNullableString(url.searchParams.get("assetId"));
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 250;
  const includePrefill = asString(url.searchParams.get("prefill")) === "1";

  const admin = createSupabaseAdmin();
  let query = admin
    .from("purchase_requests")
    .select(
      "id,request_date,requested_by,requested_for_id,requested_for_name,department,vendor_name,estimated_total,timeline,reason,reimbursable,purchase_method_requested,purchase_method_other,maintenance_request_type,maintenance_request_id,maintenance_log_type,maintenance_log_id,asset_type,asset_id,manager_status,manager_approved_at,manager_approved_by,manager_signature,manager_note,ap_status,ap_reviewed_at,ap_reviewed_by,ap_signature,ap_note,funds_available_date,ap_payment_method,ap_payment_method_other,ap_po_number,overall_status,created_at,updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (id) query = query.eq("id", id);
  if (statusFilter) query = query.eq("overall_status", statusFilter);
  if (maintenanceRequestType && maintenanceRequestId) {
    query = query
      .eq("maintenance_request_type", maintenanceRequestType)
      .eq("maintenance_request_id", maintenanceRequestId);
  }
  if (maintenanceLogType && maintenanceLogId) {
    query = query
      .eq("maintenance_log_type", maintenanceLogType)
      .eq("maintenance_log_id", maintenanceLogId);
  }
  if (assetType && assetId) {
    query = query.eq("asset_type", assetType).eq("asset_id", assetId);
  }

  const { data: requestRows, error: requestError } = await query;
  if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });

  const requests = (requestRows ?? []) as PurchaseRequestRow[];
  const requestIds = requests.map((row) => row.id);

  let items: PurchaseRequestItemRow[] = [];
  let attachments: PurchaseRequestAttachmentRow[] = [];
  let vendors: PurchaseRequestVendorRow[] = [];
  if (requestIds.length > 0) {
    const [itemsRes, attachmentsRes, vendorsRes] = await Promise.all([
      admin
        .from("purchase_request_items")
        .select(
          "id,purchase_request_id,item_name,item_description,quantity,estimated_unit_cost,estimated_total,manager_decision,manager_note,ap_decision,ap_note,approved_payment_method,approved_payment_method_other,approved_po_number,funds_available_date,created_at,updated_at"
        )
        .in("purchase_request_id", requestIds)
        .order("created_at", { ascending: true }),
      admin
        .from("purchase_request_attachments")
        .select("id,purchase_request_id,item_id,attachment_type,file_name,storage_bucket,storage_path,uploaded_by,created_at")
        .in("purchase_request_id", requestIds)
        .order("created_at", { ascending: false }),
      admin
        .from("purchase_request_vendors")
        .select("id,purchase_request_id,vendor_name,sort_order,created_at")
        .in("purchase_request_id", requestIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
    if (attachmentsRes.error) return NextResponse.json({ error: attachmentsRes.error.message }, { status: 500 });
    if (vendorsRes.error) return NextResponse.json({ error: vendorsRes.error.message }, { status: 500 });

    items = (itemsRes.data ?? []) as PurchaseRequestItemRow[];
    attachments = (attachmentsRes.data ?? []) as PurchaseRequestAttachmentRow[];
    vendors = (vendorsRes.data ?? []) as PurchaseRequestVendorRow[];
  }

  const teammateRoles = ["owner", "operations_manager", "office_admin", "mechanic", "team_lead_1", "team_lead_2", "team_member_1", "team_member_2", "apprentice", "employee"];
  const { data: teammateRows, error: teammateError } = await admin
    .from("profiles")
    .select("id,first_name,middle_initial,last_name,nickname,full_name,email,role,department,status")
    .in("role", teammateRoles)
    .order("full_name", { ascending: true })
    .limit(1200);
  if (teammateError) return NextResponse.json({ error: teammateError.message }, { status: 500 });

  const teammates = ((teammateRows ?? []) as ProfileRow[]).map((row) => ({
    id: row.id,
    name: profileDisplayName(row),
    email: row.email,
    role: row.role,
    department: row.department,
    status: row.status,
  }));

  let prefill: PurchasePrefill | null = null;
  if (includePrefill) {
    const linkedPrefill = await buildLinkedPrefill(
      admin,
      {
        maintenanceRequestType,
        maintenanceRequestId,
        maintenanceLogType,
        maintenanceLogId,
      },
      "Standard (Within a week)"
    );
    prefill = {
      requestedForId: teammates.some((row) => row.id === userId) ? userId : null,
      department: isPurchaseDepartment(session?.profile?.department)
        ? session.profile.department
        : "Maintenance",
      timeline: linkedPrefill.timeline,
      reason: linkedPrefill.reason,
      itemName: linkedPrefill.itemName,
      itemDescription: linkedPrefill.itemDescription,
    };
  }

  return NextResponse.json({
    requests,
    itemsByRequestId: mapRowsByRequestId(items),
    attachmentsByRequestId: mapRowsByRequestId(attachments),
    vendorsByRequestId: mapRowsByRequestId(vendors),
    teammates,
    prefill,
  });
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `purchases:post:ip:${ip}`,
    limit: 50,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.effectiveRole ?? "employee";
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canCreatePurchaseRequest(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const actorLimit = evaluateRateLimit({
    key: `purchases:post:user:${userId}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const body = (await req.json().catch(() => ({}))) as {
    requestedForId?: string;
    department?: string;
    vendorName?: string;
    estimatedTotal?: number | string;
    timeline?: string;
    reason?: string;
    reimbursable?: boolean;
    purchaseMethodRequested?: string;
    purchaseMethodOther?: string;
    maintenanceRequestType?: LinkType;
    maintenanceRequestId?: string;
    maintenanceLogType?: LinkType;
    maintenanceLogId?: string;
    assetType?: LinkType;
    assetId?: string;
    vendors?: Array<{ name?: string } | string>;
    items?: ItemInput[];
  };

  const requestedForId = asNullableString(body.requestedForId);
  if (!requestedForId) {
    return NextResponse.json({ error: "Teammate Name is required." }, { status: 400 });
  }
  if (!isPurchaseDepartment(body.department)) {
    return NextResponse.json({ error: "Department is required." }, { status: 400 });
  }
  const normalizedVendors = parseVendors(body.vendors);
  const legacyVendorName = asNullableString(body.vendorName);
  if (legacyVendorName && !normalizedVendors.length) {
    normalizedVendors.push(legacyVendorName);
  }
  if (!normalizedVendors.length) {
    return NextResponse.json({ error: "Vendor/store name is required." }, { status: 400 });
  }
  const vendorName = normalizedVendors[0];
  const reason = asString(body.reason);
  if (!reason) {
    return NextResponse.json({ error: "Reason for purchase is required." }, { status: 400 });
  }
  if (!isPurchaseMethod(body.purchaseMethodRequested)) {
    return NextResponse.json({ error: "Purchase method is required." }, { status: 400 });
  }
  const purchaseMethodOther =
    body.purchaseMethodRequested === "Other" ? asNullableString(body.purchaseMethodOther) : null;
  if (body.purchaseMethodRequested === "Other" && !purchaseMethodOther) {
    return NextResponse.json({ error: "Please specify the purchase method." }, { status: 400 });
  }

  const rawItems = parseItems(body.items);
  if (!rawItems.length) {
    return NextResponse.json({ error: "At least one item is required." }, { status: 400 });
  }
  const normalizedItems = rawItems.map((row, idx) => normalizeItemInput(row, idx));
  const estimatedTotal = asMoney(body.estimatedTotal, 0);
  const maintenanceRequestType = parseLinkType(body.maintenanceRequestType);
  const maintenanceRequestId = asNullableString(body.maintenanceRequestId);
  const maintenanceLogType = parseLinkType(body.maintenanceLogType);
  const maintenanceLogId = asNullableString(body.maintenanceLogId);
  const assetType = parseLinkType(body.assetType);
  const assetId = asNullableString(body.assetId);

  const admin = createSupabaseAdmin();
  let requestedForName: string | null = null;
  if (requestedForId) {
    const { data: requestedForProfile } = await admin
      .from("profiles")
      .select("id,first_name,middle_initial,last_name,nickname,full_name,email,role,department,status")
      .eq("id", requestedForId)
      .maybeSingle();
    if (requestedForProfile) {
      requestedForName = profileDisplayName(requestedForProfile as ProfileRow);
    }
  }

  const linkedUrgency = await lookupLinkedUrgency(admin, maintenanceRequestType, maintenanceRequestId);
  const timeline = isPurchaseTimeline(body.timeline)
    ? body.timeline
    : timelineFromUrgency(linkedUrgency);

  const nowIso = new Date().toISOString();
  const payload = {
    requested_by: userId,
    requested_for_id: requestedForId,
    requested_for_name: requestedForName,
    department: body.department,
    vendor_name: vendorName,
    estimated_total: estimatedTotal,
    timeline: timeline as PurchaseTimeline,
    reason,
    reimbursable: body.reimbursable === true,
    purchase_method_requested: body.purchaseMethodRequested as PurchaseMethod,
    purchase_method_other: purchaseMethodOther,
    maintenance_request_type: maintenanceRequestType,
    maintenance_request_id: maintenanceRequestId,
    maintenance_log_type: maintenanceLogType,
    maintenance_log_id: maintenanceLogId,
    asset_type: assetType,
    asset_id: assetId,
    manager_status: "pending",
    ap_status: "pending",
    overall_status: "pending_manager_approval" as PurchaseOverallStatus,
    updated_at: nowIso,
  };

  const { data: createdRequest, error: createError } = await admin
    .from("purchase_requests")
    .insert(payload)
    .select(
      "id,request_date,requested_by,requested_for_id,requested_for_name,department,vendor_name,estimated_total,timeline,reason,reimbursable,purchase_method_requested,purchase_method_other,maintenance_request_type,maintenance_request_id,maintenance_log_type,maintenance_log_id,asset_type,asset_id,manager_status,manager_approved_at,manager_approved_by,manager_signature,manager_note,ap_status,ap_reviewed_at,ap_reviewed_by,ap_signature,ap_note,funds_available_date,ap_payment_method,ap_payment_method_other,ap_po_number,overall_status,created_at,updated_at"
    )
    .single();
  if (createError || !createdRequest) {
    return NextResponse.json({ error: createError?.message || "Failed to create purchase request." }, { status: 500 });
  }

  const requestRow = createdRequest as PurchaseRequestRow;
  const { error: vendorsInsertError } = await admin.from("purchase_request_vendors").insert(
    normalizedVendors.map((name, idx) => ({
      purchase_request_id: requestRow.id,
      vendor_name: name,
      sort_order: idx + 1,
    }))
  );
  if (vendorsInsertError) {
    await admin.from("purchase_requests").delete().eq("id", requestRow.id);
    return NextResponse.json({ error: vendorsInsertError.message }, { status: 500 });
  }

  const { error: itemsInsertError } = await admin.from("purchase_request_items").insert(
    normalizedItems.map((row) => ({
      purchase_request_id: requestRow.id,
      ...row,
      manager_decision: "pending",
      ap_decision: "pending",
    }))
  );
  if (itemsInsertError) {
    await admin.from("purchase_requests").delete().eq("id", requestRow.id);
    return NextResponse.json({ error: itemsInsertError.message }, { status: 500 });
  }

  await syncLinkedMaintenanceLogStatus(admin, requestRow, "Purchase Request Pending");

  const actorLabel =
    asString(session?.profile?.full_name) ||
    asString(session?.profile?.email) ||
    userId;
  const vendorSummary =
    normalizedVendors.length > 1 ? `${vendorName} (+${normalizedVendors.length - 1} more)` : vendorName;
  await notifyRoles(admin, ["owner", "operations_manager", "office_admin"], {
    title: "Purchase Request Pending Manager Approval",
    body: `${actorLabel} submitted a purchase request for ${vendorSummary}.`,
    severity: "warning",
    kind: "purchase_request_pending_manager",
    entityType: "purchase_request",
    entityId: requestRow.id,
    dedupeKey: `purchase:manager:${requestRow.id}`,
  });

  await writeServerAudit(admin, {
    actorId: userId,
    actorRole: role,
    action: "purchase_request_created",
    tableName: "purchase_requests",
    recordId: requestRow.id,
    eventType: "purchase_request_created",
    entityType: "purchase_request",
    entityId: requestRow.id,
    afterData: requestRow,
    meta: {
      itemCount: normalizedItems.length,
      linkedMaintenanceRequest: maintenanceRequestId,
      linkedMaintenanceLog: maintenanceLogId,
    },
  });

  return NextResponse.json({ request: requestRow });
}

export async function PATCH(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `purchases:patch:ip:${ip}`,
    limit: 80,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.effectiveRole ?? "employee";
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessPurchases(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const actorLimit = evaluateRateLimit({
    key: `purchases:patch:user:${userId}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    stage?: "manager" | "ap" | "complete";
    managerSignature?: string;
    managerNote?: string;
    managerDecisions?: DecisionInput[];
    apSignature?: string;
    apNote?: string;
    apDecisions?: ApDecisionInput[];
    fundsAvailableDate?: string;
    paymentMethod?: string;
    paymentMethodOther?: string;
    poNumber?: string;
  };

  const id = asString(body.id);
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const stage = body.stage;
  if (!stage) return NextResponse.json({ error: "stage is required." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: requestRowRaw, error: requestError } = await admin
    .from("purchase_requests")
    .select(
      "id,request_date,requested_by,requested_for_id,requested_for_name,department,vendor_name,estimated_total,timeline,reason,reimbursable,purchase_method_requested,purchase_method_other,maintenance_request_type,maintenance_request_id,maintenance_log_type,maintenance_log_id,asset_type,asset_id,manager_status,manager_approved_at,manager_approved_by,manager_signature,manager_note,ap_status,ap_reviewed_at,ap_reviewed_by,ap_signature,ap_note,funds_available_date,ap_payment_method,ap_payment_method_other,ap_po_number,overall_status,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });
  if (!requestRowRaw) return NextResponse.json({ error: "Purchase request not found." }, { status: 404 });

  const requestRow = requestRowRaw as PurchaseRequestRow;
  const { data: itemRowsRaw, error: itemRowsError } = await admin
    .from("purchase_request_items")
    .select(
      "id,purchase_request_id,item_name,item_description,quantity,estimated_unit_cost,estimated_total,manager_decision,manager_note,ap_decision,ap_note,approved_payment_method,approved_payment_method_other,approved_po_number,funds_available_date,created_at,updated_at"
    )
    .eq("purchase_request_id", requestRow.id)
    .order("created_at", { ascending: true });
  if (itemRowsError) return NextResponse.json({ error: itemRowsError.message }, { status: 500 });

  const itemRows = (itemRowsRaw ?? []) as PurchaseRequestItemRow[];
  const validItemIds = new Set(itemRows.map((row) => row.id));

  if (stage === "manager") {
    if (!canManagerApprovePurchase(role)) {
      return NextResponse.json({ error: "Only management roles can submit manager approval." }, { status: 403 });
    }

    const managerDecisions = parseDecisionRows(body.managerDecisions);
    if (!managerDecisions.length) {
      return NextResponse.json({ error: "Manager decisions are required." }, { status: 400 });
    }

    for (const row of managerDecisions) {
      const itemId = asString(row.itemId);
      if (!validItemIds.has(itemId)) {
        return NextResponse.json({ error: "Manager decision includes invalid item id." }, { status: 400 });
      }
      await admin
        .from("purchase_request_items")
        .update({
          manager_decision: coercePurchaseDecision(row.decision),
          manager_note: asNullableString(row.note),
        })
        .eq("id", itemId)
        .eq("purchase_request_id", requestRow.id);
    }

    const { data: refreshRowsRaw, error: refreshRowsError } = await admin
      .from("purchase_request_items")
      .select("id,manager_decision,ap_decision")
      .eq("purchase_request_id", requestRow.id);
    if (refreshRowsError) return NextResponse.json({ error: refreshRowsError.message }, { status: 500 });
    const refreshRows = (refreshRowsRaw ?? []) as Array<{ id: string; manager_decision: string; ap_decision: string }>;
    const managerStatus = aggregateReviewStatus(
      refreshRows.map((row) => coercePurchaseDecision(row.manager_decision))
    );
    if (managerStatus !== "pending" && !asString(body.managerSignature)) {
      return NextResponse.json({ error: "Manager e-signature is required." }, { status: 400 });
    }
    const nextOverall = overallStatusFromReviews(
      managerStatus,
      coercePurchaseReviewStatus(requestRow.ap_status)
    );

    const { data: updatedRequest, error: updateRequestError } = await admin
      .from("purchase_requests")
      .update({
        manager_status: managerStatus,
        manager_approved_at: managerStatus === "pending" ? null : new Date().toISOString(),
        manager_approved_by: managerStatus === "pending" ? null : userId,
        manager_signature: managerStatus === "pending" ? null : asNullableString(body.managerSignature),
        manager_note: asNullableString(body.managerNote),
        overall_status: nextOverall,
      })
      .eq("id", requestRow.id)
      .select(
        "id,request_date,requested_by,requested_for_id,requested_for_name,department,vendor_name,estimated_total,timeline,reason,reimbursable,purchase_method_requested,purchase_method_other,maintenance_request_type,maintenance_request_id,maintenance_log_type,maintenance_log_id,asset_type,asset_id,manager_status,manager_approved_at,manager_approved_by,manager_signature,manager_note,ap_status,ap_reviewed_at,ap_reviewed_by,ap_signature,ap_note,funds_available_date,ap_payment_method,ap_payment_method_other,ap_po_number,overall_status,created_at,updated_at"
      )
      .single();
    if (updateRequestError || !updatedRequest) {
      return NextResponse.json({ error: updateRequestError?.message || "Failed to update request." }, { status: 500 });
    }

    if (nextOverall === "pending_ap_approval") {
      const actorLabel = asString(session?.profile?.full_name) || asString(session?.profile?.email) || userId;
      await notifyRoles(admin, ["owner", "operations_manager", "office_admin"], {
        title: "Purchase Request Pending Accounts Payable",
        body: `${actorLabel} completed manager approval for purchase request ${requestRow.id}.`,
        severity: "warning",
        kind: "purchase_request_pending_ap",
        entityType: "purchase_request",
        entityId: requestRow.id,
        dedupeKey: `purchase:ap:${requestRow.id}`,
      });
    }

    await writeServerAudit(admin, {
      actorId: userId,
      actorRole: role,
      action: "purchase_request_manager_review",
      tableName: "purchase_requests",
      recordId: requestRow.id,
      eventType: "purchase_request_manager_review",
      entityType: "purchase_request",
      entityId: requestRow.id,
      beforeData: requestRow,
      afterData: updatedRequest,
      meta: {
        managerStatus,
      },
    });

    return NextResponse.json({ request: updatedRequest });
  }

  if (stage === "ap") {
    if (!canApApprovePurchase(role)) {
      return NextResponse.json({ error: "Only AP-capable roles can submit AP approval." }, { status: 403 });
    }

    const apDecisions = parseApDecisionRows(body.apDecisions);
    if (!apDecisions.length) {
      return NextResponse.json({ error: "AP decisions are required." }, { status: 400 });
    }

    const paymentMethod = asNullableString(body.paymentMethod);
    const paymentMethodOther = paymentMethod === "Other" ? asNullableString(body.paymentMethodOther) : null;
    if (paymentMethod && paymentMethod !== "Other" && !isPurchaseMethod(paymentMethod)) {
      return NextResponse.json({ error: "Invalid AP payment method." }, { status: 400 });
    }
    if (paymentMethod === "Other" && !paymentMethodOther) {
      return NextResponse.json({ error: "Specify AP payment method details for Other." }, { status: 400 });
    }

    const fundsAvailableDate = asDateOrNull(body.fundsAvailableDate);
    const poNumber = asNullableString(body.poNumber);

    for (const row of apDecisions) {
      const itemId = asString(row.itemId);
      if (!validItemIds.has(itemId)) {
        return NextResponse.json({ error: "AP decision includes invalid item id." }, { status: 400 });
      }
      const rowPaymentMethod = asNullableString(row.approvedPaymentMethod) ?? paymentMethod;
      const rowPaymentMethodOther =
        rowPaymentMethod === "Other"
          ? asNullableString(row.approvedPaymentMethodOther) ?? paymentMethodOther
          : null;
      if (rowPaymentMethod && rowPaymentMethod !== "Other" && !isPurchaseMethod(rowPaymentMethod)) {
        return NextResponse.json({ error: "Invalid item-level payment method." }, { status: 400 });
      }
      if (rowPaymentMethod === "Other" && !rowPaymentMethodOther) {
        return NextResponse.json({ error: "Specify item-level Other payment method details." }, { status: 400 });
      }

      await admin
        .from("purchase_request_items")
        .update({
          ap_decision: coercePurchaseDecision(row.decision),
          ap_note: asNullableString(row.note),
          approved_payment_method: rowPaymentMethod,
          approved_payment_method_other: rowPaymentMethodOther,
          approved_po_number: asNullableString(row.approvedPoNumber) ?? poNumber,
          funds_available_date: asDateOrNull(row.fundsAvailableDate) ?? fundsAvailableDate,
        })
        .eq("id", itemId)
        .eq("purchase_request_id", requestRow.id);
    }

    const { data: refreshRowsRaw, error: refreshRowsError } = await admin
      .from("purchase_request_items")
      .select("id,manager_decision,ap_decision")
      .eq("purchase_request_id", requestRow.id);
    if (refreshRowsError) return NextResponse.json({ error: refreshRowsError.message }, { status: 500 });
    const refreshRows = (refreshRowsRaw ?? []) as Array<{ id: string; manager_decision: string; ap_decision: string }>;

    const managerStatus = coercePurchaseReviewStatus(requestRow.manager_status);
    const apStatus = aggregateReviewStatus(refreshRows.map((row) => coercePurchaseDecision(row.ap_decision)));
    if (apStatus !== "pending" && !asString(body.apSignature)) {
      return NextResponse.json({ error: "AP e-signature is required." }, { status: 400 });
    }

    const nextOverall = overallStatusFromReviews(managerStatus, apStatus);
    const updatePayload = {
      ap_status: apStatus,
      ap_reviewed_at: apStatus === "pending" ? null : new Date().toISOString(),
      ap_reviewed_by: apStatus === "pending" ? null : userId,
      ap_signature: apStatus === "pending" ? null : asNullableString(body.apSignature),
      ap_note: asNullableString(body.apNote),
      funds_available_date: fundsAvailableDate,
      ap_payment_method: paymentMethod,
      ap_payment_method_other: paymentMethodOther,
      ap_po_number: poNumber,
      overall_status: nextOverall,
    };

    const { data: updatedRequest, error: updateRequestError } = await admin
      .from("purchase_requests")
      .update(updatePayload)
      .eq("id", requestRow.id)
      .select(
        "id,request_date,requested_by,requested_for_id,requested_for_name,department,vendor_name,estimated_total,timeline,reason,reimbursable,purchase_method_requested,purchase_method_other,maintenance_request_type,maintenance_request_id,maintenance_log_type,maintenance_log_id,asset_type,asset_id,manager_status,manager_approved_at,manager_approved_by,manager_signature,manager_note,ap_status,ap_reviewed_at,ap_reviewed_by,ap_signature,ap_note,funds_available_date,ap_payment_method,ap_payment_method_other,ap_po_number,overall_status,created_at,updated_at"
      )
      .single();
    if (updateRequestError || !updatedRequest) {
      return NextResponse.json({ error: updateRequestError?.message || "Failed to update request." }, { status: 500 });
    }

    const updatedRow = updatedRequest as PurchaseRequestRow;
    if (nextOverall === "approved" || nextOverall === "partially_approved") {
      await syncLinkedMaintenanceLogStatus(admin, updatedRow, "Purchase Request Approved");
    }

    await writeServerAudit(admin, {
      actorId: userId,
      actorRole: role,
      action: "purchase_request_ap_review",
      tableName: "purchase_requests",
      recordId: requestRow.id,
      eventType: "purchase_request_ap_review",
      entityType: "purchase_request",
      entityId: requestRow.id,
      beforeData: requestRow,
      afterData: updatedRequest,
      meta: {
        apStatus,
        paymentMethod,
        poNumber,
      },
    });

    return NextResponse.json({ request: updatedRequest });
  }

  if (stage === "complete") {
    if (!canAccessPurchases(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: updatedRequest, error: updateError } = await admin
      .from("purchase_requests")
      .update({ overall_status: "completed" })
      .eq("id", requestRow.id)
      .select(
        "id,request_date,requested_by,requested_for_id,requested_for_name,department,vendor_name,estimated_total,timeline,reason,reimbursable,purchase_method_requested,purchase_method_other,maintenance_request_type,maintenance_request_id,maintenance_log_type,maintenance_log_id,asset_type,asset_id,manager_status,manager_approved_at,manager_approved_by,manager_signature,manager_note,ap_status,ap_reviewed_at,ap_reviewed_by,ap_signature,ap_note,funds_available_date,ap_payment_method,ap_payment_method_other,ap_po_number,overall_status,created_at,updated_at"
      )
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ request: updatedRequest });
  }

  return NextResponse.json({ error: "Unsupported stage." }, { status: 400 });
}
