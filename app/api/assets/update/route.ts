import { NextResponse } from "next/server";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { isMechanicOrHigher } from "@/lib/roles";
import { normalizeEquipmentSeason } from "@/lib/equipmentSeason";
import { normalizeAssetLifecycleStatus } from "@/lib/assetLifecycleStatus";

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
  season?: "All" | "Summer" | "Winter";
  current_hours?: number | null;
  status?: string | null;
  external_id?: string | null;
};

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseTextField(
  value: unknown,
  opts: { maxLen: number; allowNull?: boolean }
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return opts.allowNull === false ? undefined : null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return opts.allowNull === false ? undefined : null;
  return trimmed.slice(0, opts.maxLen);
}

function parseNumberField(
  value: unknown,
  opts: { integer?: boolean; min?: number; max?: number }
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return undefined;
  if (opts.integer && !Number.isInteger(parsed)) return undefined;
  if (opts.min != null && parsed < opts.min) return undefined;
  if (opts.max != null && parsed > opts.max) return undefined;
  return parsed;
}

function normalizeVehiclePatch(value: unknown): { patch: MutableVehiclePatch; invalid: string[] } {
  const raw = asObject(value);
  if (!raw) return { patch: {}, invalid: ["patch"] };

  const patch: MutableVehiclePatch = {};
  const invalid: string[] = [];

  const name = parseTextField(raw.name, { maxLen: 160, allowNull: false });
  if (name !== undefined) patch.name = name;
  else if ("name" in raw) invalid.push("name");

  const type = parseTextField(raw.type, { maxLen: 80, allowNull: false });
  if (type !== undefined) patch.type = type;
  else if ("type" in raw) invalid.push("type");

  const make = parseTextField(raw.make, { maxLen: 120 });
  if (make !== undefined) patch.make = make;
  else if ("make" in raw) invalid.push("make");

  const model = parseTextField(raw.model, { maxLen: 120 });
  if (model !== undefined) patch.model = model;
  else if ("model" in raw) invalid.push("model");

  const year = parseNumberField(raw.year, { integer: true, min: 1900, max: 2200 });
  if (year !== undefined) patch.year = year;
  else if ("year" in raw) invalid.push("year");

  const plate = parseTextField(raw.plate, { maxLen: 40 });
  if (plate !== undefined) patch.plate = plate;
  else if ("plate" in raw) invalid.push("plate");

  const vin = parseTextField(raw.vin, { maxLen: 80 });
  if (vin !== undefined) patch.vin = vin;
  else if ("vin" in raw) invalid.push("vin");

  const fuel = parseTextField(raw.fuel, { maxLen: 80 });
  if (fuel !== undefined) patch.fuel = fuel;
  else if ("fuel" in raw) invalid.push("fuel");

  const oilType = parseTextField(raw.oil_type, { maxLen: 80 });
  if (oilType !== undefined) patch.oil_type = oilType;
  else if ("oil_type" in raw) invalid.push("oil_type");

  const mileage = parseNumberField(raw.mileage, { min: 0 });
  if (mileage !== undefined) patch.mileage = mileage;
  else if ("mileage" in raw) invalid.push("mileage");

  const statusRaw = parseTextField(raw.status, { maxLen: 80, allowNull: false });
  if (statusRaw !== undefined) {
    const status = normalizeAssetLifecycleStatus(statusRaw);
    if (!status) invalid.push("status");
    else patch.status = status;
  } else if ("status" in raw) {
    invalid.push("status");
  }

  const asset = parseTextField(raw.asset, { maxLen: 120 });
  if (asset !== undefined) patch.asset = asset;
  else if ("asset" in raw) invalid.push("asset");

  return { patch, invalid };
}

function normalizeEquipmentPatch(value: unknown): { patch: MutableEquipmentPatch; invalid: string[] } {
  const raw = asObject(value);
  if (!raw) return { patch: {}, invalid: ["patch"] };

  const patch: MutableEquipmentPatch = {};
  const invalid: string[] = [];

  const name = parseTextField(raw.name, { maxLen: 160, allowNull: false });
  if (name !== undefined) patch.name = name;
  else if ("name" in raw) invalid.push("name");

  const equipmentType = parseTextField(raw.equipment_type, { maxLen: 80, allowNull: false });
  if (equipmentType !== undefined) patch.equipment_type = equipmentType;
  else if ("equipment_type" in raw) invalid.push("equipment_type");

  const make = parseTextField(raw.make, { maxLen: 120 });
  if (make !== undefined) patch.make = make;
  else if ("make" in raw) invalid.push("make");

  const model = parseTextField(raw.model, { maxLen: 120 });
  if (model !== undefined) patch.model = model;
  else if ("model" in raw) invalid.push("model");

  const year = parseNumberField(raw.year, { integer: true, min: 1900, max: 2200 });
  if (year !== undefined) patch.year = year;
  else if ("year" in raw) invalid.push("year");

  const serialNumber = parseTextField(raw.serial_number, { maxLen: 120 });
  if (serialNumber !== undefined) patch.serial_number = serialNumber;
  else if ("serial_number" in raw) invalid.push("serial_number");

  const licensePlate = parseTextField(raw.license_plate, { maxLen: 40 });
  if (licensePlate !== undefined) patch.license_plate = licensePlate;
  else if ("license_plate" in raw) invalid.push("license_plate");

  const fuelType = parseTextField(raw.fuel_type, { maxLen: 80 });
  if (fuelType !== undefined) patch.fuel_type = fuelType;
  else if ("fuel_type" in raw) invalid.push("fuel_type");

  const oilType = parseTextField(raw.oil_type, { maxLen: 80 });
  if (oilType !== undefined) patch.oil_type = oilType;
  else if ("oil_type" in raw) invalid.push("oil_type");

  const seasonRaw = parseTextField(raw.season, { maxLen: 20, allowNull: false });
  if (seasonRaw !== undefined) {
    const season = normalizeEquipmentSeason(seasonRaw);
    if (!season) invalid.push("season");
    else patch.season = season;
  } else if ("season" in raw) {
    invalid.push("season");
  }

  const currentHours = parseNumberField(raw.current_hours, { min: 0 });
  if (currentHours !== undefined) patch.current_hours = currentHours;
  else if ("current_hours" in raw) invalid.push("current_hours");

  const statusRaw = parseTextField(raw.status, { maxLen: 80, allowNull: false });
  if (statusRaw !== undefined) {
    const status = normalizeAssetLifecycleStatus(statusRaw);
    if (!status) invalid.push("status");
    else patch.status = status;
  } else if ("status" in raw) {
    invalid.push("status");
  }

  const externalId = parseTextField(raw.external_id, { maxLen: 120 });
  if (externalId !== undefined) patch.external_id = externalId;
  else if ("external_id" in raw) invalid.push("external_id");

  return { patch, invalid };
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `assets-update:ip:${ip}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const role = session?.profile?.role ?? "employee";
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const actorLimit = await evaluateRateLimit({
    key: `assets-update:user:${session.user.id}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  if (!isMechanicOrHigher(role)) {
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
    const { patch, invalid } = normalizeVehiclePatch(body.patch);
    if (invalid.length) {
      return NextResponse.json(
        { error: `Invalid patch fields: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No valid vehicle fields to update" }, { status: 400 });
    }
    if (!(role === "owner" || role === "operations_manager")) {
      delete patch.asset;
      if (!Object.keys(patch).length) {
        return NextResponse.json({ error: "No editable fields for this role" }, { status: 403 });
      }
    }

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
    const { patch, invalid } = normalizeEquipmentPatch(body.patch);
    if (invalid.length) {
      return NextResponse.json(
        { error: `Invalid patch fields: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No valid equipment fields to update" }, { status: 400 });
    }
    if (!(role === "owner" || role === "operations_manager")) {
      delete patch.external_id;
      if (!Object.keys(patch).length) {
        return NextResponse.json({ error: "No editable fields for this role" }, { status: 403 });
      }
    }

    const { data, error } = await admin
      .from("equipment")
      .update(patch)
      .eq("id", id)
      .select("id,name,equipment_type,make,model,year,serial_number,license_plate,fuel_type,oil_type,season,current_hours,status,external_id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    return NextResponse.json({ asset: data });
  }

  return NextResponse.json({ error: "Invalid assetType" }, { status: 400 });
}
