import { getCurrentUserProfile } from "@/lib/supabase/server";
import VehiclesListClient from "./VehiclesListClient";

export default async function VehiclesPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";
  const canCreateVehicle =
    role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";

  return <VehiclesListClient canCreateVehicle={canCreateVehicle} />;
}
