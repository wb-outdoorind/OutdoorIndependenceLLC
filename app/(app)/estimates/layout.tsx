import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfile } from "@/lib/supabase/server";

export default async function EstimatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUserProfile();

  if (!session?.user) {
    redirect("/login?next=%2Festimates");
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "estimates")) {
    redirect("/not-authorized?reason=estimates_requires_management_access&next=/");
  }

  return children;
}
