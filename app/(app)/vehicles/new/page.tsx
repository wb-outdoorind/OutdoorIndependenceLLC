import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { canAccessRoute } from "@/lib/routeAccess";
import NewVehicleClient from "./NewVehicleClient";

export default async function VehicleNewPage() {
  const session = await getCurrentUserProfile();
  const role = session?.effectiveRole ?? "employee";

  if (!canAccessRoute(role, "vehicles_create")) {
    redirect("/not-authorized?reason=vehicle_create_requires_manager_or_mechanic&next=/vehicles");
  }

  return <NewVehicleClient />;
}
