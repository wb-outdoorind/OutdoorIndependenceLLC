import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import InventoryTransfersClient from "./InventoryTransfersClient";

export default async function InventoryTransfersPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";

  const canTransfer = role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";
  if (!canTransfer) {
    redirect("/not-authorized?reason=inventory_transfer_requires_manager_or_mechanic&next=/inventory");
  }

  return <InventoryTransfersClient />;
}
