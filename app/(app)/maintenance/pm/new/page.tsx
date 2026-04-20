import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { canAccessRoute } from "@/lib/routeAccess";
import NewPmLauncherClient from "./NewPmLauncherClient";

export default async function NewPmLauncherPage() {
  const session = await getCurrentUserProfile();
  const role = session?.effectiveRole ?? "employee";

  if (!canAccessRoute(role, "ops_dashboard")) {
    redirect("/not-authorized?reason=pm_launcher_requires_manager_or_mechanic&next=/maintenance/operations");
  }

  return <NewPmLauncherClient role={role} />;
}
