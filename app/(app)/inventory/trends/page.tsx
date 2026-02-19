import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import InventoryTrendsClient from "./InventoryTrendsClient";

export default async function InventoryTrendsPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";

  const canView = role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";
  if (!canView) {
    redirect("/not-authorized?reason=inventory_trends_requires_manager_or_mechanic&next=/inventory");
  }

  return <InventoryTrendsClient />;
}
