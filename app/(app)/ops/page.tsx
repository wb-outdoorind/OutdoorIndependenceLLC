import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";

export default async function OpsPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";

  const canView = role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";
  if (!canView) {
    redirect("/not-authorized?reason=ops_requires_manager_or_mechanic&next=/");
  }

  redirect("/maintenance?section=operations");
}
