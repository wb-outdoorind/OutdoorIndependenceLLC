import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/routeAccess";
import { isManagementRole } from "@/lib/roles";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import MaintenanceSchedulingClient from "../MaintenanceSchedulingClient";

type MaintenanceSchedulePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MaintenanceSchedulePage({ searchParams }: MaintenanceSchedulePageProps) {
  const session = await getCurrentUserProfile();
  if (!session?.user) {
    redirect("/login?next=%2Fmaintenance%2Fschedule");
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "maintenance_center")) {
    redirect("/not-authorized?reason=maintenance_requires_mechanic_or_higher&next=/maintenance/schedule");
  }
  if (!isManagementRole(role)) {
    redirect("/not-authorized?reason=maintenance_schedule_requires_management&next=/maintenance/schedule");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawFocus = resolvedSearchParams.focus;
  const focusRequestId = Array.isArray(rawFocus) ? rawFocus[0] : rawFocus;

  return (
    <MaintenanceSchedulingClient
      mode="manager"
      role={role}
      currentUserId={session.user.id}
      focusRequestId={typeof focusRequestId === "string" ? focusRequestId : null}
    />
  );
}
