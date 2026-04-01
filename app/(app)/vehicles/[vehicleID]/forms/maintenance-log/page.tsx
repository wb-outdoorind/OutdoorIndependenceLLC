import { redirect } from "next/navigation";
import MaintenanceLogFormClient from "./MaintenanceLogFormClient";
import { getCurrentUserProfile } from "@/lib/supabase/server";

export default async function Page() {
  const session = await getCurrentUserProfile();
  const role = session?.effectiveRole ?? "employee";

  const canCreateLog =
    role === "owner" || role === "operations_manager" || role === "sales_manager" || role === "office_admin" || role === "mechanic";

  if (!canCreateLog) {
    redirect("/not-authorized?reason=employees_cannot_create_logs&next=/");
  }

  return <MaintenanceLogFormClient />;
}
