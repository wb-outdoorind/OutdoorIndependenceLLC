import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function fileText(relPath: string) {
  return readFileSync(path.join(root, relPath), "utf8");
}

function assertContains(content: string, needle: string, message: string) {
  assert.equal(
    content.includes(needle),
    true,
    message
  );
}

const vehicleReadingFiles = [
  "app/(app)/vehicles/[vehicleID]/forms/_components/InspectionForm.tsx",
  "app/(app)/vehicles/[vehicleID]/forms/maintenance-request/page.tsx",
  "app/(app)/vehicles/[vehicleID]/forms/maintenance-log/MaintenanceLogFormClient.tsx",
  "app/(app)/vehicles/[vehicleID]/forms/preventative-maintenance/page.tsx",
];

for (const relPath of vehicleReadingFiles) {
  const content = fileText(relPath);
  assertContains(
    content,
    "syncVehicleMileageForward",
    `Expected '${relPath}' to import/use syncVehicleMileageForward.`
  );
  assertContains(
    content,
    "syncVehicleMileageForward({",
    `Expected '${relPath}' to call syncVehicleMileageForward({...}).`
  );
}

const equipmentReadingFiles = [
  "app/(app)/equipment/[equipmentID]/forms/maintenance-request/page.tsx",
  "app/(app)/equipment/[equipmentID]/forms/maintenance-log/page.tsx",
  "app/(app)/equipment/[equipmentID]/forms/preventative-maintenance/page.tsx",
];

for (const relPath of equipmentReadingFiles) {
  const content = fileText(relPath);
  assertContains(
    content,
    "syncEquipmentHoursForward",
    `Expected '${relPath}' to import/use syncEquipmentHoursForward.`
  );
  assertContains(
    content,
    "syncEquipmentHoursForward(",
    `Expected '${relPath}' to call syncEquipmentHoursForward(...).`
  );
}

const migrationContent = fileText("supabase/migrations/0068_form_readings_rpc_sync.sql");
const expectedFunctions = [
  "sync_vehicle_mileage_forward",
  "sync_equipment_hours_forward",
  "security definer",
  "grant execute on function public.sync_vehicle_mileage_forward",
  "grant execute on function public.sync_equipment_hours_forward",
];

for (const tableName of expectedFunctions) {
  assertContains(
    migrationContent,
    tableName,
    `Expected mileage/hour sync migration to include '${tableName}'.`
  );
}

console.log("Reading sync coverage checks passed.");
