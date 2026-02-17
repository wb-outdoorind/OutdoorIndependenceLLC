import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import InventoryAlertsClient from "./InventoryAlertsClient";

export default async function InventoryAlertsPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";

  const canManage = role === "owner" || role === "office_admin" || role === "mechanic";
  if (!canManage) {
    redirect("/not-authorized?reason=inventory_alerts_requires_manager_or_mechanic&next=/inventory");
  }

  return <InventoryAlertsClient />;
}
