import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as path from "path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

type Row = {
  "Equipment ID"?: string;
  "Equipment Name"?: string;
  "Equipment Type"?: string;
  "Make"?: string;
  "Model"?: string;
  "Year"?: number | string;
  "VIN / Serial #"?: string;
  "License Plate"?: string;
  "Fuel Type"?: string;
  "Current Mileage / Hours (If applicable)"?: number | string;
  "Status"?: string;
  "AssetQR"?: string;
  "Asset Type"?: string;
};

type EquipmentPayload = {
  id: string;
  external_id: string | null;
  name: string;
  equipment_type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  serial_number: string | null;
  license_plate: string | null;
  fuel_type: string | null;
  current_hours: number | null;
  status: string | null;
  asset_qr: string | null;
};

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? Number(v.replace(/,/g, "").trim())
      : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toYear(v: unknown): number | null {
  const n = toInt(v);
  if (!n) return null;
  if (n < 1900 || n > 2100) return null;
  return n;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const xlsxPath = path.resolve(process.cwd(), "OI_APP_Assets.xlsx");
  const wb = XLSX.readFile(xlsxPath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });

  const seen = new Map<string, number>();

  const payload = rows
    .filter((r) => String(r["Asset Type"] ?? "").trim().toLowerCase() === "equipment")
    .map((r) => {
      const name = String(r["Equipment Name"] ?? "").trim();
      if (!name) return null;

      let id = slugify(name);
      const count = (seen.get(id) ?? 0) + 1;
      seen.set(id, count);
      if (count > 1) id = `${id}_${count}`;

      const make = String(r["Make"] ?? "").trim() || null;
      const model = String(r["Model"] ?? "").trim() || null;
      const serial = String(r["VIN / Serial #"] ?? "").trim() || null;

      // If your "Make / Model / Year" column is a combined string, we can parse later if needed.
      const equipmentType = String(r["Equipment Type"] ?? "").trim() || null;

      return {
        id,
        external_id: String(r["Equipment ID"] ?? "").trim() || null,
        name,
        equipment_type: equipmentType,
        make,
        model,
        year: toYear(r["Year"]),
        serial_number: serial,
        license_plate: String(r["License Plate"] ?? "").trim() || null,
        fuel_type: String(r["Fuel Type"] ?? "").trim() || null,
        current_hours: toInt(r["Current Mileage / Hours (If applicable)"]),
        status: String(r["Status"] ?? "").trim() || null,
        asset_qr: String(r["AssetQR"] ?? "").trim() || null,
      };
    })
    .filter((value): value is EquipmentPayload => value !== null);

  if (!payload.length) {
    console.log("No equipment rows found to import.");
    return;
  }

  // Upsert by id (text PK)
  const { error } = await supabase.from("equipment").upsert(payload, { onConflict: "id" });
  if (error) throw error;

  console.log(`Imported ${payload.length} equipment rows.`);
  console.log("Sample IDs:", payload.slice(0, 10).map((p) => p.id).join(", "));
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
