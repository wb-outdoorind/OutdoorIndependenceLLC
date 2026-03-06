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

type Scope = "mine" | "all";

type HistoryItem = {
  key: string;
  formType: FormHistoryType;
  formLabel: string;
  createdAt: string;
  submittedBy: string | null;
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
};

type VehicleRequestRow = {
  id: string;
  created_at: string;
  vehicle_id: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  description: string | null;
};

type VehicleLogRow = {
  id: string;
  created_at: string;
  vehicle_id: string;
  status_update: string | null;
  notes: string | null;
};

type VehiclePmRow = {
  id: string;
  created_at: string;
  vehicle_id: string;
  notes: string | null;
  result: unknown;
};

type EquipmentRequestRow = {
  id: string;
  created_at: string;
  equipment_id: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  description: string | null;
};

type EquipmentLogRow = {
  id: string;
  created_at: string;
  equipment_id: string;
  status_update: string | null;
  notes: string | null;
};

type EquipmentPmRow = {
  id: string;
  created_at: string;
  equipment_id: string;
  notes: string | null;
  result: unknown;
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

function canViewFullHistory(role: string | null | undefined) {
  return FULL_HISTORY_ROLES.has((role ?? "").trim());
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

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
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

export async function GET(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `forms-history:ip:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const actorLimit = evaluateRateLimit({
    key: `forms-history:user:${session.user.id}`,
    limit: 300,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const url = new URL(req.url);
  const selectedTypes = parseTypes(url.searchParams.get("types"));

  const requestedScope = (url.searchParams.get("scope") || "mine").trim().toLowerCase();
  const role = session.profile?.role ?? null;
  const fullHistoryAllowed = canViewFullHistory(role);
  const scope: Scope = requestedScope === "all" && fullHistoryAllowed ? "all" : "mine";

  const profileName = normalizeIdentity(
    typeof session.profile?.full_name === "string" ? session.profile.full_name : null
  );
  const profileEmail = normalizeIdentity(
    typeof session.profile?.email === "string" ? session.profile.email : session.user.email ?? null
  );

  const ownIdentity = new Set<string>([profileName, profileEmail].filter(Boolean));
  if (profileName) {
    const firstName = profileName.split(/\s+/).filter(Boolean)[0];
    if (firstName) ownIdentity.add(firstName);
  }
  if (profileEmail.includes("@")) {
    const localPart = profileEmail.split("@")[0]?.trim();
    if (localPart) ownIdentity.add(localPart.toLowerCase());
  }
  const admin = createSupabaseAdmin();
  const items: HistoryItem[] = [];
  const perTypeLimit = 350;

  if (selectedTypes.has("pre_trip") || selectedTypes.has("post_trip")) {
    const { data, error } = await admin
      .from("inspections")
      .select("id,created_at,inspection_type,vehicle_id,checklist,overall_status")
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
      .select("id,created_at,vehicle_id,status,urgency,system_affected,description")
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
      .select("id,created_at,vehicle_id,status_update,notes")
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
      .select("id,created_at,vehicle_id,notes,result")
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
      .select("id,created_at,equipment_id,status,urgency,system_affected,description")
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
      .select("id,created_at,equipment_id,status_update,notes")
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
      .select("id,created_at,equipment_id,notes,result")
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
  if (scope === "mine") {
    scopedItems = items.filter((item) => {
      const who = normalizeIdentity(item.submittedBy);
      if (!who) return false;
      if (ownIdentity.has(who)) return true;
      for (const candidate of ownIdentity) {
        if (candidate.length < 3) continue;
        if (who.includes(candidate) || candidate.includes(who)) return true;
      }
      return false;
    });
  }

  const vehicleIds = Array.from(
    new Set(scopedItems.filter((item) => item.assetType === "vehicle").map((item) => item.assetId))
  );
  const equipmentIds = Array.from(
    new Set(scopedItems.filter((item) => item.assetType === "equipment").map((item) => item.assetId))
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

  const normalizedItems = scopedItems
    .map((item) => ({
      ...item,
      assetLabel:
        item.assetType === "vehicle"
          ? vehicleNameById.get(item.assetId) ?? item.assetId
          : equipmentNameById.get(item.assetId) ?? item.assetId,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 1000);

  return NextResponse.json({
    items: normalizedItems,
    meta: {
      scopeApplied: scope,
      canViewFullHistory: fullHistoryAllowed,
    },
  });
}
