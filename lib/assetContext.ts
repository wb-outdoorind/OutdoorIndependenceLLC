import type { SupabaseClient } from "@supabase/supabase-js";

type MinimalClient = SupabaseClient;

export type VehicleContext = {
  id: string;
  name: string | null;
  type: string | null;
  mileage: number | null;
};

export type EquipmentContext = {
  id: string;
  name: string | null;
  equipment_type: string | null;
  current_hours: number | null;
};

export async function loadVehicleContext(
  supabase: MinimalClient,
  vehicleId: string
): Promise<{ data: VehicleContext | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("id,name,type,mileage")
    .eq("id", vehicleId)
    .maybeSingle();

  return {
    data: (data as VehicleContext | null) ?? null,
    error: (error as Error | null) ?? null,
  };
}

export async function loadEquipmentContext(
  supabase: MinimalClient,
  equipmentId: string
): Promise<{ data: EquipmentContext | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("equipment")
    .select("id,name,equipment_type,current_hours")
    .eq("id", equipmentId)
    .maybeSingle();

  return {
    data: (data as EquipmentContext | null) ?? null,
    error: (error as Error | null) ?? null,
  };
}
