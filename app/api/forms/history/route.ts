import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";

export const runtime = "nodejs";

type FormHistoryType =
  | "pre_trip"
  | "post_trip"
  | "vehicle_maintenance_request"
  | "vehicle_maintenance_log"
  | "vehicle_pm"
  | "equipment_maintenance_request"
  | "equipment_maintenance_log"
  | "equipment_pm";

type Scope = "mine" | "mine_plus_reports" | "all";

type HistoryItem = {
  key: string;
  formType: FormHistoryType;
  formLabel: string;
  createdAt: string;
  submittedBy: string | null;
  submittedByUserId: string | null;
  assetType: "vehicle" | "equipment";
  assetId: string;
  assetLabel: string;
  status: string | null;
  summary: string | null;
  href: string;
};

type InspectionRow = {
  id: string;
  created_at: string;
  inspection_type: string | null;
  vehicle_id: string;
  checklist: unknown;
  overall_status: string | null;
  submitted_by_user_id: string | null;
};

type VehicleRequestRow = {
  id: string;
  created_at: string;
  vehicle_id: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  description: string | null;
  submitted_by_user_id: string | null;
};

type VehicleLogRow = {
  id: string;
  created_at: string;
  vehicle_id: string;
  status_update: string | null;
  notes: string | null;
  submitted_by_user_id: string | null;
};

type VehiclePmRow = {
  id: string;
  created_at: string;
  vehicle_id: string;
  notes: string | null;
  result: unknown;
  submitted_by_user_id: string | null;
};

type EquipmentRequestRow = {
  id: string;
  created_at: string;
  equipment_id: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  description: string | null;
  submitted_by_user_id: string | null;
};

type EquipmentLogRow = {
  id: string;
  created_at: string;
  equipment_id: string;
  status_update: string | null;
  notes: string | null;
  submitted_by_user_id: string | null;
};

type EquipmentPmRow = {
  id: string;
  created_at: string;
  equipment_id: string;
  notes: string | null;
  result: unknown;
  submitted_by_user_id: string | null;
};

type IdentityProfileRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  nickname: string | null;
  email: string | null;
  department: string | null;
  role: string | null;
};

type CursorToken = {
  createdAt: string;
  key: string;
};

const ALL_TYPES: FormHistoryType[] = [
  "pre_trip",
  "post_trip",
  "vehicle_maintenance_request",
  "vehicle_maintenance_log",
  "vehicle_pm",
  "equipment_maintenance_request",
  "equipment_maintenance_log",
  "equipment_pm",
];

const FULL_HISTORY_ROLES = new Set([
  "owner",
  "operations_manager",
  "office_admin",
  "mechanic",
  "team_lead_1",
  "team_lead_2",
]);

const DIRECT_REPORT_SCOPE_ROLES = new Set([
  "owner",
  "operations_manager",
  "office_admin",
  "team_lead_1",
  "team_lead_2",
]);

const LEAD_ROLES = new Set(["team_lead_1", "team_lead_2"]);
const DIRECT_REPORT_FALLBACK_ROLES = ["apprentice", "team_member_1", "team_member_2"] as const;

function canViewFullHistory(role: string | null | undefined) {
  return FULL_HISTORY_ROLES.has((role ?? "").trim());
}

function canUseDirectReportsScope(role: string | null | undefined) {
  return DIRECT_REPORT_SCOPE_ROLES.has((role ?? "").trim());
}

function parseTypes(raw: string | null): Set<FormHistoryType> {
  if (!raw?.trim()) return new Set<FormHistoryType>(["pre_trip", "post_trip"]);
  if (raw.trim().toLowerCase() === "all") return new Set<FormHistoryType>(ALL_TYPES);

  const set = new Set<FormHistoryType>();
  for (const piece of raw.split(",")) {
    const value = piece.trim() as FormHistoryType;
    if (ALL_TYPES.includes(value)) set.add(value);
  }
  if (!set.size) {
    set.add("pre_trip");
    set.add("post_trip");
  }
  return set;
}

function parseLimit(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 100;
  const rounded = Math.trunc(parsed);
  if (rounded < 1) return 1;
  if (rounded > 250) return 250;
  return rounded;
}

function parseCursor(raw: string | null): CursorToken | null {
  if (!raw?.trim()) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as CursorToken;
    if (!parsed || typeof parsed.createdAt !== "string" || typeof parsed.key !== "string") return null;
    if (!parsed.createdAt.trim() || !parsed.key.trim()) return null;
    return { createdAt: parsed.createdAt, key: parsed.key };
  } catch {
    return null;
  }
}

function encodeCursor(item: Pick<HistoryItem, "createdAt" | "key">) {
  return Buffer.from(JSON.stringify({ createdAt: item.createdAt, key: item.key }), "utf8").toString("base64url");
}

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function addIdentityToken(set: Set<string>, value: string | null | undefined) {
  const normalized = normalizeIdentity(value);
  if (!normalized) return;
  set.add(normalized);
}

function addIdentityTokens(set: Set<string>, row: Partial<IdentityProfileRow>) {
  addIdentityToken(set, row.full_name);
  addIdentityToken(set, row.first_name);
  addIdentityToken(set, row.nickname);
  addIdentityToken(set, row.email);
  const email = normalizeIdentity(row.email);
  if (email.includes("@")) {
    addIdentityToken(set, email.split("@")[0] ?? "");
  }
}

function firstFieldValue(raw: string | null | undefined, keys: string[]) {
  if (!raw) return "";
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim().toLowerCase();
    if (!keys.some((k) => k.toLowerCase() === key)) continue;
    return trimmed.slice(idx + 1).trim();
  }
  return "";
}

function parseInspectionSubmittedBy(checklist: unknown) {
  if (!checklist || typeof checklist !== "object") return "";
  const employee = (checklist as Record<string, unknown>).employee;
  return typeof employee === "string" ? employee.trim() : "";
}

function parseVehiclePmSubmittedBy(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const root = result as Record<string, unknown>;
  const truckPm = root.truckPm;
  if (truckPm && typeof truckPm === "object") {
    const inspector = (truckPm as Record<string, unknown>).inspectorName;
    if (typeof inspector === "string" && inspector.trim()) return inspector.trim();
  }
  const fallback = root.inspectorName;
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
  return "";
}

function parseEquipmentPmSubmittedBy(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const root = result as Record<string, unknown>;
  const trailerPm = root.trailerPm;
  if (trailerPm && typeof trailerPm === "object") {
    const inspector = (trailerPm as Record<string, unknown>).inspector;
    if (typeof inspector === "string" && inspector.trim()) return inspector.trim();
  }
  const mowerPm = root.mowerPm;
  if (mowerPm && typeof mowerPm === "object") {
    const employee = (mowerPm as Record<string, unknown>).employee;
    if (typeof employee === "string" && employee.trim()) return employee.trim();
  }
  const applicatorPm = root.applicatorPm;
  if (applicatorPm && typeof applicatorPm === "object") {
    const inspector = (applicatorPm as Record<string, unknown>).inspector;
    if (typeof inspector === "string" && inspector.trim()) return inspector.trim();
  }
  const fallback = root.inspector;
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
  return "";
}

function parseLogSubmittedBy(notes: string | null | undefined) {
  return firstFieldValue(notes, ["Teammate", "Employee", "Inspector", "Mechanic", "Technician"]);
}

function formLabel(formType: FormHistoryType) {
  if (formType === "pre_trip") return "Pre-Trip";
  if (formType === "post_trip") return "Post-Trip";
  if (formType === "vehicle_maintenance_request") return "Vehicle Maintenance Request";
  if (formType === "vehicle_maintenance_log") return "Vehicle Maintenance Log";
  if (formType === "vehicle_pm") return "Vehicle PM";
  if (formType === "equipment_maintenance_request") return "Equipment Maintenance Request";
  if (formType === "equipment_maintenance_log") return "Equipment Maintenance Log";
  return "Equipment PM";
}

function encodeFocus(type: string, id: string) {
  const q = new URLSearchParams({ focusType: type, focusId: id });
  return q.toString();
}

function toMillis(value: string) {
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : 0;
}

function compareHistoryDesc(a: Pick<HistoryItem, "createdAt" | "key">, b: Pick<HistoryItem, "createdAt" | "key">) {
  const timeDelta = toMillis(b.createdAt) - toMillis(a.createdAt);
  if (timeDelta !== 0) return timeDelta;
  return b.key.localeCompare(a.key);
}

function shouldIncludeAfterCursor(item: Pick<HistoryItem, "createdAt" | "key">, cursor: CursorToken) {
  const itemTime = toMillis(item.createdAt);
  const cursorTime = toMillis(cursor.createdAt);
  if (itemTime < cursorTime) return true;
  if (itemTime > cursorTime) return false;
  return item.key < cursor.key;
}

export async function GET(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `forms-history:ip:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const actorLimit = await evaluateRateLimit({
    key: `forms-history:user:${session.user.id}`,
    limit: 300,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const url = new URL(req.url);
  const selectedTypes = parseTypes(url.searchParams.get("types"));
  const pageLimit = parseLimit(url.searchParams.get("limit"));
  const cursor = parseCursor(url.searchParams.get("cursor"));

  const requestedScope = (url.searchParams.get("scope") || "mine").trim().toLowerCase();
  const role = session.profile?.role ?? null;
  const fullHistoryAllowed = canViewFullHistory(role);
  const directReportsScopeAllowed = canUseDirectReportsScope(role);

  let scope: Scope = "mine";
  if (requestedScope === "all" && fullHistoryAllowed) {
    scope = "all";
  } else if (requestedScope === "mine_plus_reports" && fullHistoryAllowed && directReportsScopeAllowed) {
    scope = "mine_plus_reports";
  }

  const admin = createSupabaseAdmin();
  const scopedUserIds = new Set<string>([session.user.id]);
  const scopedIdentities = new Set<string>();

  addIdentityTokens(scopedIdentities, {
    full_name: typeof session.profile?.full_name === "string" ? session.profile.full_name : null,
    first_name: typeof session.profile?.first_name === "string" ? session.profile.first_name : null,
    nickname: typeof session.profile?.nickname === "string" ? session.profile.nickname : null,
    email:
      typeof session.profile?.email === "string" && session.profile.email.trim()
        ? session.profile.email
        : session.user.email ?? null,
  });

  if (scope === "mine_plus_reports") {
    const reportProfiles: IdentityProfileRow[] = [];

    const { data: directRows, error: directRowsError } = await admin
      .from("profiles")
      .select("id,full_name,first_name,nickname,email,department,role")
      .eq("manager_id", session.user.id)
      .limit(1000);

    if (directRowsError) {
      return NextResponse.json({ error: directRowsError.message }, { status: 500 });
    }

    for (const row of (directRows ?? []) as IdentityProfileRow[]) {
      if (!row.id || row.id === session.user.id) continue;
      reportProfiles.push(row);
    }

    if (!reportProfiles.length) {
      const actorDepartment =
        typeof session.profile?.department === "string" ? session.profile.department.trim() : "";
      const normalizedRole = (role ?? "").trim();
      if (
        actorDepartment &&
        (LEAD_ROLES.has(normalizedRole) ||
          normalizedRole === "office_admin" ||
          normalizedRole === "operations_manager")
      ) {
        const { data: fallbackRows, error: fallbackError } = await admin
          .from("profiles")
          .select("id,full_name,first_name,nickname,email,department,role")
          .eq("department", actorDepartment)
          .in("role", [...DIRECT_REPORT_FALLBACK_ROLES])
          .limit(1000);
        if (fallbackError) {
          return NextResponse.json({ error: fallbackError.message }, { status: 500 });
        }
        for (const row of (fallbackRows ?? []) as IdentityProfileRow[]) {
          if (!row.id || row.id === session.user.id) continue;
          reportProfiles.push(row);
        }
      }
    }

    for (const row of reportProfiles) {
      scopedUserIds.add(row.id);
      addIdentityTokens(scopedIdentities, row);
    }
  }

  const items: HistoryItem[] = [];
  const perTypeLimit = Math.max(300, Math.min(1600, pageLimit * 8));

  if (selectedTypes.has("pre_trip") || selectedTypes.has("post_trip")) {
    const { data, error } = await admin
      .from("inspections")
      .select("id,created_at,inspection_type,vehicle_id,checklist,overall_status,submitted_by_user_id")
      .in("inspection_type", ["Pre-Trip", "Post-Trip"])
      .order("created_at", { ascending: false })
      .limit(perTypeLimit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const row of (data ?? []) as InspectionRow[]) {
      const isPre = (row.inspection_type ?? "") === "Pre-Trip";
      const type: FormHistoryType = isPre ? "pre_trip" : "post_trip";
      if (!selectedTypes.has(type)) continue;
      const submittedBy = parseInspectionSubmittedBy(row.checklist) || null;
      items.push({
        key: `${type}:${row.id}`,
        formType: type,
        formLabel: formLabel(type),
        createdAt: row.created_at,
        submittedBy,
        submittedByUserId: row.submitted_by_user_id ?? null,
        assetType: "vehicle",
        assetId: row.vehicle_id,
        assetLabel: row.vehicle_id,
        status: row.overall_status,
        summary: null,
        href: `/vehicles/${encodeURIComponent(row.vehicle_id)}/history?${encodeFocus(isPre ? "Pre-Trip" : "Post-Trip", row.id)}`,
      });
    }
  }

  if (selectedTypes.has("vehicle_maintenance_request")) {
    const { data, error } = await admin
      .from("maintenance_requests")
      .select("id,created_at,vehicle_id,status,urgency,system_affected,description,submitted_by_user_id")
      .order("created_at", { ascending: false })
      .limit(perTypeLimit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const row of (data ?? []) as VehicleRequestRow[]) {
      const submittedBy = firstFieldValue(row.description, ["Teammate"]) || null;
      const title = firstFieldValue(row.description, ["Title"]);
      const summary = [
        row.urgency ? `Urgency: ${row.urgency}` : null,
        row.system_affected ? `System: ${row.system_affected}` : null,
      ]
        .filter(Boolean)
        .join(" • ");

      items.push({
        key: `vehicle_maintenance_request:${row.id}`,
        formType: "vehicle_maintenance_request",
        formLabel: formLabel("vehicle_maintenance_request"),
        createdAt: row.created_at,
        submittedBy,
        submittedByUserId: row.submitted_by_user_id ?? null,
        assetType: "vehicle",
        assetId: row.vehicle_id,
        assetLabel: row.vehicle_id,
        status: row.status,
        summary: title || summary || null,
        href: `/vehicles/${encodeURIComponent(row.vehicle_id)}/history?${encodeFocus("Maintenance Request", row.id)}`,
      });
    }
  }

  if (selectedTypes.has("vehicle_maintenance_log")) {
    const { data, error } = await admin
      .from("maintenance_logs")
      .select("id,created_at,vehicle_id,status_update,notes,submitted_by_user_id")
      .order("created_at", { ascending: false })
      .limit(perTypeLimit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const row of (data ?? []) as VehicleLogRow[]) {
      const submittedBy = parseLogSubmittedBy(row.notes) || null;
      const title = firstFieldValue(row.notes, ["Title"]);
      items.push({
        key: `vehicle_maintenance_log:${row.id}`,
        formType: "vehicle_maintenance_log",
        formLabel: formLabel("vehicle_maintenance_log"),
        createdAt: row.created_at,
        submittedBy,
        submittedByUserId: row.submitted_by_user_id ?? null,
        assetType: "vehicle",
        assetId: row.vehicle_id,
        assetLabel: row.vehicle_id,
        status: row.status_update,
        summary: title || null,
        href: `/vehicles/${encodeURIComponent(row.vehicle_id)}/history?${encodeFocus("Maintenance Log", row.id)}`,
      });
    }
  }

  if (selectedTypes.has("vehicle_pm")) {
    const { data, error } = await admin
      .from("vehicle_pm_events")
      .select("id,created_at,vehicle_id,notes,result,submitted_by_user_id")
      .order("created_at", { ascending: false })
      .limit(perTypeLimit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const row of (data ?? []) as VehiclePmRow[]) {
      const submittedBy = parseVehiclePmSubmittedBy(row.result) || null;
      const summary =
        row.result && typeof row.result === "object" && typeof (row.result as Record<string, unknown>).summary === "string"
          ? ((row.result as Record<string, unknown>).summary as string)
          : null;
      items.push({
        key: `vehicle_pm:${row.id}`,
        formType: "vehicle_pm",
        formLabel: formLabel("vehicle_pm"),
        createdAt: row.created_at,
        submittedBy,
        submittedByUserId: row.submitted_by_user_id ?? null,
        assetType: "vehicle",
        assetId: row.vehicle_id,
        assetLabel: row.vehicle_id,
        status: null,
        summary: summary || row.notes || null,
        href: `/vehicles/${encodeURIComponent(row.vehicle_id)}/history?${encodeFocus("Vehicle PM", row.id)}`,
      });
    }
  }

  if (selectedTypes.has("equipment_maintenance_request")) {
    const { data, error } = await admin
      .from("equipment_maintenance_requests")
      .select("id,created_at,equipment_id,status,urgency,system_affected,description,submitted_by_user_id")
      .order("created_at", { ascending: false })
      .limit(perTypeLimit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const row of (data ?? []) as EquipmentRequestRow[]) {
      const submittedBy = firstFieldValue(row.description, ["Teammate"]) || null;
      const title = firstFieldValue(row.description, ["Title"]);
      const summary = [
        row.urgency ? `Urgency: ${row.urgency}` : null,
        row.system_affected ? `System: ${row.system_affected}` : null,
      ]
        .filter(Boolean)
        .join(" • ");

      items.push({
        key: `equipment_maintenance_request:${row.id}`,
        formType: "equipment_maintenance_request",
        formLabel: formLabel("equipment_maintenance_request"),
        createdAt: row.created_at,
        submittedBy,
        submittedByUserId: row.submitted_by_user_id ?? null,
        assetType: "equipment",
        assetId: row.equipment_id,
        assetLabel: row.equipment_id,
        status: row.status,
        summary: title || summary || null,
        href: `/equipment/${encodeURIComponent(row.equipment_id)}/history?${encodeFocus("Maintenance Request", row.id)}`,
      });
    }
  }

  if (selectedTypes.has("equipment_maintenance_log")) {
    const { data, error } = await admin
      .from("equipment_maintenance_logs")
      .select("id,created_at,equipment_id,status_update,notes,submitted_by_user_id")
      .order("created_at", { ascending: false })
      .limit(perTypeLimit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const row of (data ?? []) as EquipmentLogRow[]) {
      const submittedBy = parseLogSubmittedBy(row.notes) || null;
      const title = firstFieldValue(row.notes, ["Title"]);
      items.push({
        key: `equipment_maintenance_log:${row.id}`,
        formType: "equipment_maintenance_log",
        formLabel: formLabel("equipment_maintenance_log"),
        createdAt: row.created_at,
        submittedBy,
        submittedByUserId: row.submitted_by_user_id ?? null,
        assetType: "equipment",
        assetId: row.equipment_id,
        assetLabel: row.equipment_id,
        status: row.status_update,
        summary: title || null,
        href: `/equipment/${encodeURIComponent(row.equipment_id)}/history?${encodeFocus("Maintenance Log", row.id)}`,
      });
    }
  }

  if (selectedTypes.has("equipment_pm")) {
    const { data, error } = await admin
      .from("equipment_pm_events")
      .select("id,created_at,equipment_id,notes,result,submitted_by_user_id")
      .order("created_at", { ascending: false })
      .limit(perTypeLimit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const row of (data ?? []) as EquipmentPmRow[]) {
      const submittedBy = parseEquipmentPmSubmittedBy(row.result) || null;
      const summary =
        row.result && typeof row.result === "object" && typeof (row.result as Record<string, unknown>).summary === "string"
          ? ((row.result as Record<string, unknown>).summary as string)
          : null;
      items.push({
        key: `equipment_pm:${row.id}`,
        formType: "equipment_pm",
        formLabel: formLabel("equipment_pm"),
        createdAt: row.created_at,
        submittedBy,
        submittedByUserId: row.submitted_by_user_id ?? null,
        assetType: "equipment",
        assetId: row.equipment_id,
        assetLabel: row.equipment_id,
        status: null,
        summary: summary || row.notes || null,
        href: `/equipment/${encodeURIComponent(row.equipment_id)}/history?${encodeFocus("Preventative Maintenance", row.id)}`,
      });
    }
  }

  let scopedItems = items;
  if (scope !== "all") {
    scopedItems = items.filter((item) => {
      if (item.submittedByUserId) {
        return scopedUserIds.has(item.submittedByUserId);
      }
      const who = normalizeIdentity(item.submittedBy);
      if (!who) return false;
      if (scopedIdentities.has(who)) return true;
      for (const candidate of scopedIdentities) {
        if (candidate.length < 3) continue;
        if (who.includes(candidate) || candidate.includes(who)) return true;
      }
      return false;
    });
  }

  const sortedItems = [...scopedItems].sort(compareHistoryDesc);
  const cursorItems = cursor
    ? sortedItems.filter((item) => shouldIncludeAfterCursor(item, cursor))
    : sortedItems;
  const pagedItems = cursorItems.slice(0, pageLimit);
  const hasMore = cursorItems.length > pagedItems.length;
  const nextCursor = hasMore && pagedItems.length ? encodeCursor(pagedItems[pagedItems.length - 1]) : null;

  const vehicleIds = Array.from(
    new Set(pagedItems.filter((item) => item.assetType === "vehicle").map((item) => item.assetId))
  );
  const equipmentIds = Array.from(
    new Set(pagedItems.filter((item) => item.assetType === "equipment").map((item) => item.assetId))
  );

  const vehicleNameById = new Map<string, string>();
  if (vehicleIds.length) {
    const { data: vehicles } = await admin
      .from("vehicles")
      .select("id,name,type")
      .in("id", vehicleIds);
    for (const row of (vehicles ?? []) as Array<{ id: string; name: string | null; type: string | null }>) {
      const title = row.name?.trim() || row.id;
      const type = row.type?.trim();
      vehicleNameById.set(row.id, type ? `${title} (${type})` : title);
    }
  }

  const equipmentNameById = new Map<string, string>();
  if (equipmentIds.length) {
    const { data: equipment } = await admin
      .from("equipment")
      .select("id,name,equipment_type")
      .in("id", equipmentIds);
    for (const row of (equipment ?? []) as Array<{ id: string; name: string | null; equipment_type: string | null }>) {
      const title = row.name?.trim() || row.id;
      const type = row.equipment_type?.trim();
      equipmentNameById.set(row.id, type ? `${title} (${type})` : title);
    }
  }

  const normalizedItems = pagedItems.map((item) => ({
    ...item,
    assetLabel:
      item.assetType === "vehicle"
        ? vehicleNameById.get(item.assetId) ?? item.assetId
        : equipmentNameById.get(item.assetId) ?? item.assetId,
  }));

  return NextResponse.json({
    items: normalizedItems,
    meta: {
      scopeApplied: scope,
      canViewFullHistory: fullHistoryAllowed,
      canUseDirectReportsScope: directReportsScopeAllowed,
      nextCursor,
    },
  });
}
