import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import FertilizingClient from "./FertilizingClient";

export default async function FertilizingOperationsPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) {
    redirect("/login?next=%2Ffertilizing");
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "fertilizing_operations")) {
    redirect("/not-authorized?reason=fertilizing_operations_requires_mechanic_or_higher&next=/fertilizing");
  }

  const fullName = (session.profile?.full_name ?? "").trim() || (session.user.email ?? "").trim();

  return <FertilizingClient fullName={fullName} />;
}
