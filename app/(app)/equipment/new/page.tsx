import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { canAccessRoute } from "@/lib/routeAccess";
import NewEquipmentClient from "./NewEquipmentClient";

export default async function EquipmentNewPage() {
  const session = await getCurrentUserProfile();
  const role = session?.effectiveRole ?? "employee";

  if (!canAccessRoute(role, "equipment_create")) {
    redirect("/not-authorized?reason=equipment_create_requires_manager_or_mechanic&next=/equipment");
  }

  return <NewEquipmentClient />;
}
