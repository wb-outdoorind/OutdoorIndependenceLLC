import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { canAccessRoute } from "@/lib/routeAccess";

export default async function OpsPage() {
  const session = await getCurrentUserProfile();
  const role = session?.effectiveRole ?? "employee";

  if (!canAccessRoute(role, "ops_dashboard")) {
    redirect("/not-authorized?reason=ops_requires_manager_or_mechanic&next=/");
  }

  redirect("/maintenance?section=operations");
}
