import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import MaintenanceClient from "../MaintenanceClient";

type MaintenanceDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MaintenanceDetailPage({ params }: MaintenanceDetailPageProps) {
  const session = await getCurrentUserProfile();
  if (!session?.user) {
    const nextId = encodeURIComponent((await params).id ?? "");
    redirect(`/login?next=%2Fmaintenance%2F${nextId}`);
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "maintenance_center")) {
    const nextId = encodeURIComponent((await params).id ?? "");
    redirect(`/not-authorized?reason=maintenance_requires_mechanic_or_higher&next=/maintenance/${nextId}`);
  }

  const fullName =
    typeof session.profile?.full_name === "string"
      ? session.profile.full_name
      : null;
  const email =
    typeof session.profile?.email === "string"
      ? session.profile.email
      : session.user.email ?? null;

  const { id } = await params;

  return (
    <MaintenanceClient
      role={role}
      fullName={fullName}
      email={email}
      mode="detail"
      requestId={decodeURIComponent(id)}
    />
  );
}
