import { redirect } from "next/navigation";
import { CrmMockDataProvider } from "@/components/crm/CrmMockDataProvider";
import { CRM_MOCK_CLIENTS } from "@/components/crm/mockData";
import { loadCrmClients } from "@/lib/crmPersistence";
import { canAccessRoute } from "@/lib/routeAccess";
import { createServerSupabase, getCurrentUserProfile } from "@/lib/supabase/server";

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

  const supabase = await createServerSupabase();
  const { clients, persistenceAvailable, error } = await loadCrmClients(supabase);

  if (error) {
    console.error("Failed to load CRM clients from Supabase, falling back to seeded mock clients.", error);
  }

  return (
    <CrmMockDataProvider
      initialClients={persistenceAvailable ? clients : CRM_MOCK_CLIENTS}
      clientsPersistenceMode={persistenceAvailable ? "supabase" : "mock"}
    >
      {children}
    </CrmMockDataProvider>
  );
}
