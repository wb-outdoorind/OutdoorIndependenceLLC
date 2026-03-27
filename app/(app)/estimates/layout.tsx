import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { isWilliamPlanningUser } from "@/lib/williamPlanningAccess";

export default async function EstimatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUserProfileStrict();

  if (!session?.user) {
    redirect("/login?next=%2Festimates");
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "estimates")) {
    redirect("/not-authorized?reason=estimates_requires_management_access&next=/");
  }

  if (!isWilliamPlanningUser(session.profile, session.user)) {
    redirect("/not-authorized?reason=william_only_estimates_shell&next=/");
  }

  return children;
}
