import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import MaintenanceSchedulingClient from "../MaintenanceSchedulingClient";

export default async function MaintenanceMyWorkPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) {
    redirect("/login?next=%2Fmaintenance%2Fmy-work");
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "maintenance_center")) {
    redirect("/not-authorized?reason=maintenance_requires_mechanic_or_higher&next=/maintenance/my-work");
  }

  return <MaintenanceSchedulingClient mode="mechanic" role={role} currentUserId={session.user.id} />;
}
