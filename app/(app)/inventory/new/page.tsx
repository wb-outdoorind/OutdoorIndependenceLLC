import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import NewInventoryItemClient from "./NewInventoryItemClient";

export default async function InventoryNewPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";

  const canCreate = role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";

  if (!canCreate) {
    redirect("/not-authorized?reason=inventory_create_requires_manager_or_mechanic&next=/inventory");
  }

  return <NewInventoryItemClient />;
}
