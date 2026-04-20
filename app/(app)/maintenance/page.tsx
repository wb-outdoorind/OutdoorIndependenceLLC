import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import MaintenanceClient from "./MaintenanceClient";

export default async function MaintenanceQueuePage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) {
    redirect("/login?next=%2Fmaintenance");
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "maintenance_center")) {
    redirect("/not-authorized?reason=maintenance_requires_mechanic_or_higher&next=/maintenance");
  }

  const fullName =
    typeof session.profile?.full_name === "string"
      ? session.profile.full_name
      : null;
  const email =
    typeof session.profile?.email === "string"
      ? session.profile.email
      : session.user.email ?? null;

  return <MaintenanceClient role={role} fullName={fullName} email={email} mode="queue" />;
}
