import { redirect } from "next/navigation";
import { CrmMockDataProvider } from "@/components/crm/CrmMockDataProvider";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfile } from "@/lib/supabase/server";

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUserProfile();

  if (!session?.user) {
    redirect("/login?next=%2Fcrm%2Fclients");
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "crm")) {
    redirect("/not-authorized?reason=crm_requires_management_access&next=/");
  }

  return <CrmMockDataProvider>{children}</CrmMockDataProvider>;
}
