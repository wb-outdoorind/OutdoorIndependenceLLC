import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import InventoryReportsClient from "./InventoryReportsClient";

export default async function InventoryReportsPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";

  const canView = role === "owner" || role === "office_admin" || role === "mechanic";
  if (!canView) {
    redirect("/not-authorized?reason=inventory_reports_requires_manager_or_mechanic&next=/inventory");
  }

  return <InventoryReportsClient />;
}
