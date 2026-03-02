import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as path from "path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

type Row = {
  "Item ID"?: string | number;
  "Item Name"?: string;
  Category?: string;
  Quantity?: string | number;
  "Minimum Quantity"?: string | number;
  Supplier?: string;
  "Supplier Link"?: string;
  Notes?: string;
  Location?: string;
};

type InventoryLocationPayload = {
  name: string;
};

type InventoryItemPayload = {
  id: string;
  external_id: string | null;
  name: string;
  category: string | null;
  quantity: number;
  minimum_quantity: number;
  location_id: string | null;
  supplier: string | null;
  supplier_link: string | null;
  notes: string | null;
  is_active: boolean;
};

type InventoryLocationRow = {
  id: string;
  name: string;
};

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return "";
}

async function readRowsFromExcel(xlsxPath: string): Promise<Row[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  for (let col = 1; col <= headerRow.cellCount; col += 1) {
    headers.push(cellToString(headerRow.getCell(col).value));
  }

  const rows: Row[] = [];
  for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum += 1) {
    const row = worksheet.getRow(rowNum);
    const out: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      if (!header) return;
      const value = cellToString(row.getCell(idx + 1).value);
      out[header] = value;
      if (value) hasValue = true;
    });
    if (hasValue) rows.push(out as Row);
  }
  return rows;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toInt(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;

  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? Number(v.replace(/,/g, "").trim())
      : NaN;

  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function toNullableText(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const xlsxPath = path.resolve(process.cwd(), "OI_APP_Inventory .xlsx");
  const rows = await readRowsFromExcel(xlsxPath);

  // 1) Upsert locations by unique location name.
  const locationNames = Array.from(
    new Set(
      rows
        .map((r) => String(r.Location ?? "").trim())
        .filter((name) => Boolean(name))
    )
  );

  if (locationNames.length) {
    const locationPayload: InventoryLocationPayload[] = locationNames.map((name) => ({ name }));
    const { error: locationUpsertError } = await supabase
      .from("inventory_locations")
      .upsert(locationPayload, { onConflict: "name" });

    if (locationUpsertError) throw locationUpsertError;
  }

  const locationIdByName = new Map<string, string>();

  if (locationNames.length) {
    const { data: locationRows, error: locationSelectError } = await supabase
      .from("inventory_locations")
      .select("id,name")
      .in("name", locationNames);

    if (locationSelectError) throw locationSelectError;

    for (const row of (locationRows ?? []) as InventoryLocationRow[]) {
      locationIdByName.set(row.name, row.id);
    }
  }

  // 2) Build inventory item payloads with unique slug IDs.
  const seen = new Map<string, number>();

  const itemPayload: InventoryItemPayload[] = rows
    .map((r) => {
      const itemName = String(r["Item Name"] ?? "").trim();
      if (!itemName) return null;

      let id = slugify(itemName);
      if (!id) id = "item";

      const count = (seen.get(id) ?? 0) + 1;
      seen.set(id, count);
      if (count > 1) id = `${id}_${count}`;

      const locationName = String(r.Location ?? "").trim();
      const locationId = locationName ? (locationIdByName.get(locationName) ?? null) : null;

      return {
        id,
        external_id: toNullableText(r["Item ID"]),
        name: itemName,
        category: toNullableText(r.Category),
        quantity: toInt(r.Quantity, 0),
        minimum_quantity: toInt(r["Minimum Quantity"], 0),
        location_id: locationId,
        supplier: toNullableText(r.Supplier),
        supplier_link: toNullableText(r["Supplier Link"]),
        notes: toNullableText(r.Notes),
        is_active: true,
      };
    })
    .filter((item): item is InventoryItemPayload => item !== null);

  if (!itemPayload.length) {
    console.log(`Imported ${locationNames.length} locations and 0 items.`);
    return;
  }

  const { error: itemUpsertError } = await supabase
    .from("inventory_items")
    .upsert(itemPayload, { onConflict: "id" });

  if (itemUpsertError) throw itemUpsertError;

  console.log(`Imported ${locationNames.length} locations and ${itemPayload.length} items.`);
}

main().catch((err) => {
  console.error("Inventory import failed:", err);
  process.exit(1);
});
