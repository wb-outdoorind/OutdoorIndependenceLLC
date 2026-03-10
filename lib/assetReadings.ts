type SupabaseLikeClient = {
  from: (table: string) => unknown;
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

  const vehiclesTable = params.supabase.from("vehicles") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{
        error: { message?: string } | null;
      }>;
    };
  };

  const { data: vehicleRow, error: vehicleReadError } = await vehiclesTable
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

  const { error: vehicleUpdateError } = await vehiclesTable
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

  const equipmentTable = params.supabase.from("equipment") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{
        error: { message?: string } | null;
      }>;
    };
  };

  const { data: equipmentRow, error: equipmentReadError } = await equipmentTable
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

  const { error: equipmentUpdateError } = await equipmentTable
    .update({ current_hours: nextHours })
    .eq("id", params.equipmentId);

  if (equipmentUpdateError) {
    return { ok: false, message: equipmentUpdateError.message || "Failed to update equipment hours." };
  }

  return { ok: true, nextValue: nextHours };
}
