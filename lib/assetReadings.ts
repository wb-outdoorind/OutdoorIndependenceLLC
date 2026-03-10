type SupabaseLikeClient = {
  from: (table: string) => any;
};

type SyncResult = {
  ok: boolean;
  message?: string;
  nextValue?: number;
};

function normalizeReading(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function syncVehicleMileageForward(params: {
  supabase: SupabaseLikeClient;
  vehicleId: string;
  mileage: number;
}): Promise<SyncResult> {
  const mileage = normalizeReading(params.mileage);
  if (mileage === null) return { ok: false, message: "Invalid mileage." };

  const { data: vehicleRow, error: vehicleReadError } = await params.supabase
    .from("vehicles")
    .select("mileage")
    .eq("id", params.vehicleId)
    .maybeSingle();

  if (vehicleReadError) {
    return { ok: false, message: vehicleReadError.message || "Failed to read current vehicle mileage." };
  }

  const existingMileage = Number(vehicleRow?.mileage ?? 0);
  const nextMileage =
    Number.isFinite(existingMileage) && existingMileage > 0
      ? Math.max(existingMileage, mileage)
      : mileage;

  const { error: vehicleUpdateError } = await params.supabase
    .from("vehicles")
    .update({ mileage: nextMileage })
    .eq("id", params.vehicleId);

  if (vehicleUpdateError) {
    return { ok: false, message: vehicleUpdateError.message || "Failed to update vehicle mileage." };
  }

  return { ok: true, nextValue: nextMileage };
}

export async function syncEquipmentHoursForward(params: {
  supabase: SupabaseLikeClient;
  equipmentId: string;
  hours: number;
}): Promise<SyncResult> {
  const hours = normalizeReading(params.hours);
  if (hours === null) return { ok: false, message: "Invalid hours." };

  const { data: equipmentRow, error: equipmentReadError } = await params.supabase
    .from("equipment")
    .select("current_hours")
    .eq("id", params.equipmentId)
    .maybeSingle();

  if (equipmentReadError) {
    return { ok: false, message: equipmentReadError.message || "Failed to read current equipment hours." };
  }

  const existingHours = Number(equipmentRow?.current_hours ?? 0);
  const nextHours =
    Number.isFinite(existingHours) && existingHours > 0
      ? Math.max(existingHours, hours)
      : hours;

  const { error: equipmentUpdateError } = await params.supabase
    .from("equipment")
    .update({ current_hours: nextHours })
    .eq("id", params.equipmentId);

  if (equipmentUpdateError) {
    return { ok: false, message: equipmentUpdateError.message || "Failed to update equipment hours." };
  }

  return { ok: true, nextValue: nextHours };
}
