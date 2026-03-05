import { NextResponse } from "next/server";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type MutableVehiclePatch = {
  name?: string | null;
  type?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  plate?: string | null;
  vin?: string | null;
  fuel?: string | null;
  oil_type?: string | null;
  mileage?: number | null;
  status?: string | null;
  asset?: string | null;
};

type MutableEquipmentPatch = {
  name?: string | null;
  equipment_type?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  serial_number?: string | null;
  license_plate?: string | null;
  fuel_type?: string | null;
  oil_type?: string | null;
  current_hours?: number | null;
  status?: string | null;
  external_id?: string | null;
};

function canManageAssets(role: string | null | undefined) {
  const normalized = (role ?? "").trim().toLowerCase();
  return (
    normalized === "owner" ||
    normalized === "operations_manager" ||
    normalized === "office_admin" ||
    normalized === "mechanic"
  );
}

function normalizeVehiclePatch(value: unknown): MutableVehiclePatch {
  const raw = (value ?? {}) as Record<string, unknown>;
  const patch: MutableVehiclePatch = {};
  if ("name" in raw) patch.name = raw.name as string | null;
  if ("type" in raw) patch.type = raw.type as string | null;
  if ("make" in raw) patch.make = raw.make as string | null;
  if ("model" in raw) patch.model = raw.model as string | null;
  if ("year" in raw) patch.year = raw.year as number | null;
  if ("plate" in raw) patch.plate = raw.plate as string | null;
  if ("vin" in raw) patch.vin = raw.vin as string | null;
  if ("fuel" in raw) patch.fuel = raw.fuel as string | null;
  if ("oil_type" in raw) patch.oil_type = raw.oil_type as string | null;
  if ("mileage" in raw) patch.mileage = raw.mileage as number | null;
  if ("status" in raw) patch.status = raw.status as string | null;
  if ("asset" in raw) patch.asset = raw.asset as string | null;
  return patch;
}

function normalizeEquipmentPatch(value: unknown): MutableEquipmentPatch {
  const raw = (value ?? {}) as Record<string, unknown>;
  const patch: MutableEquipmentPatch = {};
  if ("name" in raw) patch.name = raw.name as string | null;
  if ("equipment_type" in raw) patch.equipment_type = raw.equipment_type as string | null;
  if ("make" in raw) patch.make = raw.make as string | null;
  if ("model" in raw) patch.model = raw.model as string | null;
  if ("year" in raw) patch.year = raw.year as number | null;
  if ("serial_number" in raw) patch.serial_number = raw.serial_number as string | null;
  if ("license_plate" in raw) patch.license_plate = raw.license_plate as string | null;
  if ("fuel_type" in raw) patch.fuel_type = raw.fuel_type as string | null;
  if ("oil_type" in raw) patch.oil_type = raw.oil_type as string | null;
  if ("current_hours" in raw) patch.current_hours = raw.current_hours as number | null;
  if ("status" in raw) patch.status = raw.status as string | null;
  if ("external_id" in raw) patch.external_id = raw.external_id as string | null;
  return patch;
}

export async function POST(req: Request) {
  const session = await getCurrentUserProfileStrict();
  const role = session?.effectiveRole ?? "employee";
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canManageAssets(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    assetType?: "vehicle" | "equipment";
    id?: string;
    patch?: unknown;
  };

  const assetType = body.assetType;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!assetType || !id) {
    return NextResponse.json({ error: "assetType and id are required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  if (assetType === "vehicle") {
    const patch = normalizeVehiclePatch(body.patch);
    const { data, error } = await admin
      .from("vehicles")
      .update(patch)
      .eq("id", id)
      .select("id,name,type,make,model,year,vin,plate,fuel,oil_type,mileage,status,asset")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    return NextResponse.json({ asset: data });
  }

  if (assetType === "equipment") {
    const patch = normalizeEquipmentPatch(body.patch);
    const { data, error } = await admin
      .from("equipment")
      .update(patch)
      .eq("id", id)
      .select("id,name,equipment_type,make,model,year,serial_number,license_plate,fuel_type,oil_type,current_hours,status,external_id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    return NextResponse.json({ asset: data });
  }

  return NextResponse.json({ error: "Invalid assetType" }, { status: 400 });
}
