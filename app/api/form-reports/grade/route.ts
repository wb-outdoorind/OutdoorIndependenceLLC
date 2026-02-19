import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/supabase/server";

type GradePayload = {
  formType?: "inspection" | "vehicle_maintenance_request" | "equipment_maintenance_request";
  recordId?: string;
};

type GradeResult = {
  submittedAt: string;
  submittedBy: string | null;
  vehicleId: string | null;
  equipmentId: string | null;
  score: number;
  isComplete: boolean;
  hasNa: boolean;
  missingCount: number;
  missingFields: string[];
  accountabilityFlag: boolean;
  accountabilityReason: string | null;
  metadata: Record<string, unknown>;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function hasNaValue(value: unknown): boolean {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "na" || v === "n/a" || v === "not applicable";
  }
  if (Array.isArray(value)) return value.some((item) => hasNaValue(item));
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => hasNaValue(item));
  }
  return false;
}

function countInspectionFails(checklist: unknown) {
  if (!checklist || typeof checklist !== "object") return 0;
  const sections = (checklist as Record<string, unknown>).sections;
  if (!sections || typeof sections !== "object") return 0;

  let failCount = 0;
  for (const sectionValue of Object.values(sections as Record<string, unknown>)) {
    if (!sectionValue || typeof sectionValue !== "object") continue;
    const sec = sectionValue as Record<string, unknown>;
    if (sec.applicable !== true) continue;
    const items = sec.items;
    if (!items || typeof items !== "object") continue;
    for (const v of Object.values(items as Record<string, unknown>)) {
      if (typeof v === "string" && v.toLowerCase() === "fail") failCount += 1;
    }
  }

  const exiting = (checklist as Record<string, unknown>).exiting;
  if (exiting && typeof exiting === "object") {
    for (const v of Object.values(exiting as Record<string, unknown>)) {
      if (typeof v === "string" && v.toLowerCase() === "fail") failCount += 1;
    }
  }

  return failCount;
}

function readDescriptionField(description: string | null, key: string) {
  if (!description) return "";
  const line = description
    .split("\n")
    .find((raw) => raw.trim().toLowerCase().startsWith(`${key.toLowerCase()}:`));
  if (!line) return "";
  return line.slice(line.indexOf(":") + 1).trim();
}

function gradeInspectionRecord(row: {
  id: string;
  vehicle_id: string;
  created_at: string;
  checklist: unknown;
  overall_status: string | null;
}): GradeResult {
  const checklistObj =
    row.checklist && typeof row.checklist === "object"
      ? (row.checklist as Record<string, unknown>)
      : {};
  const missingFields: string[] = [];

  const teammate = typeof checklistObj.employee === "string" ? checklistObj.employee.trim() : "";
  const inspectionDate =
    typeof checklistObj.inspectionDate === "string" ? checklistObj.inspectionDate.trim() : "";
  const signature =
    typeof checklistObj.employeeSignature === "string"
      ? checklistObj.employeeSignature.trim()
      : "";
  if (!teammate) missingFields.push("Teammate");
  if (!inspectionDate) missingFields.push("Inspection Date");
  if (!signature) missingFields.push("Teammate Signature");

  const sections =
    checklistObj.sections && typeof checklistObj.sections === "object"
      ? (checklistObj.sections as Record<string, unknown>)
      : {};
  for (const [sectionId, sectionValue] of Object.entries(sections)) {
    if (!sectionValue || typeof sectionValue !== "object") continue;
    const sec = sectionValue as Record<string, unknown>;
    if (sec.applicable !== true) continue;
    const items =
      sec.items && typeof sec.items === "object"
        ? (sec.items as Record<string, unknown>)
        : {};
    for (const [itemKey, itemVal] of Object.entries(items)) {
      if (
        itemVal !== "pass" &&
        itemVal !== "fail" &&
        itemVal !== "na"
      ) {
        missingFields.push(`${sectionId}.${itemKey}`);
      }
    }
  }

  const exiting =
    checklistObj.exiting && typeof checklistObj.exiting === "object"
      ? (checklistObj.exiting as Record<string, unknown>)
      : {};
  for (const [itemKey, itemVal] of Object.entries(exiting)) {
    if (
      itemVal !== "pass" &&
      itemVal !== "fail" &&
      itemVal !== "na"
    ) {
      missingFields.push(`exiting.${itemKey}`);
    }
  }

  const hasNa = hasNaValue(checklistObj);
  const missingCount = missingFields.length;
  const isComplete = missingCount === 0;
  const score = clampScore(100 - missingCount * 20 - (hasNa ? 12 : 0));

  return {
    submittedAt: row.created_at,
    submittedBy: teammate || null,
    vehicleId: row.vehicle_id || null,
    equipmentId: null,
    score,
    isComplete,
    hasNa,
    missingCount,
    missingFields,
    accountabilityFlag: false,
    accountabilityReason: null,
    metadata: {
      overallStatus: row.overall_status ?? null,
      failCount: countInspectionFails(checklistObj),
    },
  };
}

async function maybeAccountabilityFlagForVehicleRequest(
  admin: ReturnType<typeof createSupabaseAdmin>,
  row: {
    id: string;
    vehicle_id: string;
    created_at: string;
    issue_identified_during: string | null;
    description: string | null;
  }
) {
  const reqCreated = new Date(row.created_at);
  if (Number.isNaN(reqCreated.getTime())) return { flag: false, reason: null as string | null };

  const { data: preTrips, error } = await admin
    .from("inspections")
    .select("id,created_at,checklist,overall_status")
    .eq("vehicle_id", row.vehicle_id)
    .eq("inspection_type", "Pre-Trip")
    .lte("created_at", row.created_at)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error || !preTrips?.length) return { flag: false, reason: null as string | null };

  const requestTeammate = readDescriptionField(row.description, "Teammate").toLowerCase();

  const matched = preTrips.find((trip) => {
    const tripAt = new Date(trip.created_at);
    if (Number.isNaN(tripAt.getTime())) return false;
    const hoursDiff = (reqCreated.getTime() - tripAt.getTime()) / (1000 * 60 * 60);
    if (hoursDiff < 0 || hoursDiff > 72) return false;

    const checklist = trip.checklist as Record<string, unknown> | null;
    const preTripTeammate =
      typeof checklist?.employee === "string"
        ? checklist.employee.trim().toLowerCase()
        : "";

    const teammateMatches =
      !requestTeammate || !preTripTeammate || requestTeammate === preTripTeammate;

    const failCount = countInspectionFails(checklist);
    return teammateMatches && (trip.overall_status ?? "") === "Pass" && failCount === 0;
  });

  if (!matched) return { flag: false, reason: null as string | null };

  const during = (row.issue_identified_during || "").trim();
  if (during === "Pre-Trip Inspection") {
    return { flag: false, reason: null as string | null };
  }

  return {
    flag: true,
    reason:
      "Maintenance issue was reported within 72h of a Passing pre-trip with no failed items.",
  };
}

async function gradeVehicleMaintenanceRequest(
  admin: ReturnType<typeof createSupabaseAdmin>,
  row: {
    id: string;
    vehicle_id: string;
    created_at: string;
    description: string | null;
    issue_identified_during: string | null;
    system_affected: string | null;
    urgency: string | null;
    drivability: string | null;
    unit_status: string | null;
  }
): Promise<GradeResult> {
  const missingFields: string[] = [];

  const title = readDescriptionField(row.description, "Title");
  const teammate = readDescriptionField(row.description, "Teammate");
  const requestDate = readDescriptionField(row.description, "Request Date");

  if (!title) missingFields.push("Title");
  if (!teammate) missingFields.push("Teammate");
  if (!requestDate) missingFields.push("Request Date");
  if (!(row.system_affected || "").trim()) missingFields.push("System Affected");
  if (!(row.urgency || "").trim()) missingFields.push("Urgency");
  if (!(row.drivability || "").trim()) missingFields.push("Drivability");
  if (!(row.unit_status || "").trim()) missingFields.push("Unit Status");
  if (!(row.issue_identified_during || "").trim()) missingFields.push("Issue Identified During");

  const hasNa = hasNaValue(row.description ?? "");
  const missingCount = missingFields.length;
  const isComplete = missingCount === 0;
  const score = clampScore(100 - missingCount * 16 - (hasNa ? 10 : 0));

  const accountability = await maybeAccountabilityFlagForVehicleRequest(admin, {
    id: row.id,
    vehicle_id: row.vehicle_id,
    created_at: row.created_at,
    issue_identified_during: row.issue_identified_during,
    description: row.description,
  });

  return {
    submittedAt: row.created_at,
    submittedBy: teammate || null,
    vehicleId: row.vehicle_id || null,
    equipmentId: null,
    score,
    isComplete,
    hasNa,
    missingCount,
    missingFields,
    accountabilityFlag: accountability.flag,
    accountabilityReason: accountability.reason,
    metadata: {
      systemAffected: row.system_affected ?? null,
      urgency: row.urgency ?? null,
      drivability: row.drivability ?? null,
    },
  };
}

function gradeEquipmentMaintenanceRequest(row: {
  id: string;
  equipment_id: string;
  created_at: string;
  description: string | null;
  issue_identified_during: string | null;
  system_affected: string | null;
  urgency: string | null;
  drivability: string | null;
  unit_status: string | null;
}): GradeResult {
  const missingFields: string[] = [];

  const title = readDescriptionField(row.description, "Title");
  const teammate = readDescriptionField(row.description, "Teammate");
  const requestDate = readDescriptionField(row.description, "Request Date");

  if (!title) missingFields.push("Title");
  if (!teammate) missingFields.push("Teammate");
  if (!requestDate) missingFields.push("Request Date");
  if (!(row.system_affected || "").trim()) missingFields.push("System Affected");
  if (!(row.urgency || "").trim()) missingFields.push("Urgency");
  if (!(row.drivability || "").trim()) missingFields.push("Drivability");
  if (!(row.unit_status || "").trim()) missingFields.push("Unit Status");
  if (!(row.issue_identified_during || "").trim()) missingFields.push("Issue Identified During");

  const hasNa = hasNaValue(row.description ?? "");
  const missingCount = missingFields.length;
  const isComplete = missingCount === 0;
  const score = clampScore(100 - missingCount * 16 - (hasNa ? 10 : 0));

  return {
    submittedAt: row.created_at,
    submittedBy: teammate || null,
    vehicleId: null,
    equipmentId: row.equipment_id || null,
    score,
    isComplete,
    hasNa,
    missingCount,
    missingFields,
    accountabilityFlag: false,
    accountabilityReason: null,
    metadata: {
      systemAffected: row.system_affected ?? null,
      urgency: row.urgency ?? null,
      drivability: row.drivability ?? null,
    },
  };
}

export async function POST(req: Request) {
  try {
    const session = await getCurrentUserProfile();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json()) as GradePayload;
    const formType = body.formType;
    const recordId = String(body.recordId || "").trim();
    if (!formType || !recordId) {
      return NextResponse.json({ error: "formType and recordId are required" }, { status: 400 });
    }

    const admin = createSupabaseAdmin();

    let grade: GradeResult | null = null;
    if (formType === "inspection") {
      const { data, error } = await admin
        .from("inspections")
        .select("id,vehicle_id,created_at,checklist,overall_status")
        .eq("id", recordId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
      grade = gradeInspectionRecord(data);
    } else if (formType === "vehicle_maintenance_request") {
      const { data, error } = await admin
        .from("maintenance_requests")
        .select(
          "id,vehicle_id,created_at,description,issue_identified_during,system_affected,urgency,drivability,unit_status"
        )
        .eq("id", recordId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: "Vehicle maintenance request not found" }, { status: 404 });
      grade = await gradeVehicleMaintenanceRequest(admin, data);
    } else if (formType === "equipment_maintenance_request") {
      const { data, error } = await admin
        .from("equipment_maintenance_requests")
        .select(
          "id,equipment_id,created_at,description,issue_identified_during,system_affected,urgency,drivability,unit_status"
        )
        .eq("id", recordId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: "Equipment maintenance request not found" }, { status: 404 });
      grade = gradeEquipmentMaintenanceRequest(data);
    } else {
      return NextResponse.json({ error: "Unsupported formType" }, { status: 400 });
    }

    const { error: upsertError } = await admin.from("form_submission_grades").upsert(
      {
        form_type: formType,
        form_id: recordId,
        submitted_at: grade.submittedAt,
        submitted_by: grade.submittedBy,
        vehicle_id: grade.vehicleId,
        equipment_id: grade.equipmentId,
        score: grade.score,
        is_complete: grade.isComplete,
        has_na: grade.hasNa,
        missing_count: grade.missingCount,
        missing_fields: grade.missingFields,
        accountability_flag: grade.accountabilityFlag,
        accountability_reason: grade.accountabilityReason,
        metadata: grade.metadata,
      },
      { onConflict: "form_type,form_id" }
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, grade });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to grade form";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
