import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

function canManageMaintenance(role: string | null | undefined) {
  const normalized = (role ?? "").trim().toLowerCase();
  return (
    normalized === "owner" ||
    normalized === "operations_manager" ||
    normalized === "office_admin" ||
    normalized === "mechanic"
  );
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T12:00:00.000Z`);
  return Number.isFinite(ms);
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function patchResultDate(result: unknown, date: string) {
  const next = asObject(result);
  let touched = false;

  const setNestedDate = (sectionKey: string, fieldKey: string) => {
    if (!(sectionKey in next)) return;
    const section = asObject(next[sectionKey]);
    section[fieldKey] = date;
    next[sectionKey] = section;
    touched = true;
  };

  setNestedDate("truckPm", "inspectionDate");
  setNestedDate("trailerPm", "inspectionDate");
  setNestedDate("mowerPm", "date");
  setNestedDate("applicatorPm", "date");

  if (!touched) {
    next.inspectionDate = date;
  }

  return next;
}

type RequestBody = {
  assetType?: "vehicle" | "equipment";
  assetId?: string;
  eventId?: string;
  date?: string;
};

export async function POST(req: Request) {
  const session = await getCurrentUserProfileStrict();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const role = session.profile?.role ?? session.effectiveRole ?? null;
  if (!canManageMaintenance(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const assetType = body.assetType;
  const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const date = typeof body.date === "string" ? body.date.trim() : "";

  if (!assetType || !assetId || !eventId || !date) {
    return NextResponse.json(
      { error: "assetType, assetId, eventId, and date are required." },
      { status: 400 }
    );
  }
  if (assetType !== "vehicle" && assetType !== "equipment") {
    return NextResponse.json({ error: "Invalid assetType." }, { status: 400 });
  }
  if (!isValidIsoDate(date)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const createdAt = `${date}T12:00:00.000Z`;

  if (assetType === "vehicle") {
    const { data: row, error: readError } = await admin
      .from("vehicle_pm_events")
      .select("id,result")
      .eq("id", eventId)
      .eq("vehicle_id", assetId)
      .maybeSingle();
    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "PM event not found." }, { status: 404 });
    }

    const { error: updateError } = await admin
      .from("vehicle_pm_events")
      .update({
        created_at: createdAt,
        result: patchResultDate(row.result, date),
      })
      .eq("id", eventId)
      .eq("vehicle_id", assetId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { data: row, error: readError } = await admin
      .from("equipment_pm_events")
      .select("id,result")
      .eq("id", eventId)
      .eq("equipment_id", assetId)
      .maybeSingle();
    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "PM event not found." }, { status: 404 });
    }

    const { error: updateError } = await admin
      .from("equipment_pm_events")
      .update({
        created_at: createdAt,
        result: patchResultDate(row.result, date),
      })
      .eq("id", eventId)
      .eq("equipment_id", assetId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, date, createdAt });
}
