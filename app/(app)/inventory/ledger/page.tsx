import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import InventoryLedgerClient from "./InventoryLedgerClient";

export default async function InventoryLedgerPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";

  const canView = role === "owner" || role === "office_admin" || role === "mechanic";
  if (!canView) {
    redirect("/not-authorized?reason=inventory_ledger_requires_manager_or_mechanic&next=/inventory");
  }

  return <InventoryLedgerClient />;
}
