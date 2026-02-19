import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import NewVehicleClient from "./NewVehicleClient";

export default async function VehicleNewPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";

  const canCreate = role === "owner" || role === "office_admin" || role === "mechanic";

  if (!canCreate) {
    redirect("/not-authorized?reason=vehicle_create_requires_manager_or_mechanic&next=/vehicles");
  }

  return <NewVehicleClient />;
}
